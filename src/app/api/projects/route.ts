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

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
