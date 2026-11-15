"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateListings, queueAll, setListingStatus, updateListing } from "@/app/listing-actions";
import { CROSSLISTERS } from "@/lib/platforms";
import { money } from "@/lib/pricing";

interface ListingRow {
  id: string;
  platform: string;
  platformName: string;
  createUrl: string;
  status: string;
  title: string;
  description: string;
  price: number | null;
  category: string | null;
  condition_label: string | null;
  external_url: string | null;
  error: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  queued: "bg-amber-100 text-amber-800",
  posted: "bg-green-100 text-green-800",
  sold: "bg-blue-100 text-blue-800",
  delisted: "bg-stone-200 text-stone-600",
  error: "bg-red-100 text-red-800",
};

export function ListingsPanel(props: {
  itemId: string;
  hasPrice: boolean;
  listingMethod: "extension" | "crosslister";
  crosslister: string | null;
  listings: ListingRow[];
  photoUrls: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const crosslister = CROSSLISTERS[props.crosslister ?? "other"] ?? CROSSLISTERS.other;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Listings</h2>
        <button
          className="btn-secondary"
          disabled={!!busy || !props.hasPrice}
          onClick={() => run("Writing listings for each platform…", () => generateListings(props.itemId))}
        >
          ✨ {props.listings.length ? "Rewrite listings" : "Write listings"}
        </button>
      </div>
      {!props.hasPrice && <p className="text-sm text-amber-800">Set a price above first.</p>}
      {busy && <p className="text-sm">{busy}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {props.listings.length > 0 && (
        <div className="rounded-lg bg-brand-50 p-3 text-sm">
          {props.listingMethod === "extension" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Posting with the <b>Longhorn Chrome extension</b>. Queue it, then click &quot;Post queued&quot; in the extension.
              </span>
              <button className="btn-primary" disabled={!!busy} onClick={() => run("Queuing…", () => queueAll(props.itemId))}>
                🚀 Post to all
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Posting with <b>{crosslister.name}</b>. {crosslister.note}
              </span>
              <a className="btn-primary" href={`/api/export/crosslister?items=${props.itemId}`}>
                ⬇️ Export for {crosslister.name}
              </a>
            </div>
          )}
        </div>
      )}

      {props.listings.map((l) => (
        <details key={l.id} className="rounded-lg border border-stone-200">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-3">
            <span className="font-medium">{l.platformName}</span>
            <span className="flex items-center gap-2 text-sm">
              {money(l.price)}
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[l.status] ?? ""}`}>{l.status}</span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-stone-200 p-3">
            {l.error && <p className="text-sm text-red-700">{l.error}</p>}
            <form
              action={async (fd) => run("Saving…", () => updateListing(l.id, props.itemId, fd))}
              className="space-y-2"
            >
              <div>
                <label className="label">Title</label>
                <input name="title" defaultValue={l.title} className="input" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea name="description" defaultValue={l.description} rows={6} className="input text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <label className="label">Price</label>
                  <input name="price" defaultValue={l.price ?? ""} className="input" />
                </div>
                <div className="muted pt-7">
                  {l.condition_label} {l.category ? `· ${l.category}` : ""}
                </div>
              </div>
              <button className="btn-secondary">Save changes</button>
            </form>
            <div className="flex flex-wrap gap-2">
              <CopyButton label="Copy title" text={l.title} />
              <CopyButton label="Copy description" text={l.description} />
              <CopyButton label="Copy photo links" text={props.photoUrls.join("\n")} />
              {l.createUrl && (
                <a href={l.createUrl} target="_blank" className="btn-secondary">
                  Open {l.platformName}
                </a>
              )}
              {l.status !== "posted" && l.status !== "sold" && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const url = prompt("Paste the listing link (optional)") ?? undefined;
                    run("Saving…", () => setListingStatus(l.id, props.itemId, "posted", url || undefined));
                  }}
                >
                  Mark posted
                </button>
              )}
              {(l.status === "posted" || l.status === "queued") && (
                <button className="btn-secondary" onClick={() => run("Saving…", () => setListingStatus(l.id, props.itemId, "delisted"))}>
                  Mark taken down
                </button>
              )}
              {l.external_url && (
                <a href={l.external_url} target="_blank" className="btn-secondary">
                  View live
                </a>
              )}
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
