import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(
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
    const { description, progress, attachmentIds } = body;

    // Verify designer is assigned to this project
    const assignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id, designerId: user.id },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Not assigned to this project" }, { status: 403 });
    }

    if (!description?.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const update = await prisma.projectUpdate.create({
      data: {
        projectId: id,
        description: description.trim(),
        progress: progress !== undefined ? Math.min(100, Math.max(0, parseInt(progress))) : null,
        authorId: user.id,
      },
      include: {
        author: { select: { name: true } },
        attachment: true,
      },
    });

    // Link attachments to this update
    if (attachmentIds?.length) {
      await prisma.attachment.updateMany({
        where: { id: { in: attachmentIds } },
        data: { updateId: update.id },
      });
    }

    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    console.error("Error creating update:", error);
    return NextResponse.json({ error: "Failed to create update" }, { status: 500 });
  }
}
