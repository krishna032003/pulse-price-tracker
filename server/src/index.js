import express from "express";
import cors from "cors";
import { z } from "zod";
import { config } from "./config.js";
import { listProducts, productDetail, trackProduct } from "./repository.js";
import { productFromStore, searchStore } from "./store.js";
import { runScheduledScrapes, scrapeOneProduct } from "./run-scrapes.js";

const app = express();

// Permissive CORS to allow Vercel production & preview deployments seamlessly
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
}));
app.use(express.json());

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get("/health", (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

app.get("/api/catalog/search", asyncRoute(async (req, res) => {
  const query = z.string().trim().min(2).max(80).parse(req.query.q);
  res.json(await searchStore(query));
}));

app.get("/api/products", asyncRoute(async (_, res) => {
  res.json(await listProducts());
}));

app.post("/api/products", asyncRoute(async (req, res) => {
  const input = z.object({ catalogId: z.number().int().positive() }).parse(req.body);
  const product = await productFromStore(input.catalogId);
  const row = {
    catalog_id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    sku: product.sku,
    product_url: `${config.storeBaseUrl}/product/${product.id}`
  };
  const tracked = await trackProduct(row);

  // Auto-scrape in the background immediately so the product doesn't sit in "Pending"
  scrapeOneProduct(tracked).catch(err => console.error("Initial scrape error:", err.message));

  res.status(201).json(tracked);
}));

app.get("/api/products/:id", asyncRoute(async (req, res) => {
  res.json(await productDetail(req.params.id));
}));

// On-demand scrape endpoint for a single product
app.post("/api/products/:id/scrape", asyncRoute(async (req, res) => {
  const detail = await productDetail(req.params.id);
  if (!detail || !detail.product) {
    return res.status(404).json({ error: "Product not found" });
  }
  const result = await scrapeOneProduct(detail.product);
  if (result.status === "failed") {
    return res.status(502).json({ error: result.error || "Scrape failed" });
  }
  res.json({ success: true, result });
}));

// Cron scrape endpoint for all active products
app.post("/api/scrapes/run", asyncRoute(async (req, res) => {
  if (req.get("x-cron-secret") !== config.cronSecret) return res.status(401).json({ error: "Unauthorized" });
  const results = await runScheduledScrapes();
  res.json({ ranAt: new Date().toISOString(), results });
}));

app.use((error, _, res, __) => {
  console.error(error);
  res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error.message || "Unexpected server error" });
});

app.listen(config.port, () => console.log(`Pulse API listening on port ${config.port}`));