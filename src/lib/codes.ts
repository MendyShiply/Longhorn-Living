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

// ------------------------------------------------------------------
// Telling the product barcode apart from all the other stickers
// ------------------------------------------------------------------

/** GS1 check digit (works for UPC-A, UPC-E expanded, EAN-8, EAN-13, GTIN-14). */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Barcode symbologies printed on retail product packaging. */
const PRODUCT_FORMATS = new Set(["UPC_A", "UPC_E", "EAN_13", "EAN_8"]);

export interface LabelCheck {
  ok: boolean;
  /** Short name of what we think it is, e.g. "UPS shipping label". */
  what?: string;
}

/**
 * Is this scan the product's own barcode, or one of the shipping / return / pallet stickers?
 * `format` is the barcode symbology from the camera (UPC_A, CODE_128, ...) when known.
 */
export function checkProductCode(raw: string, format?: string | null): LabelCheck {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  const digits = /^\d+$/.test(code);

  // Our own label or hang tag
  if (/^LL-\d{6}$/.test(code)) return { ok: false, what: "Longhorn item label (this box is already in the system)" };

  // Retail barcodes printed by the manufacturer: always the right one
  if (format && PRODUCT_FORMATS.has(format)) return { ok: true };

  // Return and warehouse stickers
  if (/^LPN[A-Z0-9]+$/.test(code)) return { ok: false, what: "Amazon return sticker (LPN)" };
  if (/^RMA[A-Z0-9-]*$/.test(code) || /^RET[A-Z0-9-]{6,}$/.test(code)) return { ok: false, what: "return authorization label" };
  if (/^FBA[A-Z0-9]{6,}/.test(code)) return { ok: false, what: "Amazon warehouse shipment label" };

  // Shipping labels
  if (/^1Z[0-9A-Z]{16}$/.test(code)) return { ok: false, what: "UPS shipping label" };
  if (/^TBA\d{9,}$/.test(code)) return { ok: false, what: "Amazon delivery label" };
  if (/^(94|93|92|95)\d{20}$/.test(code) || /^420\d{5}(\d{4})?\d{20,22}$/.test(code)) return { ok: false, what: "USPS shipping label" };
  if (/^[A-Z]{2}\d{9}US$/.test(code)) return { ok: false, what: "USPS shipping label" };

  // Pallet labels (SSCC)
  if (/^(00)?\d{18}$/.test(code) && code.length >= 18 && code.startsWith("00")) return { ok: false, what: "pallet label" };

  // Amazon product identifiers that are fine to use
  if (/^B0[A-Z0-9]{8}$/.test(code) || /^X00[A-Z0-9]{7}$/.test(code)) return { ok: true };

  if (digits) {
    // A number printed as a retail barcode we already accepted above. Here it came from a
    // non retail symbology (usually CODE_128) or was typed in.
    if (validGtin(code) && (!format || code.length === 12 || code.length === 13)) {
      // Typed in, or a 12/13 digit Code128 with a valid UPC check digit: very likely a product code
      if (!format) return { ok: true };
      return format === "CODE_128" && code.length === 12
        ? { ok: false, what: "FedEx shipping label (or a product code printed as a sticker)" }
        : { ok: true };
    }
    if (code.length === 12 || code.length === 15 || code.length === 20 || code.length === 22 || code.length === 34)
      return { ok: false, what: "FedEx shipping label" };
    if (code.length > 14) return { ok: false, what: "shipping or tracking label" };
  }

  // Anything else (model numbers, Wayfair part numbers): let it through
  return { ok: true };
}
