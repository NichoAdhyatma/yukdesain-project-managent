import { NextResponse } from "next/server";
import { getCurrentUser, getSessionToken, updateSessionActiveRole } from "@/lib/auth/session";

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

    const token = await getSessionToken();
    if (!token) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    await updateSessionActiveRole(token, activeRole);

    return NextResponse.json({ success: true, activeRole });
  } catch (error) {
    console.error("Error switching role:", error);
    return NextResponse.json({ error: "Failed to switch role" }, { status: 500 });
  }
}
