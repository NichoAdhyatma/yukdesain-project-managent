import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Owner/Admin only — designers have their own workspace
  if (user.activeRole !== "OWNER") {
    redirect("/designer");
  }

  // Parallel data fetching — no waterfalls
  const [
    totalProjects,
    activeProjects,
    completedThisMonth,
    revisionProjects,
    upcomingDeadlines,
    projectsByStatus,
    assignedDesigners,
    pendingRevisions,
    waIntakesByStatus,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "SEDANG_DIKERJAKAN" } }),
    countCompletedThisMonth(),
    prisma.revision.count({ where: { status: "PENDING" } }),
    fetchUpcomingDeadlines(),
    prisma.project.groupBy({ by: ["status"], _count: { id: true } }),
    fetchAssignedDesigners(),
    fetchPendingRevisions(),
    prisma.waIntake.groupBy({
      by: ["status"],
      where: { status: { in: ["AWAITING_QUOTE", "DP_REVIEW"] } },
      _count: { _all: true },
    }),
  ]);

  const { grossIncome, freelancerExpenses, netRevenue } = await fetchFinancial();

  const { outstandingPaymentsTotal, outstandingPaymentsCount } = await fetchOutstanding();

  const unassignedProjects = await prisma.project.count({
    where: { status: { in: ["DRAFT", "BELUM_DIKERJAKAN"] }, assignments: { none: {} } },
  });

  const metrics = {
    newOrders: totalProjects,
    unassignedProjects,
    activeProjects,
    completedThisMonth,
    revisionProjects,
    outstandingPaymentsCount,
    outstandingPaymentsTotal,
    financial: { grossIncome, freelancerExpenses, netRevenue },
    upcomingDeadlines: upcomingDeadlines.map((d) => ({ ...d, deadline: d.deadline.toISOString() })),
    projectsByStatus,
    assignedDesigners,
    pendingRevisions: pendingRevisions.map((r) => ({ ...r, requestedAt: r.requestedAt.toISOString() })),
    waOrders: {
      awaitingQuote: waIntakesByStatus.find((g) => g.status === "AWAITING_QUOTE")?._count._all ?? 0,
      dpReview: waIntakesByStatus.find((g) => g.status === "DP_REVIEW")?._count._all ?? 0,
    },
  };

  // Lazy import client component to keep server component clean
  const { DashboardView } = await import("./DashboardView");
  return <DashboardView initialMetrics={metrics} />;
}

// --- Data helpers ---

async function countCompletedThisMonth() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return prisma.project.count({
    where: { status: "SELESAI", updatedAt: { gte: startOfMonth, lt: startOfNextMonth } },
  });
}

async function fetchUpcomingDeadlines() {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return prisma.project.findMany({
    where: { deadline: { gte: now, lte: threeDaysFromNow }, status: { not: "SELESAI" } },
    select: { id: true, deadline: true, clientName: true, service: { select: { name: true } } },
    orderBy: { deadline: "asc" },
    take: 5,
  });
}

async function fetchAssignedDesigners() {
  const assignments = await prisma.projectAssignment.findMany({
    where: { project: { status: "SEDANG_DIKERJAKAN" } },
    include: { designer: { select: { id: true, name: true } } },
    orderBy: { assignedAt: "desc" },
  });
  const map: Record<string, { name: string; count: number }> = {};
  for (const a of assignments) {
    if (!map[a.designer.id]) map[a.designer.id] = { name: a.designer.name, count: 0 };
    map[a.designer.id].count++;
  }
  return Object.entries(map).map(([id, d]) => ({ id, name: d.name, count: d.count }));
}

async function fetchPendingRevisions() {
  return prisma.revision.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      number: true,
      description: true,
      requestedAt: true,
      project: {
        select: { id: true, projectNumber: true, clientName: true, service: { select: { name: true } } },
      },
    },
    orderBy: { requestedAt: "desc" },
    take: 5,
  });
}

async function fetchFinancial() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthlyProjects = await prisma.project.findMany({
    where: { createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
    select: { agreedPrice: true },
  });

  const grossIncome = monthlyProjects.reduce((sum, p) => sum + p.agreedPrice, 0);

  const freelancerAssignments = await prisma.projectAssignment.findMany({
    where: {
      assignedAt: { gte: startOfMonth, lt: startOfNextMonth },
      freelancerPayout: { not: null },
    },
    select: { freelancerPayout: true },
  });

  const freelancerExpenses = freelancerAssignments.reduce((sum, a) => sum + (a.freelancerPayout || 0), 0);
  const netRevenue = grossIncome - freelancerExpenses;

  return { grossIncome, freelancerExpenses, netRevenue };
}

async function fetchOutstanding() {
  const projects = await prisma.project.findMany({
    where: { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    select: { agreedPrice: true, paidAmount: true },
  });

  const outstandingPaymentsTotal = projects.reduce(
    (sum, p) => sum + (p.agreedPrice - p.paidAmount),
    0
  );

  return { outstandingPaymentsTotal, outstandingPaymentsCount: projects.length };
}
