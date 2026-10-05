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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Count projects
    const totalProjects = await prisma.project.count();
    const activeProjects = await prisma.project.count({ where: { status: "SEDANG_DIKERJAKAN" } });
    const completedThisMonth = await prisma.project.count({
      where: {
        status: "SELESAI",
        updatedAt: { gte: startOfMonth, lt: startOfNextMonth },
      },
    });
    const revisionProjects = await prisma.revision.count({ where: { status: "PENDING" } });

    // Get upcoming deadlines
    const upcomingDeadlines = await prisma.project.findMany({
      where: {
        deadline: { gte: now, lte: threeDaysFromNow },
        status: { not: "SELESAI" },
      },
      select: {
        id: true,
        deadline: true,
        clientName: true,
        service: { select: { name: true } },
      },
      orderBy: { deadline: "asc" },
      take: 5,
    });

    // Financial (BRD Appendix D: Gross Income = SUM(Order Prices), Net = Gross - Freelancer Expenses)
    const monthlyProjects = await prisma.project.findMany({
      where: { createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
      select: { agreedPrice: true, paidAmount: true },
    });

    const grossIncome = monthlyProjects.reduce((sum, p) => sum + p.agreedPrice, 0);
    monthlyProjects.reduce((sum, p) => sum + p.paidAmount, 0);

    // Freelancer expenses: sum of freelancer payouts for assignments made this month
    const freelancerAssignments = await prisma.projectAssignment.findMany({
      where: {
        assignedAt: { gte: startOfMonth, lt: startOfNextMonth },
        freelancerPayout: { not: null },
      },
      select: { freelancerPayout: true },
    });
    const freelancerExpenses = freelancerAssignments.reduce((sum, a) => sum + (a.freelancerPayout || 0), 0);
    const netRevenue = grossIncome - freelancerExpenses;

    // Outstanding payments
    const outstandingProjects = await prisma.project.findMany({
      where: {
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
      },
      select: { agreedPrice: true, paidAmount: true },
    });

    const outstandingPaymentsTotal = outstandingProjects.reduce(
      (sum, p) => sum + (p.agreedPrice - p.paidAmount),
      0
    );

    // Unassigned projects
    const unassignedProjects = await prisma.project.count({
      where: {
        status: { in: ["DRAFT", "BELUM_DIKERJAKAN"] },
        assignments: { none: {} },
      },
    });

    // Projects by status
    const projectsByStatus = await prisma.project.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    // Assigned designers summary
    const designerAssignments = await prisma.projectAssignment.findMany({
      where: { project: { status: "SEDANG_DIKERJAKAN" } },
      include: {
        designer: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
    const assignedDesigners = designerAssignments.reduce<Record<string, { name: string; count: number }>>(
      (acc, a) => {
        const id = a.designer.id;
        if (!acc[id]) acc[id] = { name: a.designer.name, count: 0 };
        acc[id].count++;
        return acc;
      },
      {}
    );

    // Pending revisions (client reviews)
    const pendingRevisions = await prisma.revision.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        number: true,
        description: true,
        requestedAt: true,
        project: { select: { id: true, projectNumber: true, clientName: true, service: { select: { name: true } } } },
      },
      orderBy: { requestedAt: "desc" },
      take: 5,
    });

    // Recent revisions activity
    const recentRevisions = await prisma.revision.findMany({
      select: {
        id: true,
        status: true,
        requestedAt: true,
        project: { select: { id: true, projectNumber: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      metrics: {
        newOrders: totalProjects,
        unassignedProjects,
        activeProjects,
        completedThisMonth,
        revisionProjects,
        outstandingPaymentsCount: outstandingProjects.length,
        outstandingPaymentsTotal,
        upcomingDeadlines,
        financial: { grossIncome, freelancerExpenses, netRevenue },
        projectsByStatus,
        assignedDesigners: Object.entries(assignedDesigners).map(([id, d]) => ({ id, name: d.name, count: d.count })),
        pendingRevisions,
        recentRevisions,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
