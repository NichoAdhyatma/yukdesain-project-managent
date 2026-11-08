import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { completeRevision } from "@/lib/revisions/complete-revision";
import { notifyClientProjectEvent } from "@/lib/notifications/client-project-events";

// Tandai revisi selesai dikerjakan (docs/CLIENT_NOTIFICATIONS.md): desainer yang ditugaskan, atau owner.

type Params = { params: Promise<{ id: string; revisionId: string }> };

const MESSAGES = {
  NOT_FOUND: ["Revisi tidak ditemukan di project ini", 404],
  ALREADY_COMPLETED: ["Revisi ini sudah ditandai selesai", 409],
  PROJECT_FINALIZED: ["Project sudah disetujui final; revisi ditutup", 409],
} as const;

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, revisionId } = await params;

  if (!user.roles.includes("OWNER")) {
    const assignment = await prisma.projectAssignment.findFirst({ where: { projectId: id, designerId: user.id }, select: { id: true } });
    if (!assignment) return NextResponse.json({ error: "Not assigned to this project" }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction((tx) => completeRevision(tx, { projectId: id, revisionId, actorId: user.id }));
    if (!result.ok) {
      const [error, status] = MESSAGES[result.code];
      return NextResponse.json({ error, code: result.code }, { status });
    }
    after(() => notifyClientProjectEvent(id, { kind: "REVISION_DONE", revisionId }).then(() => undefined));
    return NextResponse.json({ revision: result.revision });
  } catch (error) {
    console.error("Error completing revision:", (error as Error).name);
    return NextResponse.json({ error: "Gagal menandai revisi. Coba lagi." }, { status: 500 });
  }
}
