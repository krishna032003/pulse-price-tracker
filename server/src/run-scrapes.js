import pLimit from "p-limit";
import { activeProducts, addHistory, addLog } from "./repository.js";
import { scrapeCatalogProduct } from "./scraper.js";

export async function runScheduledScrapes() {
  const products = await activeProducts();
  const limit = pLimit(2); // Respect the mock store and keep a failure isolated to one product.
  const results = await Promise.all(products.map(product => limit(() => scrapeOne(product))));
  return results;
}

async function scrapeOne(product) {
  const startedAt = new Date().toISOString();
  try {
    const quote = await scrapeCatalogProduct(product.catalog_id, {
      onRetry: retry => addLog({ product_id: product.id, status: "retried", started_at: startedAt, finished_at: new Date().toISOString(), attempt: retry.attempt, message: `${retry.message}; waiting ${retry.waitMs}ms` })
    });
    await addHistory({ product_id: product.id, price: quote.price, stock: quote.stock, scraped_at: new Date().toISOString() });
    await addLog({ product_id: product.id, status: "success", started_at: startedAt, finished_at: new Date().toISOString(), attempt: quote.attempts, message: `Captured ${quote.rawPrice}; ${quote.rawStock}` });
    return { productId: product.id, status: "success" };
  } catch (error) {
    await addLog({ product_id: product.id, status: "failed", started_at: startedAt, finished_at: new Date().toISOString(), attempt: 3, message: error.message });
    return { productId: product.id, status: "failed", error: error.message };
  }
}
