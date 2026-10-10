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
      include: { project: { include: { client: true } } },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (link.status !== "ACTIVE") {
      return NextResponse.json({ error: "Link is no longer active" }, { status: 410 });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      await prisma.clientLink.update({
        where: { id: link.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "Link has expired" }, { status: 410 });
    }

    if (!link.project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { responses, attachmentIds } = body;

    // Build responses array
    let formattedResponses;
    if (responses?.responses) {
      formattedResponses = responses.responses;
    } else if (Array.isArray(responses)) {
      formattedResponses = responses;
    } else {
      formattedResponses = Object.entries(responses || body)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => ({
          questionId: key,
          question: key.replace(/_/g, " "),
          answer: typeof value === "object" ? JSON.stringify(value) : String(value),
        }));
    }

    if (!formattedResponses || formattedResponses.length === 0) {
      return NextResponse.json({ error: "Brief responses are required" }, { status: 400 });
    }

    const existingBrief = await prisma.brief.findUnique({
      where: { projectId: link.project.id },
    });

    if (existingBrief) {
      return NextResponse.json({ error: "Brief already submitted" }, { status: 400 });
    }

    // Create brief — unique constraint handles race condition
    let brief;
    try {
      brief = await prisma.brief.create({
        data: {
          projectId: link.project.id,
          responses: formattedResponses,
        },
      });
    } catch (error: unknown) {
      // Handle race condition: unique constraint violation means brief already exists
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return NextResponse.json({ error: "Brief already submitted" }, { status: 400 });
      }
      throw error;
    }

    // Link attachments to brief
    if (attachmentIds?.length) {
      await prisma.attachment.updateMany({
        where: { id: { in: attachmentIds } },
        data: { briefId: brief.id },
      });
    }

    await prisma.clientLink.update({
      where: { id: link.id },
      data: { status: "LOCKED", usedAt: new Date() },
    });

    // Create a new active client link for tracking
    const newLink = await prisma.clientLink.create({
      data: {
        projectId: link.project.id,
        token: `${link.project.projectNumber.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`,
        status: "ACTIVE",
        expiresAt: null,
      },
    });

    await prisma.project.update({
      where: { id: link.project.id },
      data: { status: "BELUM_DIKERJAKAN" },
    });

    return NextResponse.json({
      brief,
      projectNumber: link.project.projectNumber,
      clientName: link.project.clientName,
      token: newLink.token,
    }, { status: 201 });
  } catch (error) {
    console.error("Error submitting brief:", error);
    return NextResponse.json({ error: "Failed to submit brief" }, { status: 500 });
  }
}
