import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SERVICE_PUBLIC_SELECT } from "@/lib/services/service-dto";
import { getPublicUrl } from "@/lib/storage";

type StoredAttachment = { storageKey: string };

/** URL publik dihitung di server: env storage tidak tersedia di browser. */
function withUrl<T extends StoredAttachment>(attachment: T): T & { url: string } {
  return { ...attachment, url: getPublicUrl(attachment.storageKey) };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.projectAssignment.findMany({
      where: { designerId: user.id },
      include: {
        project: {
          include: {
            client: true,
            service: { select: SERVICE_PUBLIC_SELECT },
            brief: true,
            assignments: {
              include: {
                designer: { select: { id: true, name: true } },
              },
            },
            updates: {
              include: {
                author: { select: { name: true } },
                attachment: true,
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            revisions: {
              orderBy: { requestedAt: "desc" },
              include: { attachments: { orderBy: { createdAt: "asc" } } },
            },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    return NextResponse.json({
      projects: projects.map(({ project }) => ({
        ...project,
        updates: project.updates.map((u) => ({
          ...u,
          attachment: u.attachment ? withUrl(u.attachment) : null,
        })),
        revisions: project.revisions.map((r) => ({
          ...r,
          attachments: r.attachments.map(withUrl),
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching designer projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
