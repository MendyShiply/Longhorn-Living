"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat } from "@zxing/library";
import { checkProductCode } from "@/lib/codes";

/**
 * Camera barcode scanner. Works in phone browsers (needs https).
 * Also accepts a Bluetooth / USB scanner gun, which types the code + Enter into the box.
 *
 * With `productOnly`, shipping labels, return stickers and pallet labels are recognised and
 * skipped: the camera keeps running and the person is told to find the product barcode.
 */
export function Scanner({
  onScan,
  autoStart = false,
  productOnly = false,
}: {
  onScan: (code: string) => void;
  autoStart?: boolean;
  productOnly?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [on, setOn] = useState(false);
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ code: string; what: string } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setOn(false);
  }

  function accept(code: string) {
    setSkipped(null);
    stop();
    onScan(code);
  }

  async function start() {
    setErr(null);
    setSkipped(null);
    try {
      const reader = new BrowserMultiFormatReader();
      setOn(true);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          if (code === lastRef.current.code && now - lastRef.current.at < 2500) return;
          lastRef.current = { code, at: now };
          if (productOnly) {
            const check = checkProductCode(code, BarcodeFormat[result.getBarcodeFormat()]);
            if (!check.ok) {
              navigator.vibrate?.([60, 60, 60]);
              setSkipped({ code, what: check.what ?? "label that isn't the product barcode" });
              return; // keep scanning
            }
          }
          navigator.vibrate?.(80);
          accept(code);
        },
      );
    } catch (e) {
      setOn(false);
      setErr(e instanceof Error ? e.message : "Camera not available");
    }
  }

  useEffect(() => {
    if (autoStart) start();
    return () => controlsRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {productOnly && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
          Scan the barcode <b>printed on the product box</b> by the maker (usually 12 or 13 digits under the bars). Skip
          shipping labels and return stickers. The scanner will tell you if it catches one.
        </p>
      )}
      <div className={`relative overflow-hidden rounded-xl bg-black ${on ? "" : "hidden"}`}>
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        {skipped && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-amber-100/95 p-3 text-sm text-amber-900 shadow">
            <b>That&apos;s a {skipped.what}.</b> Keep looking for the product barcode on the box.
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{skipped.code}</span>
              <button type="button" className="shrink-0 underline" onClick={() => accept(skipped.code)}>
                Use it anyway
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {on ? (
          <button type="button" className="btn-secondary flex-1" onClick={stop}>
            Stop camera
          </button>
        ) : (
          <button type="button" className="btn-primary flex-1 py-3 text-base" onClick={start}>
            📷 Scan barcode
          </button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (!code) return;
          if (productOnly) {
            const check = checkProductCode(code);
            if (!check.ok && skipped?.code !== code) {
              setSkipped({ code, what: check.what ?? "label that isn't the product barcode" });
              return;
            }
          }
          setSkipped(null);
          onScan(code);
          setManual("");
        }}
      >
        <input
          className="input"
          placeholder="Or type / use scanner gun"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoCapitalize="characters"
        />
        <button className="btn-secondary">Go</button>
      </form>
      {skipped && !on && (
        <p className="text-sm text-amber-800">
          <b>{skipped.code}</b> looks like a {skipped.what}. Scan the product barcode instead, or press Go again to use it
          anyway.
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
