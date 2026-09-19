import "dotenv/config";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name] && process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  cronSecret: process.env.CRON_SECRET || "local-development-secret",
  storeBaseUrl: (process.env.STORE_BASE_URL || "https://demo.inelabteamdev.com").replace(/\/$/, ""),
  headless: process.env.SCRAPER_HEADLESS !== "false"
};
