// Indicador de passos numerado (1-2-3) com rótulos, no estilo do mockup Kangu:
// círculo ativo = navy preenchido; próximos = anel amarelo; conectores entre eles.
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
        const active = n === current;
        const done = n < current;
        const last = i === steps.length - 1;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className="flex-1" />
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  active
                    ? "bg-navy-900 text-white"
                    : done
                      ? "bg-navy-900 text-white"
                      : "border-2 border-yellow-400 bg-white text-navy-900"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span
                className={`flex-1 ${
                  last ? "" : n < current ? "h-0.5 bg-navy-900" : "h-0.5 bg-yellow-400/60"
                }`}
              />
            </div>
            <span
              className={`mt-1.5 text-xs ${
                active ? "font-semibold text-navy-900" : "text-navy-700/50"
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
