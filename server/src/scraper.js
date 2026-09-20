import { chromium } from "playwright";
import { config } from "./config.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const retryable = error => /timeout|net::|ECONN|HTTP 5|Target page|price block|sandbox/i.test(String(error.message));

export function parseMoney(value) {
  if (!value) throw new Error("Price text was empty");
  // Normalize full-width Unicode characters (e.g. â‚¹ï¼”,ï¼–ï¼ï¼”) and strip zero-width chars
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  const match = text.match(/\d[\d.,]*/);
  if (!match) throw new Error(`Invalid price text: ${value}`);
  let numeric = match[0];
  if (/[,.]\d{2}$/.test(numeric)) numeric = numeric.slice(0, -3);
  const amount = Number(numeric.replace(/[,.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new Error(`Invalid price amount extracted: ${amount}`);
  }
  return amount;
}

export function parseStock(value) {
  if (!value) return 0;
  if (/out of stock/i.test(value)) return 0;
  const match = value.match(/(\d+)\s*(?:left|in stock)/i);
  if (!match) return 0;
  return Number(match[1]);
}

async function dismissCookieOverlay(page) {
  try {
    const cookies = page.getByRole("button", { name: /accept/i });
    const appeared = await cookies.waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) return;

    const box = await cookies.boundingBox();
    if (!box) {
      await cookies.click({ force: true }).catch(() => undefined);
      return;
    }
    await page.mouse.move(Math.max(10, box.x - 60), Math.max(10, box.y - 20));
    await delay(120);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await delay(150);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await delay(300);
  } catch (e) {
    // Cookie dismissal should not block scraper progress
  }
}

async function revealPrice(page) {
  await dismissCookieOverlay(page);
  const button = page.getByRole("button", { name: /reveal price/i });
  await button.waitFor({ state: "visible", timeout: 14_000 });
  const box = await button.boundingBox();
  if (!box) throw new Error("Reveal-price button has no visible bounds");

  // Move cursor toward the reveal button to satisfy anti-bot dwell/move tracking
  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;
  const startX = Math.max(20, targetX - 280);
  const startY = Math.max(20, targetY - 160);
  await page.mouse.move(startX, startY);
  for (let step = 1; step <= 16; step += 1) {
    const progress = step / 16;
    await page.mouse.move(
      startX + (targetX - startX) * progress,
      startY + (targetY - startY) * progress
    );
    await delay(70);
  }

  await dismissCookieOverlay(page);
  await delay(500);

  // Wait until the button becomes interactive (disabled attribute removed)
  await page.waitForFunction(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => /reveal price/i.test(b.textContent || ""));
    return btn && !btn.disabled;
  }, { timeout: 10_000 }).catch(() => undefined);

  // Click the reveal button
  await button.click({ force: true });

  // Handle either immediate price resolution OR transient store error with "Try again"
  const outcome = await Promise.race([
    page.locator(".price-success").waitFor({ state: "visible", timeout: 14_000 }).then(() => "success").catch(() => null),
    page.locator("button", { hasText: /try again/i }).waitFor({ state: "visible", timeout: 14_000 }).then(() => "try_again").catch(() => null)
  ]);

  if (outcome === "try_again") {
    const tryAgainBtn = page.getByRole("button", { name: /try again/i });
    if (await tryAgainBtn.isVisible().catch(() => false)) {
      await tryAgainBtn.click({ force: true });
      await page.locator(".price-success").waitFor({ state: "visible", timeout: 15_000 });
    }
  } else if (!outcome) {
    // Final check for .price-success
    await page.locator(".price-success").waitFor({ state: "visible", timeout: 10_000 });
  }
}

async function readQuote(page) {
  const quote = await page.locator(".price-success").evaluate(node => {
    const priceNode = [...node.querySelectorAll(".price-main > *")]
      .find(element => element.style.fontSize === "2.4rem") ||
      node.querySelector(".price-current") ||
      node.querySelector(".price-main");
    const stockNode = node.querySelector(".stock-badge") || [...node.querySelectorAll("*")]
      .find(element => /(?:in stock|left|out of stock)/i.test(element.textContent || ""));
    return { price: priceNode?.textContent?.trim(), stock: stockNode?.textContent?.trim() };
  });
  if (!quote.price) throw new Error("Price block loaded but price value was absent");
  return {
    price: parseMoney(quote.price),
    stock: parseStock(quote.stock),
    rawPrice: quote.price,
    rawStock: quote.stock || "Unknown"
  };
}

export async function scrapeCatalogProduct(catalogId, { headed = false, onRetry = () => {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let browser;
    try {
      browser = await chromium.launch({
        headless: headed ? false : config.headless,
        slowMo: headed ? 90 : 0,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]
      });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 860 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      });
      page.setDefaultTimeout(20_000);
      await page.goto(`${config.storeBaseUrl}/product/${catalogId}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
      await revealPrice(page);
      const quote = await readQuote(page);
      await browser.close();
      return { ...quote, attempts: attempt };
    } catch (error) {
      lastError = error;
      await browser?.close().catch(() => undefined);
      if (attempt === 3 || !retryable(error)) break;
      const waitMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await onRetry({ attempt, message: error.message, waitMs });
      await delay(waitMs);
    }
  }
  throw new Error(`Scrape failed after 3 attempts: ${lastError?.message || "unknown error"}`);
}