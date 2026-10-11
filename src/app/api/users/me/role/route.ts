import { NextResponse } from "next/server";
import {
  getCurrentUser,
  createSessionWithRole,
  setSessionCookieFromToken,
} from "@/lib/auth/session";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { activeRole } = body;

    if (!activeRole || !["OWNER", "DESIGNER"].includes(activeRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check user has this role in their roles array
    if (!user.roles.includes(activeRole)) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    // Re-create the JWT with the new activeRole
    const token = await createSessionWithRole(
      user.id,
      user.name,
      user.email,
      user.roles,
      activeRole
    );
    await setSessionCookieFromToken(token);

    return NextResponse.json({ success: true, activeRole });
  } catch (error) {
    console.error("Error switching role:", error);
    return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
  }
}
