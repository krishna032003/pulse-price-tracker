import express from "express";
import cors from "cors";
import { z } from "zod";
import { config } from "./config.js";
import { listProducts, productDetail, trackProduct } from "./repository.js";
import { productFromStore, searchStore } from "./store.js";
import { runScheduledScrapes } from "./run-scrapes.js";

const app = express();
app.use(cors({ origin: config.webOrigin.split(","), methods: ["GET", "POST", "DELETE"] }));
app.use(express.json());
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get("/health", (_, res) => res.json({ ok: true }));
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
  const row = { catalog_id: product.id, name: product.name, brand: product.brand, category: product.category, sku: product.sku, product_url: `${config.storeBaseUrl}/product/${product.id}` };
  res.status(201).json(await trackProduct(row));
}));
app.get("/api/products/:id", asyncRoute(async (req, res) => {
  res.json(await productDetail(req.params.id));
}));
app.post("/api/scrapes/run", asyncRoute(async (req, res) => {
  if (req.get("x-cron-secret") !== config.cronSecret) return res.status(401).json({ error: "Unauthorized" });
  const results = await runScheduledScrapes();
  res.json({ ranAt: new Date().toISOString(), results });
}));
app.use((error, _, res, __) => {
  console.error(error);
  res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error.message || "Unexpected server error" });
});
app.listen(config.port, () => console.log(`Pulse API listening on ${config.port}`));
