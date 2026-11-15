import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { STATUS_LABELS, STATUS_ORDER, type ItemStatus } from "@/lib/types";
import { money } from "@/lib/pricing";

export default async function Home() {
  const { supabase, role } = await requireUser();
  const [{ data: items }, { data: loads }, { data: sales }] = await Promise.all([
    supabase.from("items").select("status"),
    supabase.from("loads").select("id, code, source, pallet_count, status").order("created_at", { ascending: false }).limit(5),
    role === "worker" ? Promise.resolve({ data: [] as { sale_price: number; fees: number }[] }) : supabase.from("sales").select("sale_price, fees"),
  ]);
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ItemStatus, number>;
  for (const i of items ?? []) counts[i.status as ItemStatus]++;
  const revenue = (sales ?? []).reduce((a, s) => a + Number(s.sale_price) - Number(s.fees), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Today</h1>
        <Link href="/scan" className="btn-primary">
          📷 Start scanning
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["received", "identified", "built", "photographed", "listed"] as ItemStatus[]).map((s) => (
          <Link key={s} href={`/inventory?status=${s}`} className="card hover:border-brand-500">
            <div className="muted">{STATUS_LABELS[s]}</div>
            <div className="text-3xl font-bold">{counts[s]}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <div className="muted">Sold</div>
          <div className="text-3xl font-bold">{counts.sold + counts.picked_up}</div>
        </div>
        {role !== "worker" && (
          <div className="card">
            <div className="muted">Net sales (after fees)</div>
            <div className="text-3xl font-bold">{money(revenue)}</div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent loads</h2>
          <Link href="/loads" className="text-sm text-brand-600 underline">
            All loads
          </Link>
        </div>
        {!loads?.length && <p className="muted">No loads yet. Add the first truck under Loads.</p>}
        <ul className="divide-y divide-stone-100">
          {loads?.map((l) => (
            <li key={l.id}>
              <Link href={`/loads/${l.id}`} className="flex items-center justify-between py-2">
                <span>
                  <b>{l.code}</b> <span className="muted">{l.source}</span>
                </span>
                <span className="muted">
                  {l.pallet_count ?? "?"} pallets · {l.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
