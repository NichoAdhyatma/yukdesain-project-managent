import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "yukdesain_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/client",
  "/client-portal",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow root and static assets
  if (pathname === "/" || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // API routes enforce their own role checks
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const [session, menus] = await Promise.all([
    prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: { select: { roles: true } } },
    }),
    prisma.menuItem.findMany({
      where: { isActive: true },
      include: { menu2Roles: true },
    }),
  ]);

  if (!session || session.expiresAt < new Date()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Page access is driven by the same menu_items + menu2_roles data that
  // controls which links the sidebar renders.
  const matched = menus
    .filter((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // A menu with no role rows is visible to everyone
  if (matched && matched.menu2Roles.length > 0) {
    const allowed = matched.menu2Roles.some((r) => r.role === session.activeRole);
    if (!allowed) {
      const fallback = new URL("/designer", request.url);
      return NextResponse.redirect(fallback);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
