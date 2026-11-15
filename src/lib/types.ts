export type ItemStatus =
  | "received"
  | "identified"
  | "built"
  | "photographed"
  | "listed"
  | "sold"
  | "picked_up"
  | "parts"
  | "scrap";

export type ItemCondition =
  | "new_in_box"
  | "open_box"
  | "like_new"
  | "good"
  | "fair"
  | "damaged"
  | "parts_only";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  received: "Received",
  identified: "Identified",
  built: "Built",
  photographed: "Photographed",
  listed: "Listed",
  sold: "Sold",
  picked_up: "Picked up",
  parts: "Parts",
  scrap: "Scrap",
};

export const STATUS_ORDER: ItemStatus[] = [
  "received",
  "identified",
  "built",
  "photographed",
  "listed",
  "sold",
  "picked_up",
  "parts",
  "scrap",
];

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  new_in_box: "New in box (sealed)",
  open_box: "Open box, unused",
  like_new: "Like new (built)",
  good: "Good, light wear",
  fair: "Fair, visible flaws",
  damaged: "Damaged",
  parts_only: "Parts only",
};

export interface Product {
  id: string;
  upc: string | null;
  asin: string | null;
  model_number: string | null;
  retailer_sku: string | null;
  retailer: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  dimensions: string | null;
  color: string | null;
  retail_price: number | null;
  source_url: string | null;
  image_urls: string[];
  lookup_source: string | null;
}

/** What a lookup returns before it is saved as a product. */
export type ProductDraft = Omit<Product, "id">;

export interface Item {
  id: string;
  code: string;
  load_id: string;
  pallet_id: string | null;
  product_id: string | null;
  scanned_code: string | null;
  status: ItemStatus;
  condition: ItemCondition | null;
  condition_notes: string | null;
  is_built: boolean;
  list_price: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Settings {
  business_name: string;
  pickup_city: string | null;
  default_price_pct: number;
  condition_pct: Record<ItemCondition, number>;
  listing_method: "extension" | "crosslister";
  crosslister_name: string | null;
  enabled_platforms: string[];
  label_size: string;
}
