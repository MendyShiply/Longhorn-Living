import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { LabelSheet } from "./LabelSheet";

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string; kind?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const settings = await getSettings(supabase);
  const { data: item } = await supabase
    .from("items")
    .select("id, code, list_price, scanned_code, product:products(title, model_number), pallet:pallets(number), load:loads(code)")
    .eq("id", id)
    .single();
  if (!item) notFound();
  const product = item.product as unknown as { title: string; model_number: string | null } | null;
  return (
    <LabelSheet
      code={item.code}
      title={product?.title ?? "Unidentified item"}
      price={item.list_price}
      where={`${(item.load as unknown as { code: string })?.code ?? ""} · P${(item.pallet as unknown as { number: number } | null)?.number ?? "?"}`}
      size={settings.label_size}
      kind={sp.kind === "tag" ? "tag" : "box"}
      auto={sp.auto === "1"}
      business={settings.business_name}
    />
  );
}
