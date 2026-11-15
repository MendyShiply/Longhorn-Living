import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { lookupCode } from "@/lib/lookup";

export const maxDuration = 120; // AI web search can take a little while

type Img = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as { code?: string; hint?: string; images?: Img[] };
  const images = (body.images ?? [])
    .filter((i) => ["image/jpeg", "image/png", "image/webp"].includes(i.mediaType) && i.base64)
    .slice(0, 3);
  if (!body.code && !images.length && !body.hint) {
    return NextResponse.json({ error: "Scan a code, add a photo, or type a description" }, { status: 400 });
  }
  try {
    const result = await lookupCode(supabase, body.code ?? "", { hint: body.hint, images });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lookup failed" }, { status: 500 });
  }
}
