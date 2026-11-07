import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { revisionQuotaRemaining, revisionsUsed } from "@/lib/revisions/quota";

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

    const [revisions, project] = await Promise.all([
      prisma.revision.findMany({ where: { projectId: id }, orderBy: { requestedAt: "desc" } }),
      prisma.project.findUnique({ where: { id }, select: { revisionQuota: true } }),
    ]);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Kuota milik project (snapshot Operasional studio, docs/STUDIO_OPERATIONS.md)
    const usedRevisions = revisions.length;
    const remainingQuota = revisionQuotaRemaining(usedRevisions, project.revisionQuota);

    return NextResponse.json({
      revisions,
      quota: {
        used: usedRevisions,
        remaining: remainingQuota,
        max: project.revisionQuota,
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
    // revisions memuat 1 baris terakhir saja: jumlah terpakai = nomor revisi terakhir
    const usedRevisions = revisionsUsed(project.revisions[0]?.number ?? null);
    if (usedRevisions >= project.revisionQuota) {
      return NextResponse.json(
        { error: "Revision quota exceeded", quota: { used: usedRevisions, remaining: 0, max: project.revisionQuota } },
        { status: 403 }
      );
    }

    // Create revision
    const nextNumber = usedRevisions + 1;
    const remainingQuota = project.revisionQuota - nextNumber;

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
        max: project.revisionQuota,
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
