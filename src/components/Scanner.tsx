"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

/**
 * Camera barcode scanner. Works in phone browsers (needs https).
 * Also accepts a Bluetooth / USB scanner gun, which types the code + Enter into the box.
 */
export function Scanner({ onScan, autoStart = false }: { onScan: (code: string) => void; autoStart?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [on, setOn] = useState(false);
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setOn(false);
  }

  async function start() {
    setErr(null);
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
          if (code === lastRef.current.code && now - lastRef.current.at < 3000) return;
          lastRef.current = { code, at: now };
          navigator.vibrate?.(80);
          stop();
          onScan(code);
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
      <div className={`overflow-hidden rounded-xl bg-black ${on ? "" : "hidden"}`}>
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
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
          if (manual.trim()) {
            onScan(manual.trim());
            setManual("");
          }
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
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
