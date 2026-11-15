import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getSettings, photoUrl } from "@/lib/settings";
import { markSold, updateItem, updateProduct, setItemStatus } from "@/app/actions";
import { CONDITION_LABELS, STATUS_LABELS, STATUS_ORDER, type ItemCondition, type ItemStatus, type Product } from "@/lib/types";
import { money, suggestPrice } from "@/lib/pricing";
import { PLATFORMS } from "@/lib/platforms";
import { PhotoPanel } from "./PhotoPanel";
import { IdentifyPanel } from "./IdentifyPanel";
import { ListingsPanel } from "./ListingsPanel";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role } = await requireUser();
  const settings = await getSettings(supabase);
  const { data: item } = await supabase
    .from("items")
    .select("*, product:products(*), load:loads(id, code), pallet:pallets(id, number)")
    .eq("id", id)
    .single();
  if (!item) notFound();

  const [{ data: photos }, { data: listings }, { data: cost }, { data: sale }] = await Promise.all([
    supabase.from("item_photos").select("id, storage_path, sort").eq("item_id", id).order("sort"),
    supabase.from("listings").select("*").eq("item_id", id).order("platform"),
    role === "worker" ? Promise.resolve({ data: null }) : supabase.from("item_costs").select("cost_basis").eq("item_id", id).maybeSingle(),
    role === "worker" ? Promise.resolve({ data: null }) : supabase.from("sales").select("*").eq("item_id", id).maybeSingle(),
  ]);

  const product = item.product as Product | null;
  const load = item.load as { id: string; code: string };
  const pallet = item.pallet as { id: string; number: number } | null;
  const suggested = suggestPrice(product?.retail_price, item.condition as ItemCondition | null, settings);
  const saveItem = updateItem.bind(null, id);
  const sold = markSold.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm text-stone-500">
            {item.code} ·{" "}
            <Link className="underline" href={`/loads/${load.id}`}>
              {load.code}
            </Link>
            {pallet && (
              <>
                {" "}
                ·{" "}
                <Link className="underline" href={`/pallets/${pallet.id}`}>
                  Pallet {pallet.number}
                </Link>
              </>
            )}
          </div>
          <h1 className="h1">{product?.title ?? "Unidentified item"}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{STATUS_LABELS[item.status as ItemStatus]}</span>
            {item.is_built && <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">Built</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/print/label/${id}?kind=box&auto=1`} target="_blank" className="btn-secondary">
            🏷️ Box label
          </a>
          <a href={`/print/label/${id}?kind=tag&auto=1`} target="_blank" className="btn-secondary">
            🪢 Hang tag
          </a>
        </div>
      </div>

      {/* Quick actions for the warehouse flow */}
      {!["sold", "picked_up"].includes(item.status) && (
        <div className="flex flex-wrap gap-2">
          {!item.is_built && (
            <form action={setItemStatus.bind(null, id, "built")}>
              <button className="btn-primary">🔧 Mark built</button>
            </form>
          )}
          <form action={setItemStatus.bind(null, id, "parts")}>
            <button className="btn-secondary">Keep for parts</button>
          </form>
          <form action={setItemStatus.bind(null, id, "scrap")}>
            <button className="btn-secondary">Scrap</button>
          </form>
        </div>
      )}

      {!product && <IdentifyPanel itemId={id} scannedCode={item.scanned_code} />}

      {product && (
        <section className="card space-y-3">
          <div className="flex gap-4">
            {product.image_urls?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_urls[0]} alt="" className="h-28 w-28 shrink-0 rounded-lg object-contain" />
            )}
            <div className="min-w-0 space-y-1 text-sm">
              <div>
                Retail: <b>{money(product.retail_price)}</b>
                {product.retailer && <span className="muted"> at {product.retailer}</span>}
              </div>
              {product.brand && <div>Brand: {product.brand}</div>}
              {product.model_number && <div>Model: {product.model_number}</div>}
              {product.dimensions && <div>Size: {product.dimensions}</div>}
              {product.source_url && (
                <a href={product.source_url} target="_blank" className="text-brand-600 underline">
                  Retailer page
                </a>
              )}
            </div>
          </div>
          {product.description && <p className="text-sm text-stone-700">{product.description}</p>}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-600">Edit product info (applies to every unit of this product)</summary>
            <form action={updateProduct.bind(null, product.id, id)} className="mt-3 grid gap-3 md:grid-cols-2">
              {(
                [
                  ["title", "Name"],
                  ["brand", "Brand"],
                  ["model_number", "Model number"],
                  ["upc", "UPC"],
                  ["asin", "ASIN"],
                  ["retailer_sku", "Retailer SKU"],
                  ["retailer", "Retailer"],
                  ["category", "Category"],
                  ["dimensions", "Dimensions"],
                  ["color", "Color"],
                  ["retail_price", "Retail price"],
                  ["source_url", "Retailer link"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input name={k} defaultValue={(product[k] as string | number | null) ?? ""} className="input" />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea name="description" defaultValue={product.description ?? ""} rows={3} className="input" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Retailer photo links (one per line)</label>
                <textarea name="image_urls" defaultValue={product.image_urls.join("\n")} rows={3} className="input font-mono text-xs" />
              </div>
              <button className="btn-primary md:col-span-2">Save product</button>
            </form>
          </details>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">This unit</h2>
        <form action={saveItem} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Condition</label>
            <select name="condition" defaultValue={item.condition ?? ""} className="input">
              <option value="">Not graded</option>
              {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={item.status} className="input">
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Condition notes (shown to buyers)</label>
            <input name="condition_notes" defaultValue={item.condition_notes ?? ""} className="input" placeholder="e.g. small scratch on left arm, all hardware included" />
          </div>
          <div>
            <label className="label">Price</label>
            <input name="list_price" inputMode="decimal" defaultValue={item.list_price ?? ""} className="input" />
            {suggested != null && <p className="muted mt-1">Suggested {money(suggested)} for this condition</p>}
          </div>
          <div>
            <label className="label">Location (shelf / row)</label>
            <input name="location" defaultValue={item.location ?? ""} className="input" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_built" defaultChecked={item.is_built} /> Assembled
          </label>
          <div className="md:col-span-2">
            <label className="label">Internal notes</label>
            <textarea name="notes" defaultValue={item.notes ?? ""} rows={2} className="input" />
          </div>
          {role !== "worker" && cost && (
            <p className="muted md:col-span-2">
              Cost basis (share of load cost): <b>{money(cost.cost_basis)}</b>
              {item.list_price ? ` · Profit at this price: ${money(Number(item.list_price) - Number(cost.cost_basis))}` : ""}
            </p>
          )}
          <button className="btn-primary md:col-span-2">Save</button>
        </form>
      </section>

      <PhotoPanel itemId={id} photos={(photos ?? []).map((p) => ({ id: p.id, url: photoUrl(p.storage_path) }))} />

      {product && (
        <ListingsPanel
          itemId={id}
          hasPrice={Boolean(item.list_price)}
          listingMethod={settings.listing_method}
          crosslister={settings.crosslister_name}
          listings={(listings ?? []).map((l) => ({
            id: l.id,
            platform: l.platform,
            platformName: PLATFORMS[l.platform]?.name ?? l.platform,
            createUrl: PLATFORMS[l.platform]?.createUrl ?? "",
            status: l.status,
            title: l.title ?? "",
            description: l.description ?? "",
            price: l.price,
            category: l.category,
            condition_label: l.condition_label,
            external_url: l.external_url,
            error: l.error,
          }))}
          photoUrls={[...(photos ?? []).map((p) => photoUrl(p.storage_path)), ...(product.image_urls ?? [])]}
        />
      )}

      {role !== "worker" && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{sale ? "Sale" : "Mark sold"}</h2>
          {sale ? (
            <p>
              Sold on {sale.platform ?? "?"} for <b>{money(sale.sale_price)}</b> (fees {money(sale.fees)}) on{" "}
              {new Date(sale.sold_at).toLocaleDateString()} {sale.buyer_name ? `to ${sale.buyer_name}` : ""}
              {cost && <> · Profit <b>{money(Number(sale.sale_price) - Number(sale.fees) - Number(cost.cost_basis))}</b></>}
            </p>
          ) : (
            <form action={sold} className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Sold on</label>
                <select name="platform" className="input" defaultValue="facebook">
                  {Object.values(PLATFORMS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="in_person">In person / walk in</option>
                </select>
              </div>
              <div>
                <label className="label">Sale price</label>
                <input name="sale_price" inputMode="decimal" defaultValue={item.list_price ?? ""} className="input" required />
              </div>
              <div>
                <label className="label">Fees</label>
                <input name="fees" inputMode="decimal" defaultValue="0" className="input" />
              </div>
              <div>
                <label className="label">Buyer name</label>
                <input name="buyer_name" className="input" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Buyer email (for receipt)</label>
                <input name="buyer_email" type="email" className="input" />
              </div>
              <button className="btn-primary md:col-span-2">Mark sold (and flag other listings to come down)</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
