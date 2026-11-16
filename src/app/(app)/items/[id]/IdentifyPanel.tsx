"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { attachProduct } from "@/app/actions";
import { blobToBase64, resizeImage } from "@/lib/image";
import type { ProductDraft } from "@/lib/types";
import { money } from "@/lib/pricing";
import { SearchLinks } from "@/components/SearchLinks";

export function IdentifyPanel({ itemId, scannedCode }: { itemId: string; scannedCode: string | null }) {
  const router = useRouter();
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(images?: { mediaType: string; base64: string }[]) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: scannedCode ?? undefined, hint: hint || undefined, images }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(json.error);
    if (json.status === "catalog") {
      setDraft(json.product);
      setCatalogId(json.product.id);
    }
    else if (json.status === "found") {
      setDraft(json.draft);
      setCatalogId(null);
    }
    else setMsg(json.message);
  }

  return (
    <section className="card space-y-3 border-amber-300 bg-amber-50">
      <h2 className="text-lg font-semibold">Identify this item</h2>
      {scannedCode && (
        <p className="muted">
          Scanned code: <span className="font-mono">{scannedCode}</span>
        </p>
      )}
      {scannedCode && !/^LPN/i.test(scannedCode) && <SearchLinks code={scannedCode} />}
      <input className="input" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Describe it, or type a model number" />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => run()}>
          🔎 Search
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          🖼️ Use photos
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []).slice(0, 3);
          e.target.value = "";
          if (!files.length) return;
          const images = await Promise.all(files.map(async (f) => ({ mediaType: "image/jpeg", base64: await blobToBase64(await resizeImage(f, 1400, 0.8)) })));
          run(images);
        }}
      />
      {busy && <p className="text-sm">Searching… this can take up to a minute.</p>}
      {msg && <p className="text-sm text-amber-800">{msg}</p>}
      {draft && (
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="font-medium">{draft.title}</p>
          <p className="muted">
            {draft.brand} · Retail {money(draft.retail_price)}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="btn-primary"
              onClick={async () => {
                await attachProduct(itemId, catalogId ? { productId: catalogId } : { draft });
                router.refresh();
              }}
            >
              That&apos;s it
            </button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>
              Not right
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
