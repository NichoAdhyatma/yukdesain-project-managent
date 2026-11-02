import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "yukdesain_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/client",
  "/client-portal",
  // Client portal is token-authenticated, not session-authenticated
  "/api/client-links/",
  // Lookup by project code — the code itself is the secret
  "/api/portal/lookup",
  // Meta Cloud API webhook — authenticated by X-Hub-Signature-256, not session
  "/api/whatsapp/webhook",
];

// API endpoints that expose owner-scoped data. Derived from the owner-only
// menus in menu2roles — designers only ever see their own workspace.
const OWNER_ONLY_API = [
  "/api/dashboard",
  "/api/financial",
  "/api/invoices",
  "/api/payments",
  "/api/storage",
  "/api/activity-logs",
  "/api/designers",
  "/api/services",
  "/api/form-links",
  "/api/menus",
  "/api/client-links",
  "/api/projects",
  "/api/settings/payment-accounts",
  "/api/wa-intakes",
  "/api/settings/whatsapp",
];

// /api/client-links/[token]/* is the public client portal.
const OWNER_ONLY_API_EXCEPT = ["/api/client-links/", "/api/settings/studio"];

// Designers update the status of projects they are assigned to.
const DESIGNER_API_ALLOWED = [/^\/api\/projects\/[^/]+\/status$/];

const SESSION_TTL = 15_000;
const RULES_TTL = 60_000;

type SessionInfo = { activeRole: string | null };

const sessionCache = new Map<string, { at: number; info: SessionInfo | null }>();
let rulesCache: { at: number; map: Map<string, string[]> } | null = null;

async function getSessionInfo(token: string): Promise<SessionInfo | null> {
  const cached = sessionCache.get(token);
  if (cached && Date.now() - cached.at < SESSION_TTL) return cached.info;

  const session = await prisma.session.findUnique({
    where: { token },
    select: { activeRole: true },
  });
  const info = session ? { activeRole: session.activeRole } : null;
  sessionCache.set(token, { at: Date.now(), info });
  return info;
}

async function getMenuRules(): Promise<Map<string, string[]>> {
  if (rulesCache && Date.now() - rulesCache.at < RULES_TTL) return rulesCache.map;

  const menus = await prisma.menuItem.findMany({
    where: { isActive: true },
    select: { href: true, menu2Roles: { select: { role: true } } },
  });
  const map = new Map<string, string[]>();
  for (const menu of menus) {
    map.set(menu.href, menu.menu2Roles.map((r) => r.role));
  }
  rulesCache = { at: Date.now(), map };
  return map;
}

function matchHref(pathname: string, hrefs: Iterable<string>): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname === "/" || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await getSessionInfo(sessionToken);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const activeRole = session.activeRole;

  if (pathname.startsWith("/api/")) {
    if (OWNER_ONLY_API_EXCEPT.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    const ownerOnly = OWNER_ONLY_API.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (ownerOnly && activeRole !== "OWNER") {
      if (DESIGNER_API_ALLOWED.some((re) => re.test(pathname))) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  const rules = await getMenuRules();
  const href = matchHref(pathname, rules.keys());
  if (!href) return NextResponse.next();

  const allowedRoles = rules.get(href)!;
  if (allowedRoles.length === 0) return NextResponse.next();

  if (!activeRole || !allowedRoles.includes(activeRole)) {
    const fallback = activeRole === "DESIGNER" ? "/designer" : "/login";
    return NextResponse.redirect(new URL(fallback, request.url));
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
