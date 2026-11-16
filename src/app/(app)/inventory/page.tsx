import { requireUser } from "@/lib/supabase/server";
import { photoUrl } from "@/lib/settings";
import type { ItemCondition, ItemStatus } from "@/lib/types";
import { InventoryView, type InventoryRow } from "./InventoryView";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; load?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  let query = supabase
    .from("items")
    .select(
      "id, code, status, condition, condition_notes, is_built, list_price, location, scanned_code, created_at, updated_at, product:products(title, brand, category, retailer, model_number, upc, color, dimensions, retail_price, image_urls), load:loads(id, code), pallet:pallets(number), item_photos(storage_path, sort), listings(status)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);
  if (sp.load) query = query.eq("load_id", sp.load);
  const { data } = await query;

  type Raw = {
    id: string;
    code: string;
    status: ItemStatus;
    condition: ItemCondition | null;
    condition_notes: string | null;
    is_built: boolean;
    list_price: number | null;
    location: string | null;
    scanned_code: string | null;
    created_at: string;
    updated_at: string;
    product: {
      title: string;
      brand: string | null;
      category: string | null;
      retailer: string | null;
      model_number: string | null;
      upc: string | null;
      color: string | null;
      dimensions: string | null;
      retail_price: number | null;
      image_urls: string[];
    } | null;
    load: { id: string; code: string } | null;
    pallet: { number: number } | null;
    item_photos: { storage_path: string; sort: number }[];
    listings: { status: string }[];
  };

  const now = Date.now();
  const rows: InventoryRow[] = ((data ?? []) as unknown as Raw[]).map((i) => {
    const photo = [...(i.item_photos ?? [])].sort((a, b) => a.sort - b.sort)[0];
    const retail = i.product?.retail_price != null ? Number(i.product.retail_price) : null;
    const price = i.list_price != null ? Number(i.list_price) : null;
    return {
      id: i.id,
      code: i.code,
      image: photo ? photoUrl(photo.storage_path) : (i.product?.image_urls?.[0] ?? null),
      title: i.product?.title ?? null,
      category: i.product?.category ?? null,
      brand: i.product?.brand ?? null,
      retailer: i.product?.retailer ?? null,
      model: i.product?.model_number ?? null,
      color: i.product?.color ?? null,
      dimensions: i.product?.dimensions ?? null,
      status: i.status,
      condition: i.condition,
      conditionNotes: i.condition_notes,
      built: i.is_built,
      price,
      retail,
      pctOfRetail: price != null && retail ? Math.round((price / retail) * 100) : null,
      location: i.location,
      load: i.load?.code ?? null,
      pallet: i.pallet?.number ?? null,
      photos: i.item_photos?.length ?? 0,
      liveListings: (i.listings ?? []).filter((l) => l.status === "posted").length,
      scannedCode: i.scanned_code ?? i.product?.upc ?? null,
      added: i.created_at,
      daysInStock: Math.max(0, Math.floor((now - new Date(i.created_at).getTime()) / 86_400_000)),
    };
  });

  return (
    <InventoryView
      rows={rows}
      initialStatus={sp.status ?? ""}
      initialQuery={sp.q ?? ""}
      loadCode={sp.load ? (rows[0]?.load ?? "this load") : null}
    />
  );
}
