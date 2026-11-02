"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Car } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setVanPhoto } from "@/lib/actions/driver";

// Foto da VAN (bucket PÚBLICO van-photos, path <driverId>/van-<timestamp> — vitrine do
// marketplace). Escrita dono-only por RLS; a leitura é a URL pública. Diferente da
// foto da pessoa (driver-photos, privado).
export function VanPhotoUploader({
  driverId,
  currentUrl,
  currentPath,
}: {
  driverId: string;
  currentUrl: string | null;
  currentPath: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (f.size > 5 * 1024 * 1024) {
      setError("A foto passa de 5 MB.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // Caminho novo a cada envio: a URL pública é cacheada pelo CDN, então sobrescrever
    // o mesmo caminho serviria a foto velha. A anterior é apagada depois.
    const path = `${driverId}/van-${Date.now()}`;
    const { error: upErr } = await supabase.storage
      .from("van-photos")
      .upload(path, f, { contentType: f.type });
    if (upErr) {
      setError("Não foi possível enviar a foto. Use JPG, PNG ou WebP.");
      setBusy(false);
      return;
    }
    await setVanPhoto(path);
    if (currentPath && currentPath !== path)
      await supabase.storage.from("van-photos").remove([currentPath]);
    setPreview(URL.createObjectURL(f));
    router.refresh();
    setBusy(false);
  }

  return (
    <div>
      <label className="relative block cursor-pointer overflow-hidden rounded-2xl bg-navy-900/5">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
          data-testid="van-photo-input"
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Foto da van"
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="flex h-44 w-full flex-col items-center justify-center gap-2 text-navy-700/50">
            <Car className="h-8 w-8" aria-hidden />
            <span className="text-sm">Toque para enviar a foto da van</span>
          </div>
        )}
        <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-navy-900 shadow">
          <Camera className="h-5 w-5" aria-hidden />
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-white">
            Enviando…
          </span>
        )}
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
