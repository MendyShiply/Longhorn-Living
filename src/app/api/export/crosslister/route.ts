import { supabaseServer } from "@/lib/supabase/server";
import { photoUrl } from "@/lib/settings";
import { CONDITION_LABELS, type ItemCondition } from "@/lib/types";

/**
 * CSV export for crosslisting apps (Vendoo, List Perfectly, Crosslist...).
 * One row per item, using the eBay version of the listing (the most detailed one).
 * Column names follow the common crosslister import fields; map them once in the app's import screen.
 *
 * ?items=id1,id2  specific items
 * (no params)     every item whose listings are queued or draft and not yet posted
 */
export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const ids = new URL(request.url).searchParams.get("items")?.split(",").filter(Boolean);
  let q = supabase
    .from("items")
    .select("id, code, condition, list_price, product:products(*), listings(*), item_photos(storage_path, sort)")
    .not("product_id", "is", null);
  if (ids?.length) q = q.in("id", ids);
  else q = q.in("status", ["photographed", "built", "identified"]);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  const header = [
    "SKU",
    "Title",
    "Description",
    "Price",
    "Original Price",
    "Condition",
    "Brand",
    "Category",
    "Color",
    "Dimensions",
    "Quantity",
    ...Array.from({ length: 12 }, (_, i) => `Photo ${i + 1}`),
  ];
  const rows = (data ?? []).map((item) => {
    const p = item.product as unknown as Record<string, unknown>;
    const listings = (item.listings ?? []) as { platform: string; title: string; description: string }[];
    const best = listings.find((l) => l.platform === "ebay") ?? listings.find((l) => l.platform === "facebook") ?? listings[0];
    const photos = [
      ...((item.item_photos ?? []) as { storage_path: string; sort: number }[]).sort((a, b) => a.sort - b.sort).map((ph) => photoUrl(ph.storage_path)),
      ...((p.image_urls as string[]) ?? []),
    ].slice(0, 12);
    return [
      item.code,
      best?.title ?? p.title,
      best?.description ?? p.description ?? "",
      item.list_price ?? "",
      p.retail_price ?? "",
      item.condition ? CONDITION_LABELS[item.condition as ItemCondition] : "",
      p.brand ?? "",
      p.category ?? "",
      p.color ?? "",
      p.dimensions ?? "",
      1,
      ...photos,
      ...Array(12 - photos.length).fill(""),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="longhorn-listings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
