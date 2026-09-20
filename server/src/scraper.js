import { chromium } from "playwright";
import { config } from "./config.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const retryable = error => /timeout|net::|ECONN|HTTP 5|Target page|price block/i.test(String(error.message));

function parseMoney(value) {
  // The storefront deliberately varies separators, adds zero-width characters,
  // and sometimes shows a locale-specific decimal suffix (for example 35.503,00).
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  const match = text.match(/\d[\d.,]*/);
  if (!match) throw new Error(`Invalid price text: ${value}`);
  let numeric = match[0];
  if (/[,.]\d{2}$/.test(numeric)) numeric = numeric.slice(0, -3);
  const amount = Number(numeric.replace(/[,.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error(`Invalid price text: ${value}`);
  return amount;
}

function parseStock(value) {
  if (/out of stock/i.test(value)) return 0;
  const match = value.match(/(\d+)\s*(?:left|in stock)/i);
  if (!match) throw new Error(`Could not validate stock text: ${value}`);
  return Number(match[1]);
}

async function revealPrice(page) {
  const button = page.getByRole("button", { name: /reveal price/i });
  await button.waitFor({ state: "visible", timeout: 12_000 });
  const box = await button.boundingBox();
  if (!box) throw new Error("Reveal-price button has no visible bounds");

  // The mock store intentionally expects genuine movement and a short hover before revealing price.
  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;
  const startX = Math.max(20, targetX - 320);
  const startY = Math.max(20, targetY - 180);
  await page.mouse.move(startX, startY);
  for (let step = 1; step <= 16; step += 1) {
    const progress = step / 16;
    await page.mouse.move(
      startX + (targetX - startX) * progress,
      startY + (targetY - startY) * progress
    );
    await delay(95);
  }
  await button.hover();
  await delay(900);
  await page.waitForFunction(element => !element.disabled, await button.elementHandle(), { timeout: 10_000 });
  await button.click();
  await page.locator(".price-success").waitFor({ state: "visible", timeout: 18_000 });
}

async function readQuote(page) {
  const quote = await page.locator(".price-success").evaluate(node => {
    const priceNode = [...node.querySelectorAll(".price-main > *")]
      .find(element => element.style.fontSize === "2.4rem");
    const stockNode = node.querySelector(".stock-badge") || [...node.querySelectorAll("*")]
      .find(element => /(?:in stock|left|out of stock)/i.test(element.textContent || ""));
    return { price: priceNode?.textContent?.trim(), stock: stockNode?.textContent?.trim() };
  });
  if (!quote.price || !quote.stock) throw new Error("Price block loaded but required values were absent");
  return { price: parseMoney(quote.price), stock: parseStock(quote.stock), rawPrice: quote.price, rawStock: quote.stock };
}

export async function scrapeCatalogProduct(catalogId, { headed = false, onRetry = () => {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let browser;
    try {
      browser = await chromium.launch({ headless: headed ? false : config.headless, slowMo: headed ? 90 : 0 });
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      page.setDefaultTimeout(20_000);
      await page.goto(`${config.storeBaseUrl}/product/${catalogId}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const cookies = page.getByRole("button", { name: /accept cookies/i });
      if (await cookies.isVisible().catch(() => false)) {
        await cookies.click({ force: true });
        await page.locator(".cookie-overlay").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
      }
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
