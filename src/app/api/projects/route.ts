import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { generateProjectCode } from "@/lib/project-code";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
    const skip = (page - 1) * pageSize;

    const filterStatus = searchParams.get("status");
    const filterPayment = searchParams.get("payment");
    const filterService = searchParams.get("service");
    const filterDesigner = searchParams.get("designer");
    const filterWorkerType = searchParams.get("workerType");
    const filterDeadline = searchParams.get("deadline"); // "today" | "week" | "month"
    const search = searchParams.get("search")?.toLowerCase();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const whereClause: Record<string, unknown> = {
      status: { not: "DRAFT" },
    };

    if (filterStatus && filterStatus !== "all") {
      whereClause.status = filterStatus;
    }
    if (filterPayment && filterPayment !== "all") {
      whereClause.paymentStatus = filterPayment;
    }
    if (filterService && filterService !== "all") {
      whereClause.serviceId = filterService;
    }
    if (filterDeadline === "today") {
      whereClause.deadline = {
        gte: todayStart,
        lte: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1),
        not: null,
      };
    } else if (filterDeadline === "week") {
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      whereClause.deadline = { gte: todayStart, lte: weekEnd, not: null };
    } else if (filterDeadline === "month") {
      const monthEnd = new Date(todayStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      whereClause.deadline = { gte: todayStart, lte: monthEnd, not: null };
    }
    if (filterDesigner && filterDesigner !== "all") {
      whereClause.assignments = {
        some: { designerId: filterDesigner },
      };
    }
    if (filterWorkerType && filterWorkerType !== "all") {
      whereClause.assignments = {
        some: { workerType: filterWorkerType },
      };
    }

    // Count total (without includes for speed)
    const total = await prisma.project.count({ where: whereClause });

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        client: true,
        service: true,
        brief: true,
        assignments: {
          include: {
            designer: {
              select: { id: true, name: true, email: true, classification: true },
            },
          },
        },
        clientLinks: true,
        payments: {
          include: {
            user: { select: { name: true } },
          },
          orderBy: { date: "desc" },
        },
        invoices: true,
        updates: {
          include: {
            author: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
    });

    // Client-side search filter (text search can't be done in Prisma where easily)
    let filtered = projects;
    if (search) {
      filtered = projects.filter(
        (p) =>
          p.projectNumber.toLowerCase().includes(search) ||
          p.clientName.toLowerCase().includes(search) ||
          p.service?.name?.toLowerCase().includes(search)
      );
    }

    // Recount if search narrowed results
    const displayTotal = search ? filtered.length : total;
    const totalPages = Math.ceil(displayTotal / pageSize);

    return NextResponse.json({
      projects: filtered,
      total: displayTotal,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { clientName, serviceId, agreedPrice, deadline, notes, clientId, paidAmount } = body;

    // Project code: unik dan tidak bisa ditebak — endpoint lookup di client
    // portal bersifat publik, kode berurutan bisa dienumerate.
    let projectNumber = generateProjectCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await prisma.project.findUnique({
        where: { projectNumber },
        select: { id: true },
      });
      if (!clash) break;
      projectNumber = generateProjectCode();
    }

    // Create or get client
    let client;
    if (clientId) {
      client = await prisma.client.findUnique({ where: { id: clientId } });
    } else if (clientName) {
      client = await prisma.client.create({
        data: { name: clientName },
      });
    }

    if (!client) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }

    // Create project with DRAFT status (brief not submitted yet)
    // Status will be BELUM_DIKERJAKAN after brief submitted
    const project = await prisma.project.create({
      data: {
        projectNumber,
        clientId: client.id,
        clientName: client.name,
        serviceId,
        ownerId: user.id,
        agreedPrice: Math.round(agreedPrice || 0),
        paidAmount: Math.round(paidAmount || 0),
        deadline: new Date(deadline),
        notes,
        status: "DRAFT",
        paymentStatus: paidAmount > 0 ? "PARTIALLY_PAID" : "UNPAID",
      },
      include: {
        client: true,
        service: true,
        invoices: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Project",
        entityId: project.id,
        action: "CREATED",
        actorId: user.id,
        newValue: { projectNumber, clientName: client.name },
      },
    });

    // Auto-create receipt with service as line item
    const now = new Date();
    const year = now.getFullYear();
    const lastInvoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `STRUK-${year}-` } },
      orderBy: { invoiceNumber: "desc" },
    });
    let nextInvoiceNum = 1;
    if (lastInvoice?.invoiceNumber) {
      const lastNum = parseInt(lastInvoice.invoiceNumber.replace(`STRUK-${year}-`, ""));
      nextInvoiceNum = lastNum + 1;
    }
    const invoiceNumber = `STRUK-${year}-${String(nextInvoiceNum).padStart(3, "0")}`;

    const invoice = await prisma.invoice.create({
      data: {
        projectId: project.id,
        invoiceNumber,
        items: [{
          description: project.service?.name || "Jasa Design",
          quantity: 1,
          unitPrice: project.agreedPrice,
          total: project.agreedPrice,
        }],
        subtotal: project.agreedPrice,
        total: project.agreedPrice,
        status: project.paymentStatus as "UNPAID" | "PARTIALLY_PAID" | "PAID",
        issuedAt: now,
      },
    });

    // Auto-create payment record if paidAmount > 0 (DP recorded upfront)
    if (project.paidAmount > 0) {
      await prisma.payment.create({
        data: {
          projectId: project.id,
          amount: project.paidAmount,
          date: now,
          recordedBy: user.id,
        },
      });
    }

    return NextResponse.json({ project, invoice }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
