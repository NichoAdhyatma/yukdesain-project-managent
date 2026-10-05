import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";

    // Admin settings page: return all menus with Menu2Role (no activeRole filter)
    if (all && user.roles.includes("OWNER")) {
      const menus = await prisma.menuItem.findMany({
        orderBy: [{ group: "asc" }, { order: "asc" }],
        include: { menu2Roles: true },
      });
      return NextResponse.json({ menus });
    }

    // Normal: fetch menus with their Menu2Role entries, filter by activeRole
    const menus = await prisma.menuItem.findMany({
      where: { isActive: true },
      orderBy: [{ group: "asc" }, { order: "asc" }],
      include: { menu2Roles: true },
    });

    const visibleMenus = menus.filter((menu) => {
      if (!menu.menu2Roles || menu.menu2Roles.length === 0) return true;
      return menu.menu2Roles.some((m2r) => m2r.role === user.activeRole);
    });

    return NextResponse.json({ menus: visibleMenus });
  } catch (error) {
    console.error("Error fetching menus:", error);
    return NextResponse.json({ error: "Failed to fetch menus" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, href, icon, group, order, roles } = body;

    if (!name || !href || !icon || !group) {
      return NextResponse.json({ error: "name, href, icon, and group are required" }, { status: 400 });
    }

    const menu = await prisma.menuItem.create({
      data: {
        name,
        href,
        icon,
        group,
        order: order || 0,
      },
    });

    // Create Menu2Role entries for the new menu
    if (roles && Array.isArray(roles) && roles.length > 0) {
      await prisma.menu2Role.createMany({
        data: roles.map((role: string) => ({
          menuId: menu.id,
          role,
        })),
      });
    }

    return NextResponse.json({ menu }, { status: 201 });
  } catch (error) {
    console.error("Error creating menu:", error);
    return NextResponse.json({ error: "Failed to create menu" }, { status: 500 });
  }
}
