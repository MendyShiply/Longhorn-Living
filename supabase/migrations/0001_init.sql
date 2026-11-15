-- Longhorn Living: initial schema
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- ============================================================
-- People
-- ============================================================
create type user_role as enum ('owner', 'manager', 'worker');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role user_role not null default 'worker',
  created_at timestamptz not null default now()
);

-- The very first person to sign up becomes the owner. Everyone after is a worker
-- until the owner promotes them.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when exists (select 1 from profiles) then 'worker'::user_role else 'owner'::user_role end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = r);
$$;

create or replace function is_manager_or_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'manager'));
$$;

-- ============================================================
-- Business settings (single row)
-- ============================================================
create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Longhorn Living',
  pickup_city text default '',
  default_price_pct numeric not null default 50,
  -- percent of retail price for each condition grade
  condition_pct jsonb not null default
    '{"new_in_box":50,"open_box":47,"like_new":45,"good":38,"fair":30,"damaged":20,"parts_only":10}',
  -- how listings get posted to Facebook Marketplace / OfferUp / etc.
  --   'extension'   = our own Chrome extension fills and posts the forms
  --   'crosslister' = a paid crosslisting app (Vendoo, List Perfectly, Crosslist...)
  listing_method text not null default 'extension'
    check (listing_method in ('extension', 'crosslister')),
  crosslister_name text default 'vendoo',
  enabled_platforms text[] not null default array['facebook', 'offerup', 'ebay', 'craigslist'],
  label_size text not null default '2x1',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

-- ============================================================
-- Loads and pallets
-- ============================================================
create sequence load_code_seq start 1;

create table loads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('L-' || lpad(nextval('load_code_seq')::text, 4, '0')),
  source text,                       -- who he bought it from
  retailer_mix text,                 -- e.g. "Wayfair / Amazon mix"
  purchased_at date default current_date,
  total_cost numeric(12,2) default 0, -- truck price + freight + fees
  pallet_count int,                  -- what the seller said (e.g. 24)
  notes text,
  status text not null default 'receiving' check (status in ('receiving', 'complete')),
  created_at timestamptz not null default now()
);

create table pallets (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  number int not null,
  status text not null default 'open' check (status in ('open', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  unique (load_id, number)
);

-- ============================================================
-- Products (the catalog: one row per SKU, shared by every unit)
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  upc text,
  asin text,
  model_number text,
  retailer_sku text,                 -- Wayfair part number, Home Depot internet #, etc.
  retailer text,                     -- wayfair | amazon | walmart | homedepot | lowes | other
  title text not null,
  brand text,
  category text,
  description text,
  dimensions text,
  color text,
  retail_price numeric(12,2),
  source_url text,
  image_urls text[] not null default '{}',
  lookup_source text,                -- manual | upcitemdb | ai
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_upc_idx on products (upc);
create index products_asin_idx on products (asin);
create index products_model_idx on products (lower(model_number));
create index products_sku_idx on products (lower(retailer_sku));

-- Every code we have ever scanned that resolved to a product.
-- Lets an LPN sticker or FNSKU map to a product the second time we see it.
create table product_codes (
  code text primary key,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Items (one row per physical unit)
-- ============================================================
create sequence item_code_seq start 1;

create type item_status as enum (
  'received',      -- scanned off the pallet, label on the box
  'identified',    -- product info confirmed
  'built',         -- assembled
  'photographed',  -- real photos taken, ready to list
  'listed',        -- live on at least one platform
  'sold',          -- buyer paid
  'picked_up',     -- gone
  'parts',         -- kept for parts
  'scrap'          -- thrown away / donated
);

create type item_condition as enum (
  'new_in_box', 'open_box', 'like_new', 'good', 'fair', 'damaged', 'parts_only'
);

create table items (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('LL-' || lpad(nextval('item_code_seq')::text, 6, '0')),
  load_id uuid not null references loads (id) on delete restrict,
  pallet_id uuid references pallets (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  scanned_code text,                 -- the raw barcode we scanned off the box
  status item_status not null default 'received',
  condition item_condition,
  condition_notes text,              -- "missing 2 bolts", "scratch on left arm"
  is_built boolean not null default false,
  list_price numeric(12,2),
  location text,                     -- shelf / bin / row
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_load_idx on items (load_id);
create index items_status_idx on items (status);

create table item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  storage_path text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Listings and sales
-- ============================================================
create table listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  platform text not null,            -- facebook | offerup | ebay | craigslist | mercari ...
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'posted', 'sold', 'delisted', 'error')),
  title text,
  description text,
  price numeric(12,2),
  category text,
  condition_label text,
  external_id text,
  external_url text,
  error text,
  posted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (item_id, platform)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references items (id) on delete cascade,
  platform text,
  sale_price numeric(12,2) not null,
  fees numeric(12,2) not null default 0,
  buyer_name text,
  buyer_email text,
  sold_at timestamptz not null default now(),
  quickbooks_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Connected accounts (QuickBooks, Gmail, eBay). Tokens are only readable
-- by the server (service role); the app only sees connected / not connected.
-- ============================================================
create table integrations (
  provider text primary key,         -- quickbooks | gmail | ebay
  account_label text,
  tokens jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Cost basis: the load's cost spread across its items by retail value.
-- An item with unknown retail gets the load average.
-- ============================================================
create or replace view item_costs with (security_invoker = true) as
with per_load as (
  select
    i.load_id,
    count(*) as n,
    sum(coalesce(p.retail_price, 0)) as retail_total,
    count(p.retail_price) as n_priced
  from items i left join products p on p.id = i.product_id
  group by i.load_id
)
select
  i.id as item_id,
  case
    when coalesce(l.total_cost, 0) = 0 then 0
    when pl.retail_total > 0 and p.retail_price is not null
      then round(l.total_cost * (pl.n_priced::numeric / pl.n) * p.retail_price / pl.retail_total, 2)
    else round(l.total_cost / pl.n, 2)
  end as cost_basis
from items i
join loads l on l.id = i.load_id
join per_load pl on pl.load_id = i.load_id
left join products p on p.id = i.product_id;

-- ============================================================
-- Row level security
-- ============================================================
alter table profiles enable row level security;
alter table settings enable row level security;
alter table loads enable row level security;
alter table pallets enable row level security;
alter table products enable row level security;
alter table product_codes enable row level security;
alter table items enable row level security;
alter table item_photos enable row level security;
alter table listings enable row level security;
alter table sales enable row level security;
alter table integrations enable row level security;

-- Everyone signed in can see profiles; only the owner changes roles.
create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles owner write" on profiles for update to authenticated
  using (current_role_is('owner')) with check (current_role_is('owner'));

create policy "settings read" on settings for select to authenticated using (true);
create policy "settings write" on settings for update to authenticated
  using (is_manager_or_owner()) with check (is_manager_or_owner());

-- Day to day warehouse tables: any signed in team member.
do $$
declare t text;
begin
  foreach t in array array['pallets','products','product_codes','items','item_photos','listings'] loop
    execute format('create policy "%1$s team" on %1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Money tables: workers can read loads (to pick one) but only managers/owner write.
create policy "loads read" on loads for select to authenticated using (true);
create policy "loads write" on loads for all to authenticated
  using (is_manager_or_owner()) with check (is_manager_or_owner());

create policy "sales manager" on sales for all to authenticated
  using (is_manager_or_owner()) with check (is_manager_or_owner());

-- integrations: no policies = only the service role (server code) can touch it.

-- ============================================================
-- Photo storage
-- ============================================================
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', true)
  on conflict (id) do nothing;

create policy "photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos');
create policy "photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos');
