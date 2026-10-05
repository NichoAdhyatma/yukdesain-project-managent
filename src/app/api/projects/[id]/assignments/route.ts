import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { designerId, freelancerPayout } = body;

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if designer exists
    const designer = await prisma.user.findUnique({
      where: { id: designerId },
    });

    if (!designer) {
      return NextResponse.json({ error: "Designer not found" }, { status: 404 });
    }

    // For freelancers, payout is required
    if (designer.classification === "FREELANCER" && !freelancerPayout) {
      return NextResponse.json(
        { error: "Freelancer payout is required" },
        { status: 400 }
      );
    }

    // Remove existing assignment if any
    await prisma.projectAssignment.deleteMany({
      where: { projectId: id },
    });

    // Create new assignment
    const assignment = await prisma.projectAssignment.create({
      data: {
        projectId: id,
        designerId,
        assignedBy: user.id,
        freelancerPayout: designer.classification === "FREELANCER" ? Math.round(freelancerPayout || 0) : null,
      },
      include: {
        designer: {
          select: {
            id: true,
            name: true,
            email: true,
            classification: true,
          },
        },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Project",
        entityId: id,
        action: "DESIGNER_ASSIGNED",
        actorId: user.id,
        newValue: {
          designerId,
          designerName: designer.name,
          classification: designer.classification,
          freelancerPayout: designer.classification === "FREELANCER" ? freelancerPayout : null,
        },
      },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error("Error assigning designer:", error);
    return NextResponse.json(
      { error: "Failed to assign designer" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get current assignment for log
    const currentAssignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id },
      include: {
        designer: true,
      },
    });

    // Delete assignment
    await prisma.projectAssignment.deleteMany({
      where: { projectId: id },
    });

    // Log activity
    if (currentAssignment) {
      await prisma.activityLog.create({
        data: {
          entityType: "Project",
          entityId: id,
          action: "DESIGNER_UNASSIGNED",
          actorId: user.id,
          previousValue: {
            designerId: currentAssignment.designerId,
            designerName: currentAssignment.designer.name,
          },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing designer:", error);
    return NextResponse.json(
      { error: "Failed to remove designer" },
      { status: 500 }
    );
  }
}
