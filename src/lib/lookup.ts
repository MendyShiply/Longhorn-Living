import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCode, isNumericBarcode, type CodeKind } from "./codes";
import { identifyProduct, aiEnabled } from "./ai";
import type { Product, ProductDraft } from "./types";

export type LookupResult =
  | { status: "catalog"; product: Product; code: string; kind: CodeKind }
  | { status: "found"; draft: ProductDraft; code: string; kind: CodeKind; source: string }
  | { status: "not_found"; code: string; kind: CodeKind; message: string };

/**
 * The lookup chain:
 *  1. Our own catalog (free and instant; every product we identify gets saved)
 *  2. UPCitemdb for numeric barcodes (free trial tier, or paid key)
 *  3. AI with web search: works for ASINs, Wayfair part numbers, model numbers,
 *     and photos of labels when there is no usable barcode
 */
export async function lookupCode(
  supabase: SupabaseClient,
  raw: string,
  opts: { hint?: string; images?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[] } = {},
): Promise<LookupResult> {
  const { kind, code } = classifyCode(raw || "");

  if (code) {
    const existing = await findInCatalog(supabase, code, kind);
    if (existing) return { status: "catalog", product: existing, code, kind };
  }

  if (code && isNumericBarcode(kind)) {
    const fromUpc = await upcItemDb(code);
    if (fromUpc && fromUpc.retail_price) return { status: "found", draft: fromUpc, code, kind, source: "upcitemdb" };
    // UPC found a name but no price: let the AI finish the job using the name as a hint.
    if (fromUpc && aiEnabled()) {
      const ai = await identifyProduct({
        code,
        codeKind: kind,
        hint: [opts.hint, `Barcode database says: ${fromUpc.title}${fromUpc.brand ? ` by ${fromUpc.brand}` : ""}`]
          .filter(Boolean)
          .join(". "),
        images: opts.images,
      });
      if (ai) return { status: "found", draft: { ...fromUpc, ...nonNull(ai), upc: code }, code, kind, source: "ai" };
      return { status: "found", draft: fromUpc, code, kind, source: "upcitemdb" };
    }
  }

  if (!aiEnabled()) {
    return { status: "not_found", code, kind, message: "Not in the catalog. AI lookup is off (no ANTHROPIC_API_KEY), so enter it by hand." };
  }

  if (kind === "lpn" && !opts.images?.length && !opts.hint) {
    return {
      status: "not_found",
      code,
      kind,
      message: "That is an Amazon return sticker (LPN), which can't be searched. Scan another barcode on the box or snap a photo of the label.",
    };
  }

  const draft = await identifyProduct({
    code: kind === "lpn" ? undefined : code || undefined,
    codeKind: kind,
    hint: opts.hint,
    images: opts.images,
  });
  if (draft) {
    if (kind === "upc" || kind === "ean") draft.upc ??= code;
    if (kind === "asin") draft.asin ??= code;
    return { status: "found", draft, code, kind, source: "ai" };
  }
  return { status: "not_found", code, kind, message: "Couldn't identify it. Try a photo of the label, or type what you see." };
}

async function findInCatalog(supabase: SupabaseClient, code: string, kind: CodeKind): Promise<Product | null> {
  const { data: mapped } = await supabase
    .from("product_codes")
    .select("product:products(*)")
    .eq("code", code)
    .maybeSingle();
  const viaCode = (mapped as { product: Product | null } | null)?.product;
  if (viaCode) return viaCode;

  const column =
    kind === "upc" || kind === "ean" ? "upc" : kind === "asin" ? "asin" : null;
  if (column) {
    const { data } = await supabase.from("products").select("*").eq(column, code).limit(1).maybeSingle();
    if (data) return data as Product;
  }
  const { data } = await supabase
    .from("products")
    .select("*")
    .or(`model_number.ilike.${escapeLike(code)},retailer_sku.ilike.${escapeLike(code)}`)
    .limit(1)
    .maybeSingle();
  return (data as Product) ?? null;
}

function escapeLike(s: string) {
  return s.replace(/[%_,()]/g, "");
}

async function upcItemDb(upc: string): Promise<ProductDraft | null> {
  const key = process.env.UPCITEMDB_KEY;
  const url = key
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${upc}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`;
  try {
    const res = await fetch(url, {
      headers: key ? { user_key: key, key_type: "3scale" } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: {
        title?: string;
        brand?: string;
        model?: string;
        description?: string;
        category?: string;
        dimension?: string;
        color?: string;
        images?: string[];
        highest_recorded_price?: number;
        offers?: { merchant?: string; price?: number; link?: string }[];
      }[];
    };
    const it = json.items?.[0];
    if (!it?.title) return null;
    const offers = (it.offers ?? []).filter((o) => o.price && o.price > 0);
    const bigBox = offers.find((o) => /wayfair|amazon|walmart|home depot|lowe/i.test(o.merchant ?? ""));
    const price = bigBox?.price ?? (offers.length ? Math.max(...offers.map((o) => o.price!)) : null);
    return {
      title: it.title,
      brand: it.brand || null,
      model_number: it.model || null,
      upc,
      asin: null,
      retailer_sku: null,
      retailer: retailerFromMerchant(bigBox?.merchant),
      category: it.category?.split(">").pop()?.trim() || null,
      description: it.description || null,
      dimensions: it.dimension || null,
      color: it.color || null,
      retail_price: price ?? null,
      source_url: bigBox?.link ?? null,
      image_urls: (it.images ?? []).slice(0, 8),
      lookup_source: "upcitemdb",
    };
  } catch {
    return null;
  }
}

function retailerFromMerchant(m?: string): string | null {
  if (!m) return null;
  const s = m.toLowerCase();
  if (s.includes("wayfair")) return "wayfair";
  if (s.includes("amazon")) return "amazon";
  if (s.includes("walmart")) return "walmart";
  if (s.includes("home depot")) return "homedepot";
  if (s.includes("lowe")) return "lowes";
  return "other";
}

function nonNull<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}
