import Link from "next/link";
import { notFound } from "next/navigation";
import { openNextPallet, updateLoad } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { money } from "@/lib/pricing";

export default async function LoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role } = await requireUser();
  const { data: load } = await supabase.from("loads").select("*").eq("id", id).single();
  if (!load) notFound();

  const [{ data: pallets }, { data: items }, { data: sales }] = await Promise.all([
    supabase.from("pallets").select("id, number, status, notes, items(count)").eq("load_id", id).order("number"),
    supabase.from("items").select("id, status, product:products(retail_price)").eq("load_id", id),
    role === "worker"
      ? Promise.resolve({ data: [] as { sale_price: number; fees: number }[] })
      : supabase.from("sales").select("sale_price, fees, items!inner(load_id)").eq("items.load_id", id),
  ]);

  const retailTotal = (items ?? []).reduce(
    (a, i) => a + Number((i.product as unknown as { retail_price: number | null } | null)?.retail_price ?? 0),
    0,
  );
  const soldNet = (sales ?? []).reduce((a, s) => a + Number(s.sale_price) - Number(s.fees), 0);
  const profit = soldNet - Number(load.total_cost ?? 0);
  const openPallet = pallets?.find((p) => p.status === "open");
  const next = openNextPallet.bind(null, id);
  const save = updateLoad.bind(null, id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Load {load.code}</h1>
          <p className="muted">
            {load.source ?? "Unknown source"} · {load.purchased_at} · {pallets?.length ?? 0} of {load.pallet_count ?? "?"} pallets opened
          </p>
        </div>
        <div className="flex gap-2">
          {openPallet && (
            <Link href={`/pallets/${openPallet.id}`} className="btn-secondary">
              Continue pallet {openPallet.number}
            </Link>
          )}
          <form action={next}>
            <button className="btn-primary">Open next pallet</button>
          </form>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items found" value={String(items?.length ?? 0)} />
        <Stat label="Retail value found" value={money(retailTotal)} />
        {role !== "worker" && (
          <>
            <Stat label="Load cost" value={money(load.total_cost)} />
            <Stat label="Profit so far" value={money(profit)} tone={profit >= 0 ? "good" : "bad"} />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Pallets</h2>
        {!pallets?.length && <p className="muted">No pallets opened yet. Tap &quot;Open next pallet&quot; to start.</p>}
        <ul className="divide-y divide-stone-100">
          {pallets?.map((p) => (
            <li key={p.id}>
              <Link href={`/pallets/${p.id}`} className="flex items-center justify-between py-2">
                <span>
                  <b>Pallet {p.number}</b> {p.notes && <span className="muted">· {p.notes}</span>}
                </span>
                <span className="muted">
                  {(p.items as unknown as { count: number }[])[0]?.count ?? 0} items ·{" "}
                  <span className={p.status === "open" ? "text-amber-700" : "text-green-700"}>{p.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href={`/inventory?load=${id}`} className="mt-3 inline-block text-sm text-brand-600 underline">
          See all items from this load
        </Link>
      </section>

      {role !== "worker" && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Edit load details</summary>
          <form action={save} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Bought from" name="source" value={load.source} />
            <Field label="Kind of returns" name="retailer_mix" value={load.retailer_mix} />
            <Field label="Pallet count" name="pallet_count" value={load.pallet_count} type="number" />
            <Field label="Date" name="purchased_at" value={load.purchased_at} type="date" />
            <Field label="Total cost" name="total_cost" value={load.total_cost} />
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={load.status} className="input">
                <option value="receiving">Receiving</option>
                <option value="complete">Complete</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea name="notes" defaultValue={load.notes ?? ""} className="input" rows={2} />
            </div>
            <button className="btn-primary md:col-span-2">Save</button>
          </form>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className={`text-2xl font-bold ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}

function Field({ label, name, value, type = "text" }: { label: string; name: string; value: unknown; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name={name} type={type} defaultValue={value == null ? "" : String(value)} className="input" />
    </div>
  );
}
