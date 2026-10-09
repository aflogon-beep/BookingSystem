import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/db/proxy-session";
import { DEFAULT_LOCALE, isPublicPath, LOCALE_HEADER, PUBLIC_PATH_HEADER, splitLocale } from "@/lib/domain/i18n";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { locale, path } = splitLocale(pathname);

  // Web pública: /en/… se sirve con la misma página y el idioma va en una cabecera. Las cabeceras
  // se ponen siempre aquí, así que las que mande el navegador no cuentan.
  if (isPublicPath(path)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    requestHeaders.set(PUBLIC_PATH_HEADER, `${path}${search}`);
    if (locale === DEFAULT_LOCALE) return NextResponse.next({ request: { headers: requestHeaders } });
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  // /en/panel y demás: no existen.
  if (locale !== DEFAULT_LOCALE) return NextResponse.next();

  const { response, userId } = await updateSession(request);

  if (!userId && pathname.startsWith("/panel")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    // Conserva las cookies que haya podido limpiar el refresco de sesión.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/", "/en", "/en/:path*", "/experiencias/:path*", "/reserva/:path*", "/panel", "/panel/:path*", "/login"],
};
