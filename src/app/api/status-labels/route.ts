import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get project status labels
    const projectStatuses = await prisma.statusLabel.findMany({
      where: { type: "PROJECT" },
      orderBy: { order: "asc" },
    });

    // Get payment status labels
    const paymentStatuses = await prisma.paymentStatusLabel.findMany({
      orderBy: { id: "asc" },
    });

    return NextResponse.json(
      {
        projectStatuses,
        paymentStatuses,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching status labels:", error);
    return NextResponse.json({ error: "Failed to fetch status labels" }, { status: 500 });
  }
}
