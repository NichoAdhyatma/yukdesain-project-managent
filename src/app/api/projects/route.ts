import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      where: {
        status: { not: "DRAFT" }, // only show projects with brief submitted
      },
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
    });

    return NextResponse.json({ projects });
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

    // Generate project number
    const lastProject = await prisma.project.findFirst({
      orderBy: { createdAt: "desc" },
    });

    let nextNumber = 1;
    if (lastProject?.projectNumber) {
      const lastNum = parseInt(lastProject.projectNumber.replace("PRJ-", ""));
      nextNumber = lastNum + 1;
    }
    const projectNumber = `PRJ-${String(nextNumber).padStart(3, "0")}`;

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
