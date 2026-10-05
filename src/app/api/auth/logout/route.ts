import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const SESSION_COOKIE_NAME = "yukdesain_session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      // Delete session from database
      await prisma.session.deleteMany({
        where: { token },
      });

      // Delete cookie
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}
