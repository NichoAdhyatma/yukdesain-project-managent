import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ["BELUM_DIKERJAKAN", "SEDANG_DIKERJAKAN", "SELESAI"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Get current project
    const currentProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!currentProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check permissions: OWNER can always change; designer can only change if assigned
    if (!user.roles.includes("OWNER")) {
      const assignment = await prisma.projectAssignment.findFirst({
        where: { projectId: id, designerId: user.id },
      });
      if (!assignment) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }

    // Update status
    const project = await prisma.project.update({
      where: { id },
      data: { status },
      include: {
        client: true,
        service: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Project",
        entityId: id,
        action: "STATUS_CHANGED",
        actorId: user.id,
        previousValue: { status: currentProject.status },
        newValue: { status },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error updating project status:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
