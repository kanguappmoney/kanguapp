"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setStudentPhoto } from "@/lib/actions/students";

// Upload/troca da foto do aluno num registro que já existe. A imagem vai para
// student-photos/<studentId>/avatar — a RLS do bucket só deixa o motorista dono
// subir. Bucket privado; a exibição usa URL assinada gerada no servidor.
export function PhotoUploader({
  studentId,
  currentUrl,
}: {
  studentId: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const path = `${studentId}/avatar`;
    const { error: upErr } = await supabase.storage
      .from("student-photos")
      .upload(path, f, { upsert: true, contentType: f.type });

    if (upErr) {
      setError("Não foi possível enviar a foto.");
    } else {
      await setStudentPhoto(studentId, path);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-navy-900/10 bg-white p-4">
      <label className="cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Foto do aluno"
            className="h-16 w-16 rounded-full object-cover ring-2 ring-yellow-400"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-900/5 text-navy-700/50">
            <Camera className="h-6 w-6" />
          </div>
        )}
      </label>
      <div>
        <p className="text-sm font-medium text-navy-900">Foto do aluno</p>
        <p className="text-xs text-navy-700/50">
          {busy
            ? "Enviando…"
            : `Toque para ${preview ? "trocar" : "adicionar"} a foto`}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
