import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("DESIGNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify designer is assigned to this project
    const assignment = await prisma.projectAssignment.findFirst({
      where: {
        projectId: id,
        designerId: user.id,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Not assigned to this project" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: { assignments: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.finalSubmittedAt) {
      return NextResponse.json(
        { error: "Final work already submitted" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { description, attachmentIds } = body;

    if (!description?.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    // Mark project as final submitted
    const updated = await prisma.project.update({
      where: { id },
      data: {
        finalSubmittedAt: new Date(),
        // Move to SELESAI only after client approves — not here
      },
    });

    // Create a final update record
    await prisma.projectUpdate.create({
      data: {
        projectId: id,
        description: `📌 Final Deliverables Submitted: ${description.trim()}`,
        authorId: user.id,
        progress: 100,
      },
    });

    // Attach final files if provided
    if (attachmentIds?.length > 0) {
      await prisma.attachment.updateMany({
        where: { id: { in: attachmentIds } },
        data: { category: "FINAL" },
      });
    }

    return NextResponse.json({ project: updated }, { status: 200 });
  } catch (error) {
    console.error("Error submitting final:", error);
    return NextResponse.json(
      { error: "Failed to submit final work" },
      { status: 500 }
    );
  }
}
