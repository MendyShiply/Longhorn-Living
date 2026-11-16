"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Scanner } from "@/components/Scanner";
import { SearchLinks } from "@/components/SearchLinks";
import { receiveItem, setPalletStatus, openNextPallet } from "@/app/actions";
import { blobToBase64, resizeImage } from "@/lib/image";
import { CONDITION_LABELS, type ItemCondition, type Product, type ProductDraft } from "@/lib/types";
import { friendlyRound, money } from "@/lib/pricing";

type Lookup =
  | { status: "catalog"; product: Product; code: string; kind: string }
  | { status: "found"; draft: ProductDraft; code: string; kind: string; source: string }
  | { status: "not_found"; code: string; kind: string; message: string };

export function ScanStation(props: {
  palletId: string;
  palletStatus: string;
  loadId: string;
  conditionPct: Record<ItemCondition, number>;
  defaultPct: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [title, setTitle] = useState("");
  const [retail, setRetail] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("open_box");
  const [hint, setHint] = useState("");
  const [lastSaved, setLastSaved] = useState<{ id: string; code: string } | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);

  function reset() {
    setCode(null);
    setResult(null);
    setTitle("");
    setRetail("");
    setHint("");
    setError(null);
  }

  async function runLookup(body: { code?: string; hint?: string; images?: { mediaType: string; base64: string }[] }) {
    setBusy(body.images?.length ? "Reading the photo and searching retailers…" : "Looking it up…");
    setError(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lookup failed");
      const r = json as Lookup;
      setResult(r);
      if (r.status === "catalog") {
        setTitle(r.product.title);
        setRetail(r.product.retail_price?.toString() ?? "");
      } else if (r.status === "found") {
        setTitle(r.draft.title);
        setRetail(r.draft.retail_price?.toString() ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function onScan(scanned: string) {
    reset();
    setCode(scanned);
    await runLookup({ code: scanned });
  }

  async function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    const images = await Promise.all(
      Array.from(files)
        .slice(0, 3)
        .map(async (f) => ({ mediaType: "image/jpeg", base64: await blobToBase64(await resizeImage(f, 1400, 0.8)) })),
    );
    await runLookup({ code: code ?? undefined, hint: hint || undefined, images });
  }

  async function save(withProduct: boolean) {
    setBusy("Saving…");
    setError(null);
    try {
      let draft: ProductDraft | null = null;
      let productId: string | null = null;
      if (withProduct && result?.status === "catalog") productId = result.product.id;
      if (withProduct && result?.status === "found") {
        draft = { ...result.draft, title: title || result.draft.title, retail_price: retail ? Number(retail) : null };
      }
      if (withProduct && (!result || result.status === "not_found") && title) {
        draft = blankDraft(title, retail ? Number(retail) : null);
      }
      const saved = await receiveItem({
        palletId: props.palletId,
        scannedCode: code,
        productId,
        draft,
        condition,
      });
      setLastSaved(saved);
      if (autoPrint) window.open(`/print/label/${saved.id}?auto=1`, "_blank", "width=480,height=360");
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  const retailNum = Number(retail) || 0;
  const pct = props.conditionPct[condition] ?? props.defaultPct;
  const price = retailNum ? friendlyRound((retailNum * pct) / 100) : null;
  const product = result?.status === "catalog" ? result.product : result?.status === "found" ? result.draft : null;

  if (props.palletStatus === "done") {
    return (
      <div className="card space-y-3">
        <p>This pallet is marked done.</p>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setPalletStatus(props.palletId, "open").then(() => router.refresh())}>
            Reopen it
          </button>
          <button className="btn-primary" onClick={() => openNextPallet(props.loadId)}>
            Open next pallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lastSaved && (
        <div className="card flex items-center justify-between border-green-300 bg-green-50">
          <span>
            Saved <b className="font-mono">{lastSaved.code}</b>
          </span>
          <span className="flex gap-3 text-sm">
            <a className="underline" href={`/print/label/${lastSaved.id}?auto=1`} target="_blank">
              Print label
            </a>
            <a className="underline" href={`/items/${lastSaved.id}`}>
              Open
            </a>
          </span>
        </div>
      )}

      {!result && !busy && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Next box</h2>
          <Scanner onScan={onScan} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => photoInput.current?.click()}>
              🖼️ No barcode? Photo it
            </button>
            <button className="btn-secondary" onClick={() => setResult({ status: "not_found", code: "", kind: "text", message: "Enter it by hand." })}>
              ✍️ Enter by hand
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
            Print the box label automatically after saving
          </label>
        </section>
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          onPhotos(e.target.files);
          e.target.value = "";
        }}
      />

      {busy && (
        <div className="card flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          {busy}
        </div>
      )}

      {error && <div className="card border-red-300 bg-red-50 text-red-800">{error}</div>}

      {result && !busy && (
        <section className="card space-y-4">
          {code && (
            <div className="muted">
              Scanned <span className="font-mono">{code}</span>
              {result.status === "catalog" && <span className="ml-2 rounded bg-green-100 px-1.5 text-green-800">seen before</span>}
              {result.status === "found" && <span className="ml-2 rounded bg-blue-100 px-1.5 text-blue-800">found via {result.source}</span>}
            </div>
          )}

          {result.status === "not_found" && (
            <div className="space-y-3">
              <p className="text-amber-800">{result.message}</p>
              {code && result.kind !== "lpn" && (
                <SearchLinks code={code} label="Search the retail sites, then type the name and retail price below:" />
              )}
              <input className="input" placeholder="What do you see? e.g. 'grey 3 seat sofa, Wayfair, Zipcode Design'" value={hint} onChange={(e) => setHint(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => photoInput.current?.click()}>
                  🖼️ Photo the label
                </button>
                <button className="btn-secondary" disabled={!hint} onClick={() => runLookup({ code: code ?? undefined, hint })}>
                  🔎 Search with AI
                </button>
              </div>
            </div>
          )}

          {product?.image_urls?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_urls[0]} alt="" className="mx-auto max-h-48 rounded-lg object-contain" />
          )}

          <div className="grid gap-3">
            <div>
              <label className="label">Product</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product name" />
              {product?.brand && <p className="muted mt-1">{product.brand} {product.model_number ? `· ${product.model_number}` : ""}</p>}
              {product?.source_url && (
                <a href={product.source_url} target="_blank" className="text-sm text-brand-600 underline">
                  View on retailer site
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Retail price</label>
                <input className="input" inputMode="decimal" value={retail} onChange={(e) => setRetail(e.target.value)} placeholder="$" />
              </div>
              <div>
                <label className="label">Condition</label>
                <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg bg-brand-50 p-3">
              Suggested price: <b className="text-lg">{money(price)}</b> <span className="muted">({pct}% of retail)</span>
            </div>
          </div>

          {code && result.status !== "not_found" && result.kind !== "lpn" && (
            <details className="text-sm">
              <summary className="cursor-pointer text-brand-600">Double check the price on retail sites</summary>
              <div className="mt-2">
                <SearchLinks code={code} label="" />
              </div>
            </details>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={reset}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!title && result.status !== "not_found"} onClick={() => save(Boolean(title))}>
              {title ? "Save + label" : "Save unidentified"}
            </button>
          </div>
        </section>
      )}

      <button
        className="btn-secondary w-full"
        onClick={async () => {
          if (confirm("Mark this pallet as done?")) {
            await setPalletStatus(props.palletId, "done");
            router.refresh();
          }
        }}
      >
        ✅ Pallet done
      </button>
    </div>
  );
}

function blankDraft(title: string, retail: number | null): ProductDraft {
  return {
    title,
    retail_price: retail,
    upc: null,
    asin: null,
    model_number: null,
    retailer_sku: null,
    retailer: null,
    brand: null,
    category: null,
    description: null,
    dimensions: null,
    color: null,
    source_url: null,
    image_urls: [],
    lookup_source: "manual",
  };
}
