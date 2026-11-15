import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { saveSettings, setUserRole } from "@/app/actions";
import { CONDITION_LABELS, type ItemCondition } from "@/lib/types";
import { CROSSLISTERS, PLATFORMS } from "@/lib/platforms";

export default async function SettingsPage() {
  const { supabase, role, user } = await requireUser();
  const settings = await getSettings(supabase);
  const canEdit = role !== "worker";
  const { data: team } = await supabase.from("profiles").select("id, full_name, role").order("created_at");
  let integrations: { provider: string; account_label: string | null; connected_at: string | null }[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await supabaseAdmin().from("integrations").select("provider, account_label, connected_at");
    integrations = data ?? [];
  }
  const conn = (p: string) => integrations.find((i) => i.provider === p && i.connected_at);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="h1">Settings</h1>

      <form action={saveSettings} className="space-y-5">
        <fieldset disabled={!canEdit} className="space-y-5">
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">Business</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Business name</label>
                <input name="business_name" defaultValue={settings.business_name} className="input" />
              </div>
              <div>
                <label className="label">Pickup city (goes in listings)</label>
                <input name="pickup_city" defaultValue={settings.pickup_city ?? ""} className="input" placeholder="e.g. Austin, TX" />
              </div>
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">How listings get posted</h2>
            <p className="muted">eBay always posts directly. This choice is for Facebook Marketplace, OfferUp, Craigslist and Mercari, which have no public posting API.</p>
            <label className="flex gap-3 rounded-lg border border-stone-200 p-3">
              <input type="radio" name="listing_method" value="extension" defaultChecked={settings.listing_method === "extension"} />
              <span>
                <b>Longhorn Chrome extension</b> (free)
                <span className="muted block">
                  Runs in your own browser where you&apos;re already logged in. Fills in each platform&apos;s form with its own version of the listing and photos, then posts.
                </span>
              </span>
            </label>
            <label className="flex gap-3 rounded-lg border border-stone-200 p-3">
              <input type="radio" name="listing_method" value="crosslister" defaultChecked={settings.listing_method === "crosslister"} />
              <span className="flex-1">
                <b>A paid crosslisting app</b>
                <span className="muted block">Use Vendoo, List Perfectly, Crosslist or similar. We export your items in a file it can import.</span>
                <select name="crosslister_name" defaultValue={settings.crosslister_name ?? "vendoo"} className="input mt-2 max-w-xs">
                  {Object.entries(CROSSLISTERS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div>
              <span className="label">Platforms to list on</span>
              <div className="flex flex-wrap gap-3">
                {Object.values(PLATFORMS).map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input type="checkbox" name="enabled_platforms" value={p.id} defaultChecked={settings.enabled_platforms.includes(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">Pricing</h2>
            <p className="muted">Suggested price = retail price × the percent for the item&apos;s condition.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="label">Default %</label>
                <input name="default_price_pct" type="number" defaultValue={settings.default_price_pct} className="input" />
              </div>
              {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((c) => (
                <div key={c}>
                  <label className="label">{CONDITION_LABELS[c].split(" (")[0]} %</label>
                  <input name={`pct_${c}`} type="number" defaultValue={settings.condition_pct[c]} className="input" />
                </div>
              ))}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">Labels</h2>
            <select name="label_size" defaultValue={settings.label_size} className="input max-w-xs">
              <option value="2x1">2 × 1 in (small thermal label)</option>
              <option value="2.25x1.25">2.25 × 1.25 in</option>
              <option value="4x6">4 × 6 in (shipping label size)</option>
            </select>
          </section>

          {canEdit && <button className="btn-primary w-full">Save settings</button>}
        </fieldset>
      </form>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Connected accounts</h2>
        {[
          { id: "quickbooks", name: "QuickBooks Online", what: "Sales and load costs post to the books automatically." },
          { id: "gmail", name: "Gmail", what: "Receipts and pickup confirmations go out from your own email." },
          { id: "ebay", name: "eBay", what: "One click posting and delisting on eBay." },
        ].map((p) => {
          const c = conn(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
              <span>
                <b>{p.name}</b>
                <span className="muted block">{c ? `Connected${c.account_label ? ` as ${c.account_label}` : ""}` : p.what}</span>
              </span>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{c ? "Connected" : "Coming next"}</span>
            </div>
          );
        })}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="muted">Workers can scan, build, photograph and list. Managers also see costs and profit and can mark sales.</p>
        <ul className="divide-y divide-stone-100">
          {team?.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span>
                {m.full_name} {m.id === user.id && <span className="muted">(you)</span>}
              </span>
              {role === "owner" && m.id !== user.id ? (
                <span className="flex gap-1">
                  {(["worker", "manager", "owner"] as const).map((r) => (
                    <form key={r} action={setUserRole.bind(null, m.id, r)}>
                      <button className={`rounded px-2 py-1 text-xs ${m.role === r ? "bg-brand-500 text-white" : "bg-stone-100"}`}>{r}</button>
                    </form>
                  ))}
                </span>
              ) : (
                <span className="muted">{m.role}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="muted">To add someone, have them create an account on the sign in page, then set their role here.</p>
      </section>
    </div>
  );
}
