import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/session";

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
    const { name, classification, isActive, newPassword } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (classification !== undefined) updateData.classification = classification;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (newPassword) updateData.passwordHash = await hashPassword(newPassword);

    const designer = await prisma.user.update({
      where: { id, roles: { has: "DESIGNER" } },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        classification: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ designer });
  } catch (error) {
    console.error("Error updating designer:", error);
    return NextResponse.json({ error: "Failed to update designer" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.user.delete({
      where: { id, roles: { has: "DESIGNER" } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting designer:", error);
    return NextResponse.json({ error: "Failed to delete designer" }, { status: 500 });
  }
}
