"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setDriverPhoto } from "@/lib/actions/driver";

// Foto do motorista (bucket privado driver-photos, path <driverId>/avatar).
// RLS: só o próprio dono sobe/lê. Exibição por URL assinada gerada no servidor.
export function DriverPhotoUploader({
  driverId,
  currentUrl,
}: {
  driverId: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setBusy(true);
    const supabase = createClient();
    const path = `${driverId}/avatar`;
    const { error } = await supabase.storage
      .from("driver-photos")
      .upload(path, f, { upsert: true, contentType: f.type });
    if (!error) {
      await setDriverPhoto(path);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <label className="relative cursor-pointer">
      <input type="file" accept="image/*" className="hidden" onChange={onPick} />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Foto do motorista"
          className="h-20 w-20 rounded-full object-cover ring-2 ring-yellow-400"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-navy-900/5 text-navy-700/50">
          <Camera className="h-7 w-7" />
        </div>
      )}
      <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400 text-navy-900 shadow">
        <Camera className="h-4 w-4" />
      </span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-xs text-white">
          …
        </span>
      )}
    </label>
  );
}
