import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/db/proxy-session";

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);

  if (!userId && request.nextUrl.pathname.startsWith("/panel")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    // Conserva las cookies que haya podido limpiar el refresco de sesión.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/panel", "/panel/:path*", "/login"],
};
