# Pulse Price Tracker

An original full-stack submission for the INE Software Engineer Intern assignment. Pulse lets a user search the provided mock store, track a product, inspect its price/stock history, and see every scraper outcome - including retries and failures.

## What is included

- React + Vite dashboard intended for Vercel
- Express API intended for Render
- Supabase PostgreSQL schema for tracked products, history, and honest scrape logs
- Playwright scraper built specifically for `https://demo.inelabteamdev.com`
- Protected external-cron endpoint, retry/backoff, validation, and a visible headed-run command
- Deployment configuration and a small GitHub Actions verification workflow

## Run locally

1. For the production version, create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor. Without Supabase variables, the app automatically uses an ignored local JSON datastore so the whole flow still works locally.
2. Copy `server/.env.example` to `server/.env`, then set the Supabase URL, service-role key, and a long `CRON_SECRET`. For local-only use, remove the two Supabase values and keep the secret.
3. Copy `web/.env.example` to `web/.env`.
4. Run `npm install`, then install the scraper browser with `npx playwright install chromium --workspace server`.
5. Run `npm run dev`, visit `http://localhost:5173`, and search for a product.

The dashboard will show `Pending` until the protected scrape endpoint has been called. For a local test, send a POST request to `http://localhost:3001/api/scrapes/run` with header `x-cron-secret` set to the value in `server/.env`.

## Scrape schedule

Configure cron-job.org to make a **POST** request every two hours to:

`https://YOUR-RENDER-SERVICE.onrender.com/api/scrapes/run`

Add an HTTP request header named `x-cron-secret` with the same secret configured on Render. The endpoint intentionally rejects requests without that header.

## Headed recording demo

After `npm install` and `npx playwright install chromium --workspace server`, run:

```bash
npm run headed-scrape -- 1
```

A visible Chromium window opens on the real INE mock store, moves over the reveal area, shows the current price, and prints the validated result. Record a 2-4 minute video while running it. To demonstrate failure handling honestly, temporarily disconnect the network during a run or use a browser/network throttle: the terminal prints retries and ultimately reports a failure rather than storing a fake value.

## Deploy

1. Push this repository to public GitHub.
2. In Supabase, run the schema. Keep the service-role key private.
3. Create a Render Blueprint from the repo. Its build installs Chromium for Playwright. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `WEB_ORIGIN` (your future Vercel URL). Copy the generated `CRON_SECRET` for cron-job.org.
4. Import the repository into Vercel, set its root directory to `web`, and add `VITE_API_BASE_URL` with the Render API URL. Redeploy Render once with the final Vercel URL in `WEB_ORIGIN`.
5. Set up the two-hour cron request above and add at least one product through the live UI.

## Environment variables

| Variable | Where | Why |
| --- | --- | --- |
| `SUPABASE_URL` | Render | Supabase project address |
| `SUPABASE_SERVICE_ROLE_KEY` | Render only | Database access; never expose it to Vercel |
| `CRON_SECRET` | Render and cron-job.org | Protects the scheduled endpoint |
| `WEB_ORIGIN` | Render | Comma-separated allowed frontend origins |
| `VITE_API_BASE_URL` | Vercel | Public URL of the Render API |
| `SCRAPER_HEADLESS` | Local only | Use `false` only when you need a visible browser |

See [DESIGN_NOTE.md](DESIGN_NOTE.md) for the reliability decisions and trade-offs.
