# Submission checklist

Use this after you create the three free-tier accounts. It is intentionally short so you can explain the project naturally in an interview.

## Before deployment

- [ ] Run `supabase/schema.sql` in a new Supabase project.
- [ ] Add `server/.env` and `web/.env` from their examples for a local smoke test.
- [ ] Run `npm install` and `npx playwright install chromium --workspace server`.
- [ ] Run `npm run dev`, track one product, then make the protected scrape request described in the README.
- [ ] Run `npm run headed-scrape -- 1` and record 2 to 4 minutes. In the video say: “The product search is HTTP-based, but the price needs a real browser interaction. Here the scraper moves, waits, reveals, validates, and then reports the quote.”

## Publish

- [ ] Create a public GitHub repository and push this folder.
- [ ] Deploy the backend from `render.yaml`; add the private Supabase variables and final Vercel origin.
- [ ] Deploy `web` to Vercel; set `VITE_API_BASE_URL` to the Render URL.
- [ ] Set cron-job.org to POST to `/api/scrapes/run` every two hours with `x-cron-secret`.
- [ ] Add a product on the live site and manually trigger the cron endpoint once, then confirm the chart and log.

## Send

Email `sstephen@ine.com` and cc `ssingh@ine.com`.

Subject: `First Round: Software Engineer Intern Assignment - Your Name`

Body:

> Hello,\n> \n> Please find my submission for the Software Engineer Intern assignment.\n> \n> Live site: [your Vercel URL]\n> GitHub repository: [your public GitHub URL]\n> Headed scraper recording: [your recording URL]\n> \n> I used an HTTP catalog search and Playwright only for the protected live-price interaction. The scraper validates both price and stock, records retries and final failures, and is triggered every two hours by external cron.\n> \n> Thank you for your time,\n> Your Name

Attach your own PDF resume. Do not claim a failure demonstration occurred unless the recording genuinely shows it.
