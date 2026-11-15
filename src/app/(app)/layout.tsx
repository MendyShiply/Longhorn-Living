import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name } = await requireUser();
  const settings = await getSettings(supabase);
  return (
    <>
      <Nav businessName={settings.business_name} userName={name} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">{children}</main>
    </>
  );
}
