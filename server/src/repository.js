import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./db.js";

const localFile = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "local-store.json");
const blank = () => ({ products: [], history: [], logs: [] });

async function readLocal() {
  try { return JSON.parse(await readFile(localFile, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return blank(); throw error; }
}
async function writeLocal(data) { await mkdir(dirname(localFile), { recursive: true }); await writeFile(localFile, JSON.stringify(data, null, 2)); }
const nextId = rows => (Math.max(0, ...rows.map(row => Number(row.id) || 0)) + 1);

export async function listProducts() {
  if (supabase) {
    const { data, error } = await supabase.from("tracked_products").select("*, price_history(price, stock, scraped_at)").eq("active", true).order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(product => ({ ...product, latest: product.price_history.sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at))[0] || null }));
  }
  const data = await readLocal();
  return data.products.filter(product => product.active).map(product => ({ ...product, latest: data.history.filter(row => row.product_id === product.id).sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at))[0] || null }));
}

export async function trackProduct(row) {
  if (supabase) {
    const { data, error } = await supabase.from("tracked_products").upsert(row, { onConflict: "catalog_id" }).select().single();
    if (error) throw error;
    return data;
  }
  const data = await readLocal();
  const found = data.products.find(product => product.catalog_id === row.catalog_id);
  if (found) return found;
  const product = { id: randomUUID(), active: true, created_at: new Date().toISOString(), ...row };
  data.products.push(product); await writeLocal(data); return product;
}

export async function productDetail(id) {
  if (supabase) {
    const { data: product, error } = await supabase.from("tracked_products").select("*").eq("id", id).single();
    if (error) throw error;
    const [{ data: history, error: historyError }, { data: logs, error: logsError }] = await Promise.all([
      supabase.from("price_history").select("*").eq("product_id", product.id).order("scraped_at", { ascending: true }),
      supabase.from("scrape_logs").select("*").eq("product_id", product.id).order("created_at", { ascending: false }).limit(50)
    ]);
    if (historyError || logsError) throw historyError || logsError;
    return { product, history, logs };
  }
  const data = await readLocal(); const product = data.products.find(row => row.id === id);
  if (!product) throw new Error("Tracked product was not found");
  return { product, history: data.history.filter(row => row.product_id === id).sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at)), logs: data.logs.filter(row => row.product_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50) };
}

export async function activeProducts() {
  if (supabase) { const { data, error } = await supabase.from("tracked_products").select("*").eq("active", true); if (error) throw error; return data; }
  return (await readLocal()).products.filter(product => product.active);
}

export async function addHistory(row) {
  if (supabase) { const { error } = await supabase.from("price_history").insert(row); if (error) throw error; return; }
  const data = await readLocal(); data.history.push({ id: nextId(data.history), ...row }); await writeLocal(data);
}

export async function addLog(row) {
  if (supabase) { const { error } = await supabase.from("scrape_logs").insert(row); if (error) throw error; return; }
  const data = await readLocal(); data.logs.push({ id: nextId(data.logs), created_at: new Date().toISOString(), ...row }); await writeLocal(data);
}
