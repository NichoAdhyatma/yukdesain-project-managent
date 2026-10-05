import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, href, icon, group, order, isActive, roles } = body;

    const menu = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(href !== undefined && { href }),
        ...(icon !== undefined && { icon }),
        ...(group !== undefined && { group }),
        ...(order !== undefined && { order }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Update Menu2Role if roles changed
    if (roles !== undefined) {
      // Delete existing Menu2Role entries
      await prisma.menu2Role.deleteMany({ where: { menuId: id } });
      // Create new ones
      if (Array.isArray(roles) && roles.length > 0) {
        await prisma.menu2Role.createMany({
          data: roles.map((role: string) => ({
            menuId: id,
            role,
          })),
        });
      }
    }

    return NextResponse.json({ menu });
  } catch (error) {
    console.error("Error updating menu:", error);
    return NextResponse.json({ error: "Failed to update menu" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.menuItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting menu:", error);
    return NextResponse.json({ error: "Failed to delete menu" }, { status: 500 });
  }
}
