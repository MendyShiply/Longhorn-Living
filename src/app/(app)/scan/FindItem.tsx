"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Scanner } from "@/components/Scanner";
import { supabaseBrowser } from "@/lib/supabase/client";

export function FindItem() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function onScan(code: string) {
    setMsg("Looking…");
    const supabase = supabaseBrowser();
    const c = code.trim().toUpperCase();
    const { data } = await supabase.from("items").select("id").or(`code.eq.${c},scanned_code.eq.${c}`).limit(1).maybeSingle();
    if (data) router.push(`/items/${data.id}`);
    else setMsg(`No item found for ${code}`);
  }
  return (
    <div className="space-y-2">
      <Scanner onScan={onScan} />
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
    </div>
  );
}
