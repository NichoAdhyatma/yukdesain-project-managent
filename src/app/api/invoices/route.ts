import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const where = projectId ? { projectId } : {};
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            projectNumber: true,
            clientName: true,
            agreedPrice: true,
            paidAmount: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, items, subtotal, tax, total, dueDate } = body;

    if (!projectId || !items || !total) {
      return NextResponse.json({ error: "projectId, items, and total are required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Generate invoice number: INV-YYYY-NNNN
    const now = new Date();
    const year = now.getFullYear();
    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: { startsWith: `INV-${year}-` },
      },
      orderBy: { invoiceNumber: "desc" },
    });

    let nextNum = 1;
    if (lastInvoice?.invoiceNumber) {
      const lastNum = parseInt(lastInvoice.invoiceNumber.replace(`INV-${year}-`, ""));
      nextNum = lastNum + 1;
    }
    const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, "0")}`;

    const invoice = await prisma.invoice.create({
      data: {
        projectId,
        invoiceNumber,
        items,
        subtotal: subtotal || total,
        tax: tax || null,
        total,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    await prisma.activityLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "CREATED",
        actorId: user.id,
        newValue: { invoiceNumber, total },
        metadata: { projectId, projectNumber: project.projectNumber },
      },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
