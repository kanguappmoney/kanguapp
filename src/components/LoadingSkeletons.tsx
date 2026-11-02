// Esqueletos de carregamento (loading.tsx das telas do motorista). Aparecem na
// hora em que a navegação começa, enquanto o servidor busca o dado — o
// diagnóstico do toque mostrou que a tela ficava parada 0,75–1,7 s sem nenhum
// sinal. Visual do app (cabeçalho branco, cards brancos arredondados), só com o
// `animate-pulse` do Tailwind — sem spinner customizado.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-navy-900/10 ${className}`} />;
}

// Cabeçalho fixo igual ao das telas (título real + avatar/sino em placeholder).
export function HeaderSkeleton({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-navy-900/10 bg-white px-5 pb-5 pt-6">
      <div className="space-y-2">
        {title ? (
          <h1 className="text-xl font-bold text-navy-900">{title}</h1>
        ) : (
          <Bar className="h-6 w-40 animate-pulse" />
        )}
        {subtitle ? (
          <p className="text-sm text-navy-700/50">{subtitle}</p>
        ) : (
          <Bar className="h-4 w-28 animate-pulse" />
        )}
      </div>
      <div className="flex gap-2">
        <div className="h-11 w-11 animate-pulse rounded-full bg-navy-900/10" />
        <div className="h-11 w-11 animate-pulse rounded-full bg-navy-900/10" />
      </div>
    </header>
  );
}

function CardSkeleton({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm ${className}`}>
      <Bar className="h-4 w-1/2" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Bar key={i} className="h-3 w-3/4" />
      ))}
    </div>
  );
}

// Tela comum: cabeçalho + bloco de ação + lista de cards.
export function ListPageSkeleton({
  title,
  subtitle,
  cards = 4,
  action = true,
}: {
  title?: string;
  subtitle?: string;
  cards?: number;
  action?: boolean;
}) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <HeaderSkeleton title={title} subtitle={subtitle} />
      <div className="animate-pulse space-y-3 px-4 pb-6 pt-4">
        {action && <Bar className="h-12 w-full rounded-xl" />}
        {Array.from({ length: cards }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Home: saudação + 3 contadores + mapa + lista de rotas.
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <HeaderSkeleton />
      <div className="animate-pulse space-y-4 px-4 pb-6 pt-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
              <Bar className="h-4 w-6" />
              <Bar className="mt-3 h-6 w-8" />
            </div>
          ))}
        </div>
        <div className="h-56 rounded-2xl bg-navy-900/10" />
        <Bar className="h-3 w-24" />
        <CardSkeleton lines={3} />
      </div>
    </div>
  );
}

// Financeiro: abas + cards do painel em grade.
export function FinanceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <HeaderSkeleton title="Financeiro" subtitle="Gestão inteligente" />
      <div className="animate-pulse space-y-4 px-4 pb-6 pt-4">
        <Bar className="h-10 w-full rounded-xl" />
        <Bar className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Modo Direção: tela imersiva (mapa escuro) + bottom sheet com a parada.
export function DriveSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando"
      className="fixed inset-0 z-40 flex justify-center bg-navy-900"
    >
      <div className="relative flex h-full w-full max-w-md flex-col">
        <div className="space-y-2 px-5 pt-6">
          <div className="h-3 w-20 animate-pulse rounded bg-white/20" />
          <div className="h-5 w-48 animate-pulse rounded bg-white/20" />
        </div>
        <div className="mt-auto animate-pulse rounded-t-3xl bg-white p-4 pb-8">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-navy-900/15" />
          <div className="space-y-3 rounded-2xl border border-navy-900/10 p-4">
            <Bar className="h-3 w-24" />
            <Bar className="h-5 w-40" />
            <Bar className="h-3 w-56" />
            <Bar className="h-14 w-full rounded-2xl" />
          </div>
          <Bar className="mt-4 h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
