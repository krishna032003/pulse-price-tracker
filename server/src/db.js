import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabase = config.supabaseUrl && config.supabaseServiceRoleKey
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;

export function database() {
  if (!supabase) throw new Error("Database is not configured. Add Supabase values to server/.env.");
  return supabase;
}

export async function saveAttempt(productId, attempt) {
  const { error } = await database().from("scrape_logs").insert({ product_id: productId, ...attempt });
  if (error) throw error;
}
