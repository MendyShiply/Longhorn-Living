import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { STATUS_LABELS, type ItemStatus } from "@/lib/types";
import { money } from "@/lib/pricing";
import { ScanStation } from "./ScanStation";

export default async function PalletPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: pallet } = await supabase.from("pallets").select("*, loads(id, code)").eq("id", id).single();
  if (!pallet) notFound();
  const settings = await getSettings(supabase);
  const { data: items } = await supabase
    .from("items")
    .select("id, code, status, list_price, product:products(title, retail_price)")
    .eq("pallet_id", id)
    .order("created_at", { ascending: false });
  const load = pallet.loads as unknown as { id: string; code: string };
  const retail = (items ?? []).reduce(
    (a, i) => a + Number((i.product as unknown as { retail_price: number | null } | null)?.retail_price ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href={`/loads/${load.id}`} className="text-sm text-brand-600 underline">
          ← Load {load.code}
        </Link>
        <h1 className="h1">Pallet {pallet.number}</h1>
        <p className="muted">
          {items?.length ?? 0} items · {money(retail)} retail found
        </p>
      </div>

      <ScanStation
        palletId={id}
        palletStatus={pallet.status}
        loadId={load.id}
        conditionPct={settings.condition_pct}
        defaultPct={settings.default_price_pct}
      />

      <section className="card">
        <h2 className="mb-2 font-semibold">On this pallet</h2>
        {!items?.length && <p className="muted">Nothing scanned yet.</p>}
        <ul className="divide-y divide-stone-100">
          {items?.map((i) => {
            const p = i.product as unknown as { title: string; retail_price: number | null } | null;
            return (
              <li key={i.id}>
                <Link href={`/items/${i.id}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-stone-500">{i.code}</span>
                    <span className="block truncate">{p?.title ?? <i className="text-amber-700">Needs identifying</i>}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block">{money(i.list_price)}</span>
                    <span className="muted">{STATUS_LABELS[i.status as ItemStatus]}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
