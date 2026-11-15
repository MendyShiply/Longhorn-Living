# Longhorn Living

Software for running a returns resale business: buy truckloads of customer returns, unload them pallet by pallet, identify and price every item, build and photograph it, then list it on Facebook Marketplace, OfferUp, eBay and more.

## How the business flows through the app

```
Load (a truck, "24 pallets")
  └─ Pallet 1, 2, 3 … (opened one at a time)
       └─ Item LL-000123 (one physical unit, its own label)
            └─ Product (the SKU: name, retail price, retailer photos; shared by every unit of it)
```

1. **Loads**: add the truck with what you know (seller, pallet count, total cost). No manifest needed.
2. **Scan**: open the next pallet and scan each box with the phone camera (or a scanner gun).
   * The app checks its own catalog first (free, instant; repeats are common in returns).
   * Then barcode databases (UPCitemdb).
   * Then AI with web search: works for Amazon ASINs, Wayfair part numbers, model numbers, or a **photo of the label** when there's no barcode. Amazon LPN return stickers can't be looked up, so it asks for another barcode or a photo.
   * Pick the condition, see the suggested price (retail × percent for that condition), save. A box label prints automatically.
3. **Build and photograph**: scan the label, mark it built, grade it, add real photos, then print a **hang tag** with the same barcode for the built item.
4. **Listings**: one tap writes a separate version of the listing for every platform (title length, style, category and condition wording each platform expects). Then post using whichever method is chosen in Settings:
   * **Longhorn Chrome extension** (free): fills in and posts each platform's form in your own logged in browser.
   * **A paid crosslister** (Vendoo, List Perfectly, Crosslist): export a CSV it can import.
   * eBay posts directly through its API either way.
5. **Mark sold**: records the sale and flags every other platform's listing to come down.
6. **Money**: each load's cost is spread across its items by retail value, so every item and every load shows real profit.

Roles: **owner** (first account created), **manager** (sees costs, marks sales), **worker** (scan, build, photograph, list).

## Setting it up (about 20 minutes, no coding)

Everything lives in accounts the business owns.

1. **Supabase** (database, logins, photos): create a free project at supabase.com.
   * SQL Editor → paste the contents of `supabase/migrations/0001_init.sql` → Run.
   * Authentication → URL Configuration → set Site URL to your app address.
   * Project Settings → API: copy the URL, the anon key and the service role key.
2. **Anthropic API key** at console.anthropic.com (used for product identification and listing writing; typically a few cents per item).
3. **Vercel**: import this GitHub repo at vercel.com, paste the variables from `.env.example`, deploy.
4. Optional: add a custom domain in Vercel (e.g. `app.longhornliving.com`).
5. Open the app and create the first account. That account is the owner.

### Hardware

* Any phone works for scanning and photos (the camera scanner needs the https address, which Vercel provides).
* A thermal label printer (Rollo, Zebra, or similar) with 2 × 1 inch labels for box labels, and tag stock for hang tags. Label size is set in Settings.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

## Roadmap

- [x] Loads, pallets, scanning, AI product lookup, pricing, labels and hang tags
- [x] Inventory, photos, per platform listing writer, sold tracking, load profit
- [x] Settings: choose Chrome extension or a paid crosslister, CSV export for crosslisters
- [ ] eBay connection (post and delist through the API)
- [ ] QuickBooks Online connection (sales and load costs post automatically)
- [ ] Gmail connection (receipts and pickup confirmations from the business email)
- [ ] Longhorn Chrome extension for Facebook Marketplace, OfferUp, Craigslist, Mercari
