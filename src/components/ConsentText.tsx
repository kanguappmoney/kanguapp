import { PRIVACY_EMAIL } from "@/lib/consent-texts";

// Renderiza os parágrafos de um consentimento, com o e-mail do canal de privacidade virando link (mailto).
export function ConsentText({ paragraphs, className = "" }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={`space-y-3 text-sm leading-relaxed ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(PRIVACY_EMAIL).map((part, j, arr) => (
            <span key={j}>
              {part}
              {j < arr.length - 1 && (
                <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold underline">
                  {PRIVACY_EMAIL}
                </a>
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
