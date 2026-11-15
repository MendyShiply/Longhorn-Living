"use client";
import { useEffect } from "react";
import { Barcode } from "@/components/Barcode";
import { money } from "@/lib/pricing";

const SIZES: Record<string, { w: string; h: string; bar: number }> = {
  "2x1": { w: "2in", h: "1in", bar: 28 },
  "2.25x1.25": { w: "2.25in", h: "1.25in", bar: 34 },
  "4x6": { w: "4in", h: "6in", bar: 90 },
};

export function LabelSheet(props: {
  code: string;
  title: string;
  price: number | null;
  where: string;
  size: string;
  kind: "box" | "tag";
  auto: boolean;
  business: string;
}) {
  const s = SIZES[props.size] ?? SIZES["2x1"];
  useEffect(() => {
    if (props.auto) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [props.auto]);

  const big = props.size === "4x6";
  return (
    <>
      <style>{`@page { size: ${s.w} ${s.h}; margin: 0; } html, body { margin: 0; background: white; }`}</style>
      <div className="no-print flex gap-2 p-3">
        <button className="btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <a className="btn-secondary" href={`?kind=${props.kind === "box" ? "tag" : "box"}`}>
          Switch to {props.kind === "box" ? "hang tag" : "box label"}
        </a>
      </div>
      <div
        style={{ width: s.w, height: s.h }}
        className="flex flex-col items-center justify-center overflow-hidden bg-white px-[0.06in] text-center text-black"
      >
        {props.kind === "tag" && (
          <div className={big ? "text-2xl font-bold" : "text-[9px] font-bold"}>{props.business}</div>
        )}
        <div className={`${big ? "text-xl" : "text-[8px]"} line-clamp-2 leading-tight`}>{props.title}</div>
        <Barcode value={props.code} height={s.bar} width={big ? 3 : 1.2} fontSize={big ? 28 : 10} />
        <div className={`flex w-full justify-between ${big ? "text-2xl" : "text-[8px]"}`}>
          <span>{props.where}</span>
          {props.price != null && <b>{money(props.price)}</b>}
        </div>
      </div>
    </>
  );
}
