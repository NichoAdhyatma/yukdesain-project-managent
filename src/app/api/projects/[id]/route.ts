import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        service: true,
        brief: true,
        assignments: {
          include: {
            designer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        updates: {
          orderBy: { createdAt: "desc" },
        },
        revisions: {
          orderBy: { requestedAt: "desc" },
        },
        attachments: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
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

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete in transaction — cascade through all related records
    await prisma.$transaction([
      // Delete related records in dependency order
      prisma.projectUpdate.deleteMany({ where: { projectId: id } }),
      prisma.revision.deleteMany({ where: { projectId: id } }),
      prisma.payment.deleteMany({ where: { projectId: id } }),
      prisma.invoice.deleteMany({ where: { projectId: id } }),
      prisma.projectAssignment.deleteMany({ where: { projectId: id } }),
      prisma.clientLink.deleteMany({ where: { projectId: id } }),
      prisma.brief.deleteMany({ where: { projectId: id } }),
      prisma.attachment.deleteMany({ where: { projectId: id } }),
      // Delete the project itself
      prisma.project.delete({ where: { id } }),
      // Log activity
      prisma.activityLog.create({
        data: {
          entityType: "Project",
          entityId: id,
          action: "DELETED",
          actorId: user.id,
          newValue: { projectNumber: project.projectNumber, clientName: project.clientName },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}

export async function PUT(
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

    const project = await prisma.project.update({
      where: { id },
      data: {
        priority: body.priority,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Project",
        entityId: id,
        action: "UPDATED",
        actorId: user.id,
        newValue: { priority: body.priority },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}
