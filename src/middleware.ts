import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        lista.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  // getClaims verifica el JWT en local cuando el proyecto firma con claves asimétricas (si no, consulta a Auth como
  // getUser). Solo decide si redirigir al login: la autorización de verdad la hace cada página con perfilActual().
  const { data } = await sb.auth.getClaims();
  const user = data?.claims?.sub ?? null;
  if (!user && /^\/(central|conductor)/.test(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(`/login?destino=${req.nextUrl.pathname}`, req.url));
  }
  return res;
}
export const config = { matcher: ["/central/:path*", "/conductor/:path*"] };
