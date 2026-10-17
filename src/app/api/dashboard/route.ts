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

    // Parallel queries
    const [
      totalProjects,
      activeProjects,
      completedThisMonth,
      revisionProjects,
      outstandingProjects,
      unassignedProjects,
      projectsByStatus,
      freelancerAssignments,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: "SEDANG_DIKERJAKAN" } }),
      prisma.project.count({
        where: {
          status: "SELESAI",
          updatedAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
      }),
      prisma.revision.count({ where: { status: "PENDING" } }),
      prisma.project.findMany({
        where: { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        select: { agreedPrice: true, paidAmount: true },
      }),
      prisma.project.count({
        where: {
          status: { in: ["DRAFT", "BELUM_DIKERJAKAN"] },
          assignments: { none: {} },
        },
      }),
      prisma.project.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.projectAssignment.findMany({
        where: {
          assignedAt: { gte: startOfMonth, lt: startOfNextMonth },
          freelancerPayout: { not: null },
        },
        select: { freelancerPayout: true },
      }),
    ]);

    // Freelancer expenses
    const freelancerExpenses = freelancerAssignments.reduce((sum, a) => sum + (a.freelancerPayout || 0), 0);

    // Outstanding payments
    const outstandingPaymentsTotal = outstandingProjects.reduce(
      (sum, p) => sum + (p.agreedPrice - p.paidAmount), 0
    );

    // Parallel: upcoming deadlines, monthly projects, designer assignments, pending revisions, recent revisions
    const [
      upcomingDeadlines,
      monthlyProjects,
      designerAssignments,
      pendingRevisions,
      recentRevisions,
    ] = await Promise.all([
      prisma.project.findMany({
        where: { deadline: { gte: now, lte: threeDaysFromNow }, status: { not: "SELESAI" } },
        select: { id: true, deadline: true, clientName: true, service: { select: { name: true } } },
        orderBy: { deadline: "asc" }, take: 5,
      }),
      prisma.project.findMany({
        where: { createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
        select: { agreedPrice: true },
      }),
      prisma.projectAssignment.findMany({
        where: { project: { status: "SEDANG_DIKERJAKAN" } },
        include: { designer: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "desc" },
      }),
      prisma.revision.findMany({
        where: { status: "PENDING" },
        select: {
          id: true, number: true, description: true, requestedAt: true,
          project: { select: { id: true, projectNumber: true, clientName: true, service: { select: { name: true } } } },
        },
        orderBy: { requestedAt: "desc" }, take: 5,
      }),
      prisma.revision.findMany({
        select: { id: true, status: true, requestedAt: true, project: { select: { id: true, projectNumber: true } } },
        orderBy: { requestedAt: "desc" }, take: 10,
      }),
    ]);

    // Financial
    const grossIncome = monthlyProjects.reduce((sum, p) => sum + p.agreedPrice, 0);
    const netRevenue = grossIncome - freelancerExpenses;

    // Compute assigned designers summary
    const assignedDesigners = designerAssignments.reduce<Record<string, { name: string; count: number }>>(
      (acc, a) => {
        const id = a.designer.id;
        if (!acc[id]) acc[id] = { name: a.designer.name, count: 0 };
        acc[id].count++;
        return acc;
      },
      {}
    );

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
