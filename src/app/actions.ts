"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { suggestPrice } from "@/lib/pricing";
import type { ItemCondition, ItemStatus, ProductDraft } from "@/lib/types";

const num = (v: FormDataEntryValue | null) => {
  if (v === null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : String(v).trim());

// ------------------------------------------------------------------
// Loads and pallets
// ------------------------------------------------------------------

export async function createLoad(form: FormData) {
  const { supabase } = await requireManager();
  const palletCount = num(form.get("pallet_count"));
  const { data, error } = await supabase
    .from("loads")
    .insert({
      source: str(form.get("source")),
      retailer_mix: str(form.get("retailer_mix")),
      purchased_at: str(form.get("purchased_at")),
      total_cost: num(form.get("total_cost")) ?? 0,
      pallet_count: palletCount,
      notes: str(form.get("notes")),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/loads/${data.id}`);
}

export async function updateLoad(id: string, form: FormData) {
  const { supabase } = await requireManager();
  const { error } = await supabase
    .from("loads")
    .update({
      source: str(form.get("source")),
      retailer_mix: str(form.get("retailer_mix")),
      purchased_at: str(form.get("purchased_at")),
      total_cost: num(form.get("total_cost")) ?? 0,
      pallet_count: num(form.get("pallet_count")),
      notes: str(form.get("notes")),
      status: str(form.get("status")) ?? "receiving",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/loads/${id}`);
}

/** Open the next pallet on a load and go straight to the scan station. */
export async function openNextPallet(loadId: string) {
  const { supabase } = await requireUser();
  const { data: last } = await supabase
    .from("pallets")
    .select("number")
    .eq("load_id", loadId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("pallets")
    .insert({ load_id: loadId, number: (last?.number ?? 0) + 1 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/pallets/${data.id}`);
}

export async function setPalletStatus(palletId: string, status: "open" | "done", notes?: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("pallets")
    .update({ status, ...(notes !== undefined ? { notes } : {}) })
    .eq("id", palletId)
    .select("load_id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/loads/${data.load_id}`);
  revalidatePath(`/pallets/${palletId}`);
}

// ------------------------------------------------------------------
// Products and items
// ------------------------------------------------------------------

/** Save a looked up product to the catalog (or reuse an existing one) and remember the scanned code. */
async function upsertProduct(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  draft: ProductDraft,
  scannedCode: string | null,
): Promise<string> {
  let productId: string | null = null;
  if (draft.upc) {
    const { data } = await supabase.from("products").select("id").eq("upc", draft.upc).limit(1).maybeSingle();
    productId = data?.id ?? null;
  }
  if (!productId && draft.asin) {
    const { data } = await supabase.from("products").select("id").eq("asin", draft.asin).limit(1).maybeSingle();
    productId = data?.id ?? null;
  }
  if (!productId) {
    const { data, error } = await supabase.from("products").insert(draft).select("id").single();
    if (error) throw new Error(error.message);
    productId = data.id as string;
  }
  if (scannedCode) {
    await supabase.from("product_codes").upsert({ code: scannedCode, product_id: productId });
  }
  return productId;
}

export interface ReceiveInput {
  palletId: string;
  scannedCode: string | null;
  productId?: string | null;
  draft?: ProductDraft | null;
  condition?: ItemCondition | null;
  notes?: string | null;
}

/** Create the item record for one box coming off a pallet. Returns the new item for label printing. */
export async function receiveItem(input: ReceiveInput) {
  const { supabase, user } = await requireUser();
  const { data: pallet, error: pErr } = await supabase
    .from("pallets")
    .select("id, load_id")
    .eq("id", input.palletId)
    .single();
  if (pErr) throw new Error(pErr.message);

  let productId = input.productId ?? null;
  if (!productId && input.draft) productId = await upsertProduct(supabase, input.draft, input.scannedCode);
  else if (productId && input.scannedCode) {
    await supabase.from("product_codes").upsert({ code: input.scannedCode, product_id: productId });
  }

  let listPrice: number | null = null;
  if (productId) {
    const settings = await getSettings(supabase);
    const { data: product } = await supabase.from("products").select("retail_price").eq("id", productId).single();
    listPrice = suggestPrice(product?.retail_price, input.condition ?? "open_box", settings);
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      load_id: pallet.load_id,
      pallet_id: pallet.id,
      product_id: productId,
      scanned_code: input.scannedCode,
      status: productId ? "identified" : "received",
      condition: input.condition ?? null,
      notes: input.notes ?? null,
      list_price: listPrice,
      created_by: user.id,
    })
    .select("id, code")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/pallets/${pallet.id}`);
  return data as { id: string; code: string };
}

export async function attachProduct(itemId: string, product: { draft: ProductDraft } | { productId: string }) {
  const { supabase } = await requireUser();
  const { data: item } = await supabase.from("items").select("scanned_code, status, condition").eq("id", itemId).single();
  let productId: string;
  if ("productId" in product) {
    productId = product.productId;
    if (item?.scanned_code) await supabase.from("product_codes").upsert({ code: item.scanned_code, product_id: productId });
  } else {
    productId = await upsertProduct(supabase, product.draft, item?.scanned_code ?? null);
  }
  const { data: saved } = await supabase.from("products").select("retail_price").eq("id", productId).single();
  const settings = await getSettings(supabase);
  await supabase
    .from("items")
    .update({
      product_id: productId,
      status: item?.status === "received" ? "identified" : item?.status,
      list_price: suggestPrice(saved?.retail_price, item?.condition ?? "open_box", settings),
    })
    .eq("id", itemId);
  revalidatePath(`/items/${itemId}`);
}

export async function updateProduct(productId: string, itemId: string, form: FormData) {
  const { supabase } = await requireUser();
  const images = String(form.get("image_urls") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const { error } = await supabase
    .from("products")
    .update({
      title: str(form.get("title")) ?? "Untitled",
      brand: str(form.get("brand")),
      model_number: str(form.get("model_number")),
      upc: str(form.get("upc")),
      asin: str(form.get("asin")),
      retailer_sku: str(form.get("retailer_sku")),
      retailer: str(form.get("retailer")),
      category: str(form.get("category")),
      description: str(form.get("description")),
      dimensions: str(form.get("dimensions")),
      color: str(form.get("color")),
      retail_price: num(form.get("retail_price")),
      source_url: str(form.get("source_url")),
      image_urls: images,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
}

export async function updateItem(itemId: string, form: FormData) {
  const { supabase } = await requireUser();
  const condition = str(form.get("condition")) as ItemCondition | null;
  const update: Record<string, unknown> = {
    condition,
    condition_notes: str(form.get("condition_notes")),
    is_built: form.get("is_built") === "on",
    list_price: num(form.get("list_price")),
    location: str(form.get("location")),
    notes: str(form.get("notes")),
    updated_at: new Date().toISOString(),
  };
  const status = str(form.get("status")) as ItemStatus | null;
  if (status) update.status = status;
  const { error } = await supabase.from("items").update(update).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/inventory");
}

export async function setItemStatus(itemId: string, status: ItemStatus) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "built") update.is_built = true;
  const { error } = await supabase.from("items").update(update).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/inventory");
}

export async function addPhoto(itemId: string, storagePath: string) {
  const { supabase } = await requireUser();
  const { count } = await supabase.from("item_photos").select("id", { count: "exact", head: true }).eq("item_id", itemId);
  await supabase.from("item_photos").insert({ item_id: itemId, storage_path: storagePath, sort: count ?? 0 });
  const { data: item } = await supabase.from("items").select("status").eq("id", itemId).single();
  if (item && ["received", "identified", "built"].includes(item.status)) {
    await supabase.from("items").update({ status: "photographed" }).eq("id", itemId);
  }
  revalidatePath(`/items/${itemId}`);
}

export async function deletePhoto(photoId: string, itemId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("item_photos").select("storage_path").eq("id", photoId).single();
  if (data) await supabase.storage.from("item-photos").remove([data.storage_path]);
  await supabase.from("item_photos").delete().eq("id", photoId);
  revalidatePath(`/items/${itemId}`);
}

// ------------------------------------------------------------------
// Sales
// ------------------------------------------------------------------

export async function markSold(itemId: string, form: FormData) {
  const { supabase } = await requireManager();
  const platform = str(form.get("platform"));
  const { error } = await supabase.from("sales").upsert(
    {
      item_id: itemId,
      platform,
      sale_price: num(form.get("sale_price")) ?? 0,
      fees: num(form.get("fees")) ?? 0,
      buyer_name: str(form.get("buyer_name")),
      buyer_email: str(form.get("buyer_email")),
      sold_at: new Date().toISOString(),
    },
    { onConflict: "item_id" },
  );
  if (error) throw new Error(error.message);
  await supabase.from("items").update({ status: "sold" }).eq("id", itemId);
  // Every other platform's listing must come down so nobody else shows up for it.
  await supabase
    .from("listings")
    .update({ status: "sold", updated_at: new Date().toISOString() })
    .eq("item_id", itemId)
    .eq("platform", platform ?? "");
  await supabase
    .from("listings")
    .update({ status: "queued", updated_at: new Date().toISOString(), error: "Needs delisting: sold elsewhere" })
    .eq("item_id", itemId)
    .eq("status", "posted")
    .neq("platform", platform ?? "");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/listings");
}

// ------------------------------------------------------------------
// Settings and team
// ------------------------------------------------------------------

export async function saveSettings(form: FormData) {
  const { supabase } = await requireManager();
  const conditionPct: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("pct_")) conditionPct[k.slice(4)] = Number(v) || 0;
  }
  const { error } = await supabase
    .from("settings")
    .update({
      business_name: str(form.get("business_name")) ?? "Longhorn Living",
      pickup_city: str(form.get("pickup_city")),
      default_price_pct: num(form.get("default_price_pct")) ?? 50,
      condition_pct: conditionPct,
      listing_method: form.get("listing_method") === "crosslister" ? "crosslister" : "extension",
      crosslister_name: str(form.get("crosslister_name")),
      enabled_platforms: form.getAll("enabled_platforms").map(String),
      label_size: str(form.get("label_size")) ?? "2x1",
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/listings");
}

export async function setUserRole(userId: string, role: "owner" | "manager" | "worker") {
  const { supabase, role: myRole } = await requireUser();
  if (myRole !== "owner") throw new Error("Only the owner can change roles");
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
