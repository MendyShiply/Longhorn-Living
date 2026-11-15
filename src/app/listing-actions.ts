"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { writeListings, aiEnabled } from "@/lib/ai";
import { PLATFORMS } from "@/lib/platforms";
import { CONDITION_LABELS, type ItemCondition, type Product } from "@/lib/types";

/** Write a version of the listing for every enabled platform and save them as drafts. */
export async function generateListings(itemId: string) {
  const { supabase } = await requireUser();
  const settings = await getSettings(supabase);
  const { data: item, error } = await supabase
    .from("items")
    .select("*, product:products(*)")
    .eq("id", itemId)
    .single();
  if (error || !item) throw new Error("Item not found");
  const product = item.product as Product | null;
  if (!product) throw new Error("Identify the product first");
  if (!item.list_price) throw new Error("Set a price first");

  const platforms = settings.enabled_platforms.filter((p) => PLATFORMS[p]);
  const condition = (item.condition ?? "open_box") as ItemCondition;

  let copies: { platform: string; title: string; description: string; category: string }[];
  if (aiEnabled()) {
    copies = await writeListings({
      product,
      conditionLabel: CONDITION_LABELS[condition],
      conditionNotes: item.condition_notes,
      isBuilt: item.is_built,
      price: Number(item.list_price),
      pickupCity: settings.pickup_city,
      businessName: settings.business_name,
      platforms,
    });
  } else {
    copies = platforms.map((p) => ({
      platform: p,
      title: product.title.slice(0, PLATFORMS[p].titleMax),
      description: basicDescription(product, CONDITION_LABELS[condition], item.condition_notes, settings.pickup_city),
      category: product.category ?? "",
    }));
  }

  const rows = copies.map((c) => ({
    item_id: itemId,
    platform: c.platform,
    title: c.title,
    description: c.description,
    category: c.category,
    price: item.list_price,
    condition_label: PLATFORMS[c.platform]?.conditions[condition] ?? null,
    updated_at: new Date().toISOString(),
  }));
  // Keep the status of listings that are already live; only refresh their text.
  const { data: existing } = await supabase.from("listings").select("platform, status").eq("item_id", itemId);
  const live = new Map((existing ?? []).map((e) => [e.platform, e.status]));
  const { error: upErr } = await supabase.from("listings").upsert(
    rows.map((r) => ({ ...r, status: live.get(r.platform) ?? "draft" })),
    { onConflict: "item_id,platform" },
  );
  if (upErr) throw new Error(upErr.message);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/listings");
}

function basicDescription(p: Product, condition: string, notes: string | null, city: string | null) {
  return [
    p.title,
    p.brand ? `Brand: ${p.brand}` : null,
    p.dimensions ? `Size: ${p.dimensions}` : null,
    p.color ? `Color: ${p.color}` : null,
    `Condition: ${condition}${notes ? `. ${notes}` : ""}`,
    p.retail_price ? `Retails for $${p.retail_price}.` : null,
    p.description,
    city ? `Pickup in ${city}.` : "Local pickup.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateListing(listingId: string, itemId: string, form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("listings")
    .update({
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      price: Number(form.get("price")) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/items/${itemId}`);
}

export async function setListingStatus(
  listingId: string,
  itemId: string,
  status: "draft" | "queued" | "posted" | "delisted",
  externalUrl?: string,
) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = { status, error: null, updated_at: new Date().toISOString() };
  if (status === "posted") update.posted_at = new Date().toISOString();
  if (externalUrl) update.external_url = externalUrl;
  const { error } = await supabase.from("listings").update(update).eq("id", listingId);
  if (error) throw new Error(error.message);

  if (status === "posted") {
    const { data: item } = await supabase.from("items").select("status").eq("id", itemId).single();
    if (item && !["sold", "picked_up"].includes(item.status)) {
      await supabase.from("items").update({ status: "listed" }).eq("id", itemId);
    }
  }
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/listings");
}

/** Queue every draft listing for an item: the extension (or crosslister export) picks them up. */
export async function queueAll(itemId: string) {
  const { supabase } = await requireUser();
  await supabase
    .from("listings")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("item_id", itemId)
    .in("status", ["draft", "delisted"]);
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/listings");
}
