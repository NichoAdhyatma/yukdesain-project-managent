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
    const payments = await prisma.payment.findMany({
      where,
      include: {
        project: {
          select: { id: true, projectNumber: true, clientName: true, agreedPrice: true },
        },
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ payments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, amount, date, method, reference, notes } = body;

    if (!projectId || !amount) {
      return NextResponse.json({ error: "projectId and amount are required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const paymentAmount = Math.round(amount);
    const newPaidAmount = project.paidAmount + paymentAmount;

    // Determine payment status
    let paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    if (newPaidAmount >= project.agreedPrice) {
      paymentStatus = "PAID";
    } else if (newPaidAmount > 0) {
      paymentStatus = "PARTIALLY_PAID";
    } else {
      paymentStatus = "UNPAID";
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        projectId,
        amount: paymentAmount,
        date: date ? new Date(date) : new Date(),
        method: method || null,
        reference: reference || null,
        notes: notes || null,
        recordedBy: user.id,
      },
    });

    // Update project paidAmount and paymentStatus
    await prisma.project.update({
      where: { id: projectId },
      data: {
        paidAmount: Math.min(newPaidAmount, project.agreedPrice),
        paymentStatus,
      },
    });

    // Auto-update invoice status to match payment
    await prisma.invoice.updateMany({
      where: { projectId },
      data: { status: paymentStatus },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Payment",
        entityId: payment.id,
        action: "PAYMENT_RECORDED",
        actorId: user.id,
        newValue: {
          amount: paymentAmount,
          method,
          reference,
          totalPaid: newPaidAmount,
          agreedPrice: project.agreedPrice,
          status: paymentStatus,
        },
        metadata: { projectId, projectNumber: project.projectNumber },
      },
    });

    return NextResponse.json({
      payment,
      summary: {
        agreedPrice: project.agreedPrice,
        paidAmount: Math.min(newPaidAmount, project.agreedPrice),
        remainingBalance: Math.max(0, project.agreedPrice - newPaidAmount),
        paymentStatus,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error recording payment:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
