import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { CROSSLISTERS, PLATFORMS } from "@/lib/platforms";
import { money } from "@/lib/pricing";

export default async function ListingsPage() {
  const { supabase } = await requireUser();
  const settings = await getSettings(supabase);
  const [{ data: ready }, { data: listings }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, list_price, product:products(title), listings(count)")
      .eq("status", "photographed")
      .order("updated_at", { ascending: false }),
    supabase
      .from("listings")
      .select("id, platform, status, price, error, item:items(id, code, product:products(title))")
      .in("status", ["queued", "posted", "error"])
      .order("updated_at", { ascending: false }),
  ]);
  const needsDelist = (listings ?? []).filter((l) => l.status === "queued" && l.error?.startsWith("Needs delisting"));
  const queued = (listings ?? []).filter((l) => l.status === "queued" && !l.error);
  const live = (listings ?? []).filter((l) => l.status === "posted");
  const crosslister = CROSSLISTERS[settings.crosslister_name ?? "other"] ?? CROSSLISTERS.other;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Listings</h1>
        <span className="muted">
          Posting method:{" "}
          <Link href="/settings" className="underline">
            {settings.listing_method === "extension" ? "Longhorn Chrome extension" : crosslister.name}
          </Link>
        </span>
      </div>

      {needsDelist.length > 0 && (
        <section className="card border-red-300 bg-red-50">
          <h2 className="mb-2 font-semibold text-red-800">Take these down (sold elsewhere)</h2>
          <List rows={needsDelist} />
        </section>
      )}

      <section className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ready to list ({ready?.length ?? 0})</h2>
          {settings.listing_method === "crosslister" && (
            <a className="btn-primary" href="/api/export/crosslister">
              ⬇️ Export all for {crosslister.name}
            </a>
          )}
        </div>
        <p className="muted mb-2">Photographed items. Open one to write and post its listings.</p>
        <ul className="divide-y divide-stone-100">
          {ready?.map((i) => (
            <li key={i.id}>
              <Link href={`/items/${i.id}`} className="flex justify-between gap-3 py-2">
                <span className="truncate">
                  <span className="font-mono text-xs text-stone-500">{i.code}</span> {(i.product as unknown as { title: string })?.title}
                </span>
                <b>{money(i.list_price)}</b>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Queued for posting ({queued.length})</h2>
        <List rows={queued} />
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Live ({live.length})</h2>
        <List rows={live} />
      </section>
    </div>
  );
}

type Row = { id: string; platform: string; price: number | null; item: unknown };
function List({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="muted">None.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((l) => {
        const item = l.item as { id: string; code: string; product: { title: string } | null };
        return (
          <li key={l.id}>
            <Link href={`/items/${item.id}`} className="flex justify-between gap-3 py-2">
              <span className="truncate">
                <span className="font-mono text-xs text-stone-500">{item.code}</span> {item.product?.title}
              </span>
              <span className="shrink-0 text-sm">
                {PLATFORMS[l.platform]?.name ?? l.platform} · {money(l.price)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
