"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function Barcode({ value, height = 40, width = 1.6, fontSize = 14 }: { value: string; height?: number; width?: number; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, { format: "CODE128", height, width, fontSize, margin: 0, displayValue: true });
    }
  }, [value, height, width, fontSize]);
  return <svg ref={ref} />;
}
