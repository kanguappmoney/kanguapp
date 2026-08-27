// Slot de foto visível, SEM upload ainda. A foto real (Supabase Storage, bucket
// privado com RLS espelhando G5) é o próximo passo dedicado — ver
// supabase/deferred/student_photos_storage.sql.
export function PhotoSlot({ label = "Foto" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-navy-900/20 bg-navy-900/[0.02] p-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-900/5 text-2xl">
        📷
      </div>
      <div>
        <p className="text-sm font-medium text-navy-800">{label}</p>
        <p className="text-xs text-navy-700/50">Adicionar foto — em breve</p>
      </div>
    </div>
  );
}
