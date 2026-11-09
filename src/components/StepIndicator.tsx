import { StepDot, type StepState } from "@/components/patterns";

// Indicador de passos numerado (1-2-3) com rótulos e conectores. Padrão de 3 cores do app:
// navy = concluído (✓), amarelo = passo atual, cinza = futuro.
export function StepIndicator({
  current,
  steps,
}: {
  current: number;
  steps: string[];
}) {
  return (
    <div className="flex items-start">
      {steps.map((label, i) => {
        const n = i + 1;
        const state: StepState = n < current ? "done" : n === current ? "current" : "future";
        const last = i === steps.length - 1;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className="flex-1" />
              <StepDot state={state}>{state === "done" ? "✓" : n}</StepDot>
              <span
                className={`flex-1 ${last ? "" : n < current ? "h-0.5 bg-navy-900" : "h-0.5 bg-navy-900/15"}`}
              />
            </div>
            <span
              className={`mt-1.5 text-xs ${
                state === "current" ? "font-semibold text-navy-900" : "text-navy-700/50"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
