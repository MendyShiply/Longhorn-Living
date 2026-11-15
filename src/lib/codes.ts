/**
 * Figure out what kind of code was scanned off a returns box.
 * Returns boxes carry all sorts of stickers, so we classify before looking up.
 */
export type CodeKind = "upc" | "ean" | "asin" | "fnsku" | "lpn" | "internal" | "text";

export function classifyCode(raw: string): { kind: CodeKind; code: string } {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (/^LL-\d{6}$/.test(code)) return { kind: "internal", code };
  if (/^\d{12}$/.test(code)) return { kind: "upc", code };
  if (/^\d{13}$/.test(code)) return { kind: "ean", code };
  if (/^\d{8}$/.test(code) || /^\d{14}$/.test(code)) return { kind: "upc", code };
  if (/^B0[A-Z0-9]{8}$/.test(code)) return { kind: "asin", code };
  if (/^X00[A-Z0-9]{7}$/.test(code)) return { kind: "fnsku", code };
  if (/^LPN[A-Z0-9]+$/.test(code)) return { kind: "lpn", code };
  return { kind: "text", code: raw.trim() };
}

export function isNumericBarcode(kind: CodeKind) {
  return kind === "upc" || kind === "ean";
}
