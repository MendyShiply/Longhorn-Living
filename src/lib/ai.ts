import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ProductDraft } from "./types";
import { PLATFORMS } from "./platforms";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function ai() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ------------------------------------------------------------------
// Product identification
// ------------------------------------------------------------------

const REPORT_TOOL = {
  name: "report_product",
  description:
    "Report the identified product. Call this exactly once when you are done researching, even if you could only partly identify it (set found=false if you could not identify it at all).",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: [
      "found",
      "title",
      "brand",
      "model_number",
      "upc",
      "asin",
      "retailer_sku",
      "retailer",
      "category",
      "description",
      "dimensions",
      "color",
      "retail_price",
      "source_url",
      "image_urls",
    ],
    properties: {
      found: { type: "boolean" },
      title: { type: "string", description: "Product name as the retailer lists it" },
      brand: { type: ["string", "null"] },
      model_number: { type: ["string", "null"] },
      upc: { type: ["string", "null"] },
      asin: { type: ["string", "null"] },
      retailer_sku: { type: ["string", "null"], description: "Retailer part / item number, e.g. Wayfair SKU" },
      retailer: {
        type: ["string", "null"],
        enum: ["wayfair", "amazon", "walmart", "homedepot", "lowes", "target", "costco", "other", null],
      },
      category: { type: ["string", "null"], description: "e.g. Sofa, Bar stool, Dresser, TV stand" },
      description: { type: ["string", "null"], description: "2 to 4 sentence factual description" },
      dimensions: { type: ["string", "null"], description: 'e.g. 84"W x 35"D x 33"H' },
      color: { type: ["string", "null"] },
      retail_price: { type: ["number", "null"], description: "Current or typical new price in USD" },
      source_url: { type: ["string", "null"], description: "Product page URL where you found it" },
      image_urls: {
        type: "array",
        items: { type: "string" },
        description: "Direct image URLs of the product if you found any (may be empty)",
      },
    },
  },
};

const IDENTIFY_SYSTEM = `You identify furniture and home goods from customer return loads (Wayfair, Amazon, Walmart, Home Depot, Lowe's and similar) so they can be resold.
You get a scanned code and/or photos of the box label or item. Use web search to find the exact product on the original retailer's site, its current new price, and product details.
Codes you may see: UPC/EAN (numeric), Amazon ASIN (B0...), Amazon FNSKU (X00..., maps to an ASIN), Amazon return LPN stickers (LPN..., not searchable, ignore), Wayfair part numbers, manufacturer model numbers.
Prefer the retailer the box came from. If several sellers list it, use the original retailer's regular (not sale) price when visible.
Never invent a price or URL. Use null when unknown.
When finished, call report_product once.`;

export interface IdentifyInput {
  code?: string;
  codeKind?: string;
  hint?: string;
  images?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[];
}

export async function identifyProduct(input: IdentifyInput): Promise<ProductDraft | null> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of input.images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  const lines = [];
  if (input.code) lines.push(`Scanned code: ${input.code} (looks like: ${input.codeKind ?? "unknown"})`);
  if (input.hint) lines.push(`Note from the warehouse: ${input.hint}`);
  if (input.images?.length) lines.push("Photos of the box label and/or item are attached.");
  lines.push("Identify this product and report it.");
  content.push({ type: "text", text: lines.join("\n") });

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];

  for (let turn = 0; turn < 6; turn++) {
    const response = await ai()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: IDENTIFY_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }, REPORT_TOOL],
        messages,
      })
      .finalMessage();

    if (response.stop_reason === "refusal") return null;

    const report = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "report_product",
    );
    if (report) {
      if (response.stop_reason === "max_tokens") return null;
      const r = report.input as Record<string, unknown>;
      if (!r.found || typeof r.title !== "string" || !r.title) return null;
      return {
        title: r.title,
        brand: (r.brand as string) ?? null,
        model_number: (r.model_number as string) ?? null,
        upc: (r.upc as string) ?? null,
        asin: (r.asin as string) ?? null,
        retailer_sku: (r.retailer_sku as string) ?? null,
        retailer: (r.retailer as string) ?? null,
        category: (r.category as string) ?? null,
        description: (r.description as string) ?? null,
        dimensions: (r.dimensions as string) ?? null,
        color: (r.color as string) ?? null,
        retail_price: typeof r.retail_price === "number" ? r.retail_price : null,
        source_url: (r.source_url as string) ?? null,
        image_urls: Array.isArray(r.image_urls) ? (r.image_urls as string[]).slice(0, 8) : [],
        lookup_source: "ai",
      };
    }

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;
    // Finished without reporting: ask it to report what it has.
    messages.push({ role: "user", content: "Please call report_product now with what you found." });
  }
  return null;
}

// ------------------------------------------------------------------
// Listing copy for each platform
// ------------------------------------------------------------------

export interface ListingCopy {
  platform: string;
  title: string;
  description: string;
  category: string;
}

export interface ListingInput {
  product: Partial<ProductDraft>;
  conditionLabel: string;
  conditionNotes: string | null;
  isBuilt: boolean;
  price: number;
  pickupCity: string | null;
  businessName: string;
  platforms: string[];
}

export async function writeListings(input: ListingInput): Promise<ListingCopy[]> {
  const specs = input.platforms
    .map((id) => PLATFORMS[id])
    .filter(Boolean)
    .map((p) => `* ${p.id} (${p.name}): title max ${p.titleMax} chars, description max ${p.descriptionMax} chars. Style: ${p.style}`)
    .join("\n");

  const facts = {
    title: input.product.title,
    brand: input.product.brand,
    model: input.product.model_number,
    category: input.product.category,
    description: input.product.description,
    dimensions: input.product.dimensions,
    color: input.product.color,
    retail_price: input.product.retail_price,
    our_price: input.price,
    condition: input.conditionLabel,
    condition_notes: input.conditionNotes,
    assembled: input.isBuilt,
    pickup_city: input.pickupCity,
    seller: input.businessName,
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["listings"],
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["platform", "title", "description", "category"],
          properties: {
            platform: { type: "string", enum: input.platforms },
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string", description: "Best matching category name on that platform" },
          },
        },
      },
    },
  };

  const response = await ai()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system:
        "You write resale listings for a business that sells open box and customer return furniture at a big discount. Be honest about condition, never claim anything not in the facts, and never use stock phrases like 'don't miss out'. Write one listing per requested platform, following each platform's limits and style. Plain text only (no markdown).",
      messages: [
        {
          role: "user",
          content: `Platforms:\n${specs}\n\nItem facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The AI declined to write this listing.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No listing text returned");
  const parsed = JSON.parse(text.text) as { listings: ListingCopy[] };
  return parsed.listings.map((l) => {
    const spec = PLATFORMS[l.platform];
    return {
      ...l,
      title: spec ? l.title.slice(0, spec.titleMax) : l.title,
      description: spec ? l.description.slice(0, spec.descriptionMax) : l.description,
    };
  });
}
