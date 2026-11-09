import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clientIp, shouldAttempt } from "@/lib/access-log";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Rotas públicas (sem sessão). Tudo o mais exige login.
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/convite",
  "/captacao",
  "/auth",
  "/termos",
  "/privacidade",
  "/baixar",
  "/buscar",
  "/acesso-negado",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Renova a sessão a cada request e protege rotas privadas.
export async function updateSession(request: NextRequest, event?: NextFetchEvent) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() revalida o token no servidor (não confiar só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Log legal de acesso (IP + hora, 6 meses), por sessão: em segundo plano, sem atrasar a resposta. O banco decide
  // se grava (dedupe de 6 h por IP + usuário); aqui só se evita chamar à toa (não-GET, já enviado há 30 min).
  // (O prefetch do Next não é distinguível aqui — o middleware não recebe esses cabeçalhos — mas vem do mesmo
  // navegador e a deduplicação o absorve.)
  if (event && request.method === "GET") {
    const ip = clientIp(request.headers);
    if (ip && shouldAttempt(`${ip}|${user?.id ?? "-"}`)) {
      event.waitUntil(
        Promise.resolve(supabase.rpc("log_app_access", { p_ip: ip })).then(
          () => undefined,
          () => undefined, // o log nunca pode derrubar a requisição
        ),
      );
    }
  }

  // Área /admin: só quem está na allowlist (tabela admin_users, checada no banco por
  // is_admin()). Anônimo e qualquer outro usuário recebem 403 — não vão para o login.
  // O layout de /admin e as funções admin_* do banco conferem de novo (3 camadas).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    let allowed = false;
    if (user) {
      const { data } = await supabase.rpc("is_admin");
      allowed = data === true;
    }
    if (!allowed) {
      const denied = NextResponse.rewrite(new URL("/acesso-negado", request.url), {
        status: 403,
      });
      response.cookies.getAll().forEach((c) => denied.cookies.set(c));
      return denied;
    }
    return response;
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
