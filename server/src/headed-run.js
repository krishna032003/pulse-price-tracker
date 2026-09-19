import { productFromStore } from "./store.js";
import { scrapeCatalogProduct } from "./scraper.js";

const catalogId = Number(process.argv[2] || 1);
const product = await productFromStore(catalogId);
console.log(`Opening a visible browser for ${product.name} (catalog id ${catalogId})...`);
try {
  const quote = await scrapeCatalogProduct(catalogId, { headed: true, onRetry: retry => console.log("Retry", retry) });
  console.log("Scrape succeeded:", quote);
} catch (error) {
  console.error("Scrape failed honestly:", error.message);
  process.exitCode = 1;
}
