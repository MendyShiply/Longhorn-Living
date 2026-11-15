"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addPhoto, deletePhoto } from "@/app/actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/image";

export function PhotoPanel({ itemId, photos }: { itemId: string; photos: { id: string; url: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = supabaseBrowser();
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`);
      const blob = await resizeImage(list[i]);
      const path = `${itemId}/${Date.now()}-${i}.jpg`;
      const { error } = await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) {
        alert(error.message);
        break;
      }
      await addPhoto(itemId, path);
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Real photos</h2>
        <button className="btn-primary" onClick={() => input.current?.click()} disabled={!!busy}>
          📸 Add photos
        </button>
      </div>
      <p className="muted">Take them after it&apos;s built: front, side, back, close up of any flaw, and the label.</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      {busy && <p className="text-sm">{busy}</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            <button
              className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
              onClick={async () => {
                if (confirm("Delete this photo?")) {
                  await deletePhoto(p.id, itemId);
                  router.refresh();
                }
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
