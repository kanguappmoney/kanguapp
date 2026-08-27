/* eslint-disable @next/next/no-img-element */

// Logo oficial Kangu. Três versões:
//  - icon: canguru no quadrado amarelo (fundo transparente) — cabeçalhos, marca compacta
//  - vertical: símbolo + wordmark + tagline (transparente) — login/abertura
//  - horizontal: símbolo + wordmark lado a lado (FUNDO BRANCO) — só em fundo claro largo
const SRC = {
  icon: "/brand/kangu-icon.png",
  vertical: "/brand/kangu-vertical.png",
  horizontal: "/brand/kangu-horizontal.png",
} as const;

export function Logo({
  variant = "icon",
  className = "",
  alt = "Kangu",
}: {
  variant?: keyof typeof SRC;
  className?: string;
  alt?: string;
}) {
  return <img src={SRC[variant]} alt={alt} className={className} />;
}
