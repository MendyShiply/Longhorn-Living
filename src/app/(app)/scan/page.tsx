import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { FindItem } from "./FindItem";

export default async function ScanPage() {
  const { supabase } = await requireUser();
  const { data: open } = await supabase
    .from("pallets")
    .select("id, number, loads(code)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const { data: loads } = await supabase.from("loads").select("id, code, source").eq("status", "receiving").order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <section className="card space-y-3">
        <h1 className="h1">Unload a pallet</h1>
        {open?.length ? (
          <div className="space-y-2">
            <p className="muted">Pick up where you left off:</p>
            {open.map((p) => (
              <Link key={p.id} href={`/pallets/${p.id}`} className="btn-primary w-full py-3 text-base">
                Load {(p.loads as unknown as { code: string })?.code} · Pallet {p.number}
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No pallet is open right now.</p>
        )}
        {loads?.length ? (
          <div className="space-y-2">
            <p className="muted">Or open a new pallet on a load:</p>
            {loads.map((l) => (
              <Link key={l.id} href={`/loads/${l.id}`} className="btn-secondary w-full">
                Load {l.code} {l.source ? `· ${l.source}` : ""}
              </Link>
            ))}
          </div>
        ) : (
          <Link href="/loads/new" className="btn-secondary w-full">
            + Add a load first
          </Link>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Find an item</h2>
        <p className="muted">Scan a Longhorn label or hang tag to pull up the item.</p>
        <FindItem />
      </section>
    </div>
  );
}
