# Design note: making the scraper dependable

The hard part is not extracting text once; it is deciding when a value is trustworthy. The INE store exposes a normal catalog API, but the live price is intentionally hidden behind client-side behaviour. I use Playwright only for that price interaction and keep ordinary product search as small HTTP requests.

Each product scrape opens a new isolated browser context, waits for the reveal control, makes ten paced pointer movements, waits for the required dwell time, then reveals the quote. It waits for the success state before extracting the specifically styled current-price element and a stock statement. Both fields are parsed and validated. A missing price, an unparsable value, or ambiguous stock is a failure - it never becomes a zero or a blank history record.

There are three complete scrape attempts with exponential backoff and a little jitter. Every transient retry is written as `retried`; the final result is stored as either a history record plus `success`, or `failed` with the reason. Per-product errors do not stop the other products, and concurrency is capped at two so this assignment's store is not hammered.

An external cron service calls the protected API endpoint every two hours. This avoids relying on a background `setInterval` in a free Render instance, which may sleep. The service role key stays on Render; the frontend has only the public API URL.

My first exploration assumed the normal product endpoint would contain a price because it contains all other details. It did not. The storefront bundle showed that the quote is issued only after a browser interaction, so I changed to Playwright and made the interaction explicit. A second overly broad text selector picked up decoy hidden values; the final scraper identifies the visible, large current-price element and validates it before writing anything.

Trade-off: a browser is heavier than an HTTP parser, but it is justified for the protected dynamic price. Spinning up one browser per product makes failures cleaner to isolate; for a much larger system I would use a managed browser pool with a queue.
