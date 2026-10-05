import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_REVISION_QUOTA = 3;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Get link and validate
    const link = await prisma.clientLink.findUnique({
      where: { token },
      include: {
        project: {
          include: {
            revisions: {
              orderBy: { number: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (link.status !== "ACTIVE") {
      return NextResponse.json({ error: "Link is not active" }, { status: 403 });
    }

    if (!link.project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = link.project;
    const usedRevisions = project.revisions.length;

    // Check quota
    if (usedRevisions >= MAX_REVISION_QUOTA) {
      return NextResponse.json(
        { error: "Revision quota exceeded", quota: { used: usedRevisions, remaining: 0, max: MAX_REVISION_QUOTA } },
        { status: 403 }
      );
    }

    // Support both JSON (description only) and form-data (description + attachmentIds)
    let description: string;
    let attachmentIds: string[] = [];

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      description = formData.get("description") as string;
      const ids = formData.getAll("attachmentIds") as string[];
      attachmentIds = ids.filter(Boolean);
    } else {
      const body = await request.json();
      description = body.description;
      attachmentIds = body.attachmentIds || [];
    }

    if (!description?.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    // Create revision
    const nextNumber = usedRevisions + 1;
    const remainingQuota = MAX_REVISION_QUOTA - nextNumber;

    const revision = await prisma.revision.create({
      data: {
        projectId: project.id,
        number: nextNumber,
        description,
        status: "PENDING",
        remainingQuota,
        attachments: attachmentIds.length > 0 ? {
          connect: attachmentIds.map((id) => ({ id })),
        } : undefined,
      },
    });

    return NextResponse.json({
      revision,
      quota: {
        used: nextNumber,
        remaining: remainingQuota,
        max: MAX_REVISION_QUOTA,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating client revision:", error);
    return NextResponse.json(
      { error: "Failed to create revision" },
      { status: 500 }
    );
  }
}
