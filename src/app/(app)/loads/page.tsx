import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { money } from "@/lib/pricing";

export default async function LoadsPage() {
  const { supabase, role } = await requireUser();
  const { data: loads } = await supabase
    .from("loads")
    .select("id, code, source, retailer_mix, purchased_at, total_cost, pallet_count, status, pallets(count), items(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Loads</h1>
        {role !== "worker" && (
          <Link href="/loads/new" className="btn-primary">
            + New load
          </Link>
        )}
      </div>
      {!loads?.length && <div className="card muted">No loads yet.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {loads?.map((l) => {
          const opened = (l.pallets as unknown as { count: number }[])[0]?.count ?? 0;
          const items = (l.items as unknown as { count: number }[])[0]?.count ?? 0;
          return (
            <Link key={l.id} href={`/loads/${l.id}`} className="card block hover:border-brand-500">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{l.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "complete" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {l.status}
                </span>
              </div>
              <div className="muted">
                {l.source ?? "Unknown source"} {l.retailer_mix ? `· ${l.retailer_mix}` : ""} · {l.purchased_at}
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span>
                  Pallets: <b>{opened}</b> / {l.pallet_count ?? "?"}
                </span>
                <span>
                  Items: <b>{items}</b>
                </span>
                {role !== "worker" && <span>Cost: {money(l.total_cost)}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
