import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Every page and Server Action goes through here: without a valid session you only see /login. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  // A published app without a password would be open to anyone, so production refuses to run that way.
  if (!isAuthEnabled()) {
    return process.env.NODE_ENV === "production" ? NextResponse.redirect(new URL("/login", request.url)) : NextResponse.next();
  }

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  // Server Actions and other non-GET requests get a plain 401 instead of a redirect.
  if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse("No autorizado", { status: 401 });

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
