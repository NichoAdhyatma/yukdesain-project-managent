import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/designer")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("yukdesain_session")?.value;
  if (!sessionToken) {
    return NextResponse.next();
  }

  try {
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        user: {
          select: { id: true, roles: true },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.next();
    }

    const activeRole = session.activeRole;

    // If no active role set, allow access (will be caught by auth elsewhere)
    if (!activeRole) {
      return NextResponse.next();
    }

    // Lookup MenuItem by href → check Menu2Role
    const menuItem = await prisma.menuItem.findFirst({
      where: { href: pathname },
      include: { menu2Roles: true },
    });

    // If no MenuItem defined, allow access
    if (!menuItem) {
      return NextResponse.next();
    }

    // If menu has no Menu2Role entries, allow access
    if (!menuItem.menu2Roles || menuItem.menu2Roles.length === 0) {
      return NextResponse.next();
    }

    // Check if active role is in Menu2Role
    const isAllowed = menuItem.menu2Roles.some((m2r) => m2r.role === activeRole);

    if (!isAllowed) {
      if (activeRole === "DESIGNER") {
        const url = new URL("/designer", request.url);
        return NextResponse.redirect(url);
      } else {
        const url = new URL("/dashboard", request.url);
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/designer", "/designer/:path*"],
};
