import pLimit from "p-limit";
import { activeProducts, addHistory, addLog } from "./repository.js";
import { scrapeCatalogProduct } from "./scraper.js";

const limit = pLimit(2);

export async function runScheduledScrapes() {
  const products = await activeProducts();
  const results = await Promise.all(products.map(product => limit(() => scrapeOne(product))));
  return results;
}

export async function scrapeOneProduct(product) {
  return scrapeOne(product);
}

async function scrapeOne(product) {
  const startedAt = new Date().toISOString();
  try {
    const quote = await scrapeCatalogProduct(product.catalog_id, {
      onRetry: retry => addLog({ product_id: product.id, status: "retried", started_at: startedAt, finished_at: new Date().toISOString(), attempt: retry.attempt, message: retry.message })
    });
    await addHistory({ product_id: product.id, price: quote.price, stock: quote.stock, scraped_at: new Date().toISOString() });
    await addLog({ product_id: product.id, status: "success", started_at: startedAt, finished_at: new Date().toISOString(), attempt: quote.attempts, message: `Captured ${quote.rawPrice}; ${quote.rawStock}` });
    return { productId: product.id, status: "success", quote };
  } catch (error) {
    await addLog({ product_id: product.id, status: "failed", started_at: startedAt, finished_at: new Date().toISOString(), attempt: 3, message: error.message });
    return { productId: product.id, status: "failed", error: error.message };
  }
}