import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

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
            service: true,
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
            },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    return NextResponse.json({ projects: projects.map((a) => a.project) });
  } catch (error) {
    console.error("Error fetching designer projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
