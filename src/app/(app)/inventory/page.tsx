import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { photoUrl } from "@/lib/settings";
import { STATUS_LABELS, STATUS_ORDER, CONDITION_LABELS, type ItemCondition, type ItemStatus } from "@/lib/types";
import { money } from "@/lib/pricing";

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
      "id, code, status, condition, list_price, location, product:products!inner(title, retail_price, image_urls), load:loads(code), item_photos(storage_path, sort)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.load) query = query.eq("load_id", sp.load);
  if (sp.q) query = query.ilike("products.title", `%${sp.q.replace(/[%_]/g, "")}%`);

  // Unidentified items have no product, so fetch them separately unless searching by title.
  const [{ data: items }, { data: unidentified }] = await Promise.all([
    query,
    sp.q || (sp.status && sp.status !== "received")
      ? Promise.resolve({ data: [] })
      : (() => {
          let u = supabase
            .from("items")
            .select("id, code, status, condition, list_price, location, load:loads(code)")
            .is("product_id", null)
            .order("created_at", { ascending: false });
          if (sp.load) u = u.eq("load_id", sp.load);
          return u;
        })(),
  ]);

  type Row = {
    id: string;
    code: string;
    status: ItemStatus;
    condition: ItemCondition | null;
    list_price: number | null;
    location: string | null;
    product?: { title: string; retail_price: number | null; image_urls: string[] } | null;
    load?: { code: string } | null;
    item_photos?: { storage_path: string; sort: number }[];
  };
  const rows = [...((unidentified ?? []) as unknown as Row[]), ...((items ?? []) as unknown as Row[])];

  return (
    <div className="space-y-4">
      <h1 className="h1">Inventory</h1>
      <form className="flex flex-wrap gap-2">
        {sp.load && <input type="hidden" name="load" value={sp.load} />}
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Search product name" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[12rem]">
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
        {(sp.q || sp.status || sp.load) && (
          <Link href="/inventory" className="btn-secondary">
            Clear
          </Link>
        )}
      </form>
      <p className="muted">{rows.length} items</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((i) => {
          const photo = i.item_photos?.sort((a, b) => a.sort - b.sort)[0];
          const img = photo ? photoUrl(photo.storage_path) : i.product?.image_urls?.[0];
          return (
            <Link key={i.id} href={`/items/${i.id}`} className="card flex gap-3 hover:border-brand-500">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-stone-500">
                  {i.code} · {i.load?.code}
                </div>
                <div className="line-clamp-2 font-medium">{i.product?.title ?? <i className="text-amber-700">Needs identifying</i>}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
                  <b>{money(i.list_price)}</b>
                  <span className="muted">{STATUS_LABELS[i.status]}</span>
                  {i.condition && <span className="muted">{CONDITION_LABELS[i.condition].split(" (")[0]}</span>}
                  {i.location && <span className="muted">📍{i.location}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
