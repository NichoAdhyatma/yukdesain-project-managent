import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await prisma.clientLink.findUnique({
      where: { token },
      include: {
        project: {
          include: {
            assignments: { include: { designer: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (!link.project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!link.project.finalSubmittedAt) {
      return NextResponse.json(
        { error: "Final work has not been submitted yet" },
        { status: 400 }
      );
    }

    if (link.project.finalApprovedAt) {
      return NextResponse.json(
        { error: "Final work already approved" },
        { status: 400 }
      );
    }

    // Approve final work
    const updated = await prisma.project.update({
      where: { id: link.project.id },
      data: {
        finalApprovedAt: new Date(),
        status: "SELESAI", // Mark project as complete
      },
      include: {
        assignments: { include: { designer: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json({ project: updated }, { status: 200 });
  } catch (error) {
    console.error("Error approving final:", error);
    return NextResponse.json(
      { error: "Failed to approve final work" },
      { status: 500 }
    );
  }
}
