create table if not exists public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  catalog_id integer not null unique,
  name text not null,
  brand text,
  category text,
  sku text,
  product_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.tracked_products(id) on delete cascade,
  price numeric(12,2) not null check (price > 0),
  stock integer not null check (stock >= 0),
  scraped_at timestamptz not null default now()
);
create index if not exists price_history_product_time_idx on public.price_history(product_id, scraped_at desc);

create table if not exists public.scrape_logs (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.tracked_products(id) on delete cascade,
  status text not null check (status in ('success', 'retried', 'failed')),
  attempt integer not null check (attempt between 1 and 3),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists scrape_logs_product_time_idx on public.scrape_logs(product_id, created_at desc);

alter table public.tracked_products enable row level security;
alter table public.price_history enable row level security;
alter table public.scrape_logs enable row level security;
-- The backend uses the Supabase service-role key. Do not expose it to the frontend.
