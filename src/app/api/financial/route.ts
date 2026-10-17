import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const [outstandingPayments, ...monthResults] = await Promise.all([
      prisma.project.findMany({
        where: { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        include: { client: true },
        orderBy: { deadline: "asc" },
      }),
      ...Array.from({ length: 6 }, (_, i) => {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        return Promise.all([
          prisma.project.findMany({
            where: { createdAt: { gte: monthDate, lt: nextMonthDate } },
            select: { agreedPrice: true },
          }),
          prisma.projectAssignment.findMany({
            where: { assignedAt: { gte: monthDate, lt: nextMonthDate }, freelancerPayout: { not: null } },
            select: { freelancerPayout: true },
          }),
        ]).then(([monthProjects, monthAssignments]) => ({
          month: monthDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
          monthDate: monthDate.toISOString(),
          grossIncome: monthProjects.reduce((sum: number, p: { agreedPrice: number }) => sum + p.agreedPrice, 0),
          freelancerExpenses: monthAssignments.reduce((sum: number, a: { freelancerPayout: number | null }) => sum + (a.freelancerPayout || 0), 0),
        }));
      }),
    ]);

    const monthlyData = monthResults.map((r) => ({
      ...r,
      netRevenue: r.grossIncome - r.freelancerExpenses,
    }));

    const totalOutstanding = outstandingPayments.reduce(
      (sum: number, p: { agreedPrice: number; paidAmount: number }) => sum + (p.agreedPrice - p.paidAmount),
      0
    );

    return NextResponse.json({
      monthlyData,
      outstandingPayments: outstandingPayments.map((p: { id: string; projectNumber: string; client: { name: string }; agreedPrice: number; paidAmount: number; paymentStatus: string; deadline: Date }) => ({
        id: p.id,
        projectNumber: p.projectNumber,
        clientName: p.client.name,
        amount: p.agreedPrice - p.paidAmount,
        status: p.paymentStatus,
        deadline: p.deadline,
      })),
      totalOutstanding,
    });
  } catch (error) {
    console.error("Error fetching financial:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial data" },
      { status: 500 }
    );
  }
}
