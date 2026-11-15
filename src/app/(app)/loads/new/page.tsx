import { createLoad } from "@/app/actions";
import { requireManager } from "@/lib/supabase/server";

export default async function NewLoad() {
  await requireManager();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={createLoad} className="card mx-auto max-w-lg space-y-4">
      <h1 className="h1">New load</h1>
      <p className="muted">You don&apos;t need to know what&apos;s inside. Just the basics from the seller.</p>
      <div>
        <label className="label">Bought from</label>
        <input name="source" className="input" placeholder="e.g. B-Stock, local liquidator" />
      </div>
      <div>
        <label className="label">What kind of returns</label>
        <input name="retailer_mix" className="input" placeholder="e.g. Wayfair furniture, Amazon mixed" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Number of pallets</label>
          <input name="pallet_count" type="number" min={1} className="input" placeholder="24" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="purchased_at" type="date" defaultValue={today} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Total cost (load + freight + fees)</label>
        <input name="total_cost" inputMode="decimal" className="input" placeholder="$" />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea name="notes" className="input" rows={2} />
      </div>
      <button className="btn-primary w-full">Create load</button>
    </form>
  );
}
