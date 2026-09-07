"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Camera,
  CalendarDays,
  Building2,
  MapPin,
  Home,
  Info,
} from "lucide-react";
import { saveNewStudent, setStudentPhoto } from "@/lib/actions/students";
import { createClient } from "@/lib/supabase/client";
import { StepIndicator } from "@/components/StepIndicator";
import { Logo } from "@/components/Logo";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const STEPS = ["Dados", "Escola", "Rota"];

// Campos obrigatórios por passo (a foto é a única exceção — não bloqueia).
const REQUIRED_BY_STEP: Record<number, [string, string][]> = {
  1: [
    ["full_name", "Nome"],
    ["birth_date", "Data de nascimento"],
    ["responsible_name", "Nome do responsável"],
    ["responsible_phone", "Telefone"],
    ["responsible_whatsapp", "WhatsApp"],
    ["responsible_email", "E-mail"],
  ],
  2: [
    ["school", "Escola"],
    ["school_address", "Endereço da escola"],
    ["turma", "Ano/Turma"],
    ["entry_time", "Entrada"],
    ["exit_time", "Saída"],
  ],
  3: [
    ["pickup_address", "Embarque"],
    ["dropoff_address", "Desembarque"],
  ],
};

export default function NovoAlunoPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [shift, setShift] = useState<"morning" | "afternoon" | "integral">("morning");
  // Embarque como {texto, coordenada}: quando "mesmo endereço" está ligado, o
  // desembarque espelha AMBOS (endereço e lat/lng) via inputs escondidos.
  const [pickupData, setPickupData] = useState<{
    value: string;
    lat: number | null;
    lng: number | null;
  }>({ value: "", lat: null, lng: null });
  const [sameAddress, setSameAddress] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function missingInStep(s: number): string[] {
    if (!formRef.current) return [];
    const fd = new FormData(formRef.current);
    return REQUIRED_BY_STEP[s]
      .filter(([name]) => !String(fd.get(name) ?? "").trim())
      .map(([, label]) => label);
  }

  function next() {
    const miss = missingInStep(step);
    if (miss.length) return setError(`Preencha: ${miss.join(", ")}.`);
    setError(null);
    setStep((s) => s + 1);
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function submit() {
    const miss = [...missingInStep(1), ...missingInStep(2), ...missingInStep(3)];
    if (miss.length) return setError(`Preencha: ${miss.join(", ")}.`);
    setError(null);
    setPending(true);

    const fd = new FormData(formRef.current!);
    const res = await saveNewStudent(fd);
    if (res.error || !res.id) {
      setPending(false);
      return setError(res.error ?? "Não foi possível salvar.");
    }

    // Foto é opcional. Sobe para <id>/avatar (RLS: só o motorista dono).
    if (photoFile) {
      const supabase = createClient();
      const path = `${res.id}/avatar`;
      const { error: upErr } = await supabase.storage
        .from("student-photos")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (!upErr) await setStudentPhoto(res.id, path);
      // Se a foto falhar, o aluno já está salvo — segue sem bloquear.
    }

    router.push(`/motorista/alunos/${res.id}`);
  }

  return (
    <>
      <header className="border-b border-navy-900/10 bg-white px-4 pb-5 pt-5 text-navy-900">
        <div className="flex items-center gap-3">
          <Link href="/motorista/alunos" className="text-navy-900/70">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <Logo variant="icon" className="h-10 w-10" />
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight text-navy-900">
              Adicionar aluno
            </h1>
            <p className="text-xs text-navy-700/50">Cadastre um novo passageiro</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900/5">
            <User className="h-5 w-5 text-navy-700/60" />
          </div>
        </div>
      </header>

      <div className="px-4 pb-8">
        <div className="mt-5 mb-6">
          <StepIndicator current={step} steps={STEPS} />
        </div>

        <form ref={formRef} className="space-y-4">
          <input type="hidden" name="shift" value={shift} />

          {/* ================= Passo 1 — Dados ================= */}
          <div className={step === 1 ? "space-y-4" : "hidden"}>
            <div className="flex justify-center">
              <PhotoPicker preview={photoPreview} onPick={onPickPhoto} />
            </div>
            <Field label="Nome completo" name="full_name" req placeholder="Digite o nome do aluno" />
            <Field label="Data de nascimento" name="birth_date" req type="date" icon={CalendarDays} />
            <Field label="Nome do responsável" name="responsible_name" req placeholder="Digite o nome do responsável" />
            <Field label="Telefone do responsável" name="responsible_phone" req type="tel" placeholder="(00) 00000-0000" />
            <Field label="WhatsApp do responsável" name="responsible_whatsapp" req type="tel" placeholder="(00) 00000-0000" />
            <Field label="E-mail do responsável" name="responsible_email" req type="email" placeholder="Digite o e-mail do responsável" />
          </div>

          {/* ================= Passo 2 — Escola ================= */}
          <div className={step === 2 ? "space-y-4" : "hidden"}>
            <SectionHeading>Dados escolares</SectionHeading>
            <Field label="Escola" name="school" req placeholder="Digite o nome da escola" icon={Building2} />
            <AddressAutocomplete
              label="Endereço da escola"
              name="school_address"
              latName="school_lat"
              lngName="school_lng"
              placeholder="Onde a criança é deixada de manhã"
            />
            <Field label="Ano / Turma" name="turma" req placeholder="Ex.: 6º ano A" />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-navy-800">Turno</span>
              <Segmented
                value={shift}
                onChange={setShift}
                options={[
                  { value: "morning", label: "Manhã" },
                  { value: "afternoon", label: "Tarde" },
                  { value: "integral", label: "Integral" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entra na escola" name="entry_time" req type="time" />
              <Field label="Sai da escola" name="exit_time" req type="time" />
            </div>
          </div>

          {/* ================= Passo 3 — Rota ================= */}
          <div className={step === 3 ? "space-y-4" : "hidden"}>
            <SectionHeading>Endereços</SectionHeading>

            <div className="rounded-2xl border border-navy-900/10 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="font-semibold text-navy-900">Embarque</span>
              </div>
              <AddressAutocomplete
                label=""
                name="pickup_address"
                latName="pickup_lat"
                lngName="pickup_lng"
                placeholder="Endereço de casa, onde pega a criança"
                withNumber
                onChange={setPickupData}
              />
            </div>

            <div className="rounded-2xl border border-navy-900/10 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <Home className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-navy-900">Desembarque</p>
                    <p className="text-xs text-navy-700/50">Mesmo endereço da casa</p>
                  </div>
                </div>
                <Toggle checked={sameAddress} onChange={setSameAddress} />
              </div>
              {sameAddress ? (
                // Espelha texto E coordenada do embarque (mesmo endereço → mesmo ponto).
                <>
                  <input type="hidden" name="dropoff_address" value={pickupData.value} />
                  <input type="hidden" name="dropoff_lat" value={pickupData.lat ?? ""} />
                  <input type="hidden" name="dropoff_lng" value={pickupData.lng ?? ""} />
                </>
              ) : (
                <div className="mt-3">
                  <AddressAutocomplete
                    label=""
                    name="dropoff_address"
                    latName="dropoff_lat"
                    lngName="dropoff_lng"
                    placeholder="Endereço de desembarque à tarde"
                    withNumber
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-yellow-400/15 px-3 py-2.5 text-sm text-navy-800">
              <Info className="h-4 w-4 shrink-0 text-yellow-600" />
              O responsável receberá um convite após o cadastro.
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((s) => s - 1);
                }}
                className="flex-1 rounded-xl border border-navy-900/15 py-3.5 font-semibold text-navy-900"
              >
                Voltar
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-xl bg-yellow-400 py-3.5 font-bold uppercase tracking-wide text-navy-900"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="flex-1 rounded-xl bg-yellow-400 py-3.5 font-bold uppercase tracking-wide text-navy-900 disabled:opacity-60"
              >
                {pending ? "Salvando…" : "Salvar aluno"}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function PhotoPicker({
  preview,
  onPick,
}: {
  preview: string | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <label className="cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Prévia da foto"
            className="h-24 w-24 rounded-full object-cover ring-2 ring-yellow-400"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-navy-900/20 bg-navy-900/5 text-navy-700/50">
            <Camera className="h-8 w-8" />
          </div>
        )}
      </label>
      <span className="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-navy-700/50">
        {preview ? "Trocar foto" : "Adicionar foto"}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-navy-900/15 bg-white">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-2.5 text-sm font-semibold ${
              active ? "bg-navy-900 text-white" : "text-navy-700/70"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-yellow-400" : "bg-navy-900/15"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-navy-900">{children}</h2>;
}

function Field({
  label,
  req,
  icon: Icon,
  ...props
}: {
  label: string;
  req?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">
        {label} {req && <span className="text-yellow-500">*</span>}
      </span>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-700/40" />
        )}
        <input
          {...props}
          className={`w-full rounded-xl border border-navy-900/15 bg-white py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40 ${
            Icon ? "pl-10 pr-3" : "px-3"
          }`}
        />
      </div>
    </label>
  );
}
