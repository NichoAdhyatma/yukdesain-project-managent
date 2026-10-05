import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const MAX_REVISION_QUOTA = 3;

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

    const revisions = await prisma.revision.findMany({
      where: { projectId: id },
      orderBy: { requestedAt: "desc" },
    });

    // Calculate remaining quota
    const usedRevisions = revisions.length;
    const remainingQuota = Math.max(0, MAX_REVISION_QUOTA - usedRevisions);

    return NextResponse.json({
      revisions,
      quota: {
        used: usedRevisions,
        remaining: remainingQuota,
        max: MAX_REVISION_QUOTA,
      },
    });
  } catch (error) {
    console.error("Error fetching revisions:", error);
    return NextResponse.json(
      { error: "Failed to fetch revisions" },
      { status: 500 }
    );
  }
}

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
    const { description } = body;

    // Check project exists
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        revisions: {
          orderBy: { number: "desc" },
          take: 1,
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check quota
    const usedRevisions = project.revisions.length;
    if (usedRevisions >= MAX_REVISION_QUOTA) {
      return NextResponse.json(
        { error: "Revision quota exceeded", quota: { used: usedRevisions, remaining: 0, max: MAX_REVISION_QUOTA } },
        { status: 403 }
      );
    }

    // Create revision
    const nextNumber = usedRevisions + 1;
    const remainingQuota = MAX_REVISION_QUOTA - nextNumber;

    const revision = await prisma.revision.create({
      data: {
        projectId: id,
        number: nextNumber,
        description,
        status: "PENDING",
        remainingQuota,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Revision",
        entityId: revision.id,
        action: "REQUESTED",
        actorId: user.id,
        newValue: {
          projectId: id,
          number: nextNumber,
          remainingQuota,
        },
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
    console.error("Error creating revision:", error);
    return NextResponse.json(
      { error: "Failed to create revision" },
      { status: 500 }
    );
  }
}
