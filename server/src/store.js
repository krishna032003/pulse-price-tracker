import { config } from "./config.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let catalogCache = { expiresAt: 0, items: [] };

async function storeFetch(path) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${config.storeBaseUrl}${path}`, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "PulsePriceTracker/1.0" } });
      if (!response.ok) throw new Error(`Store returned HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export async function searchStore(query) {
  const normalized = query.trim().toLowerCase();
  if (Date.now() >= catalogCache.expiresAt) {
    // The API caps page size at 60. Cache the full index for ten minutes so typing does
    // not repeatedly hit the store, then fetch the remaining pages slowly and sequentially.
    const first = await storeFetch("/api/catalog?page=1&pageSize=60");
    const pages = [first];
    for (let page = 2; page <= first.pages; page += 1) {
      await wait(400);
      pages.push(await storeFetch(`/api/catalog?page=${page}&pageSize=60`));
    }
    catalogCache = { items: pages.flatMap(page => page.items), expiresAt: Date.now() + 10 * 60_000 };
  }
  return [...new Map(catalogCache.items.map(product => [product.id, product])).values()]
    .filter(product => product.name.toLowerCase().includes(normalized))
    .slice(0, 20);
}

export async function productFromStore(catalogId) {
  return storeFetch(`/api/product/${catalogId}`);
}
