import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  business_name: "Longhorn Living",
  pickup_city: "",
  default_price_pct: 50,
  condition_pct: {
    new_in_box: 50,
    open_box: 47,
    like_new: 45,
    good: 38,
    fair: 30,
    damaged: 20,
    parts_only: 10,
  },
  listing_method: "extension",
  crosslister_name: "vendoo",
  enabled_platforms: ["facebook", "offerup", "ebay", "craigslist"],
  label_size: "2x1",
};

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as Settings;
}

export function photoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/item-photos/${path}`;
}
