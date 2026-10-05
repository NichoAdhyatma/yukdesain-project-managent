import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: "roles must be an array" }, { status: 400 });
    }

    // Prevent users without OWNER role from adding OWNER
    const isCurrentOwner = user.roles.includes("OWNER");
    if (!isCurrentOwner && roles.includes("OWNER")) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const validRoles = ["OWNER", "DESIGNER"];
    for (const r of roles) {
      if (!validRoles.includes(r)) {
        return NextResponse.json({ error: `Invalid role: ${r}` }, { status: 400 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { roles },
      select: { id: true, name: true, email: true, roles: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Error updating roles:", error);
    return NextResponse.json({ error: "Failed to update roles" }, { status: 500 });
  }
}
