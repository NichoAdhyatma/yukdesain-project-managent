import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
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
            client: true,
            service: true,
            brief: true,
            invoices: {
              orderBy: { issuedAt: "desc" },
              take: 1,
            },
            assignments: {
              include: {
                designer: {
                  select: { id: true, name: true },
                },
              },
            },
            updates: {
              include: {
                author: { select: { name: true } },
                attachment: true,
              },
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            revisions: {
              include: {
                attachments: true,
              },
              orderBy: { requestedAt: "desc" },
            },
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check expiration
    const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
    if (isExpired && link.status === "ACTIVE") {
      // Mark as expired if not already
      await prisma.clientLink.update({
        where: { id: link.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "Link has expired" }, { status: 410 });
    }

    // Check expired - block if already marked expired
    if (link.status === "EXPIRED") {
      return NextResponse.json({ error: "Link has expired" }, { status: 410 });
    }

    // Check locked/submitted - still return data for tracking
    if (link.status === "LOCKED" || link.status === "SUBMITTED") {
      // Link used - still return data for client tracking
      return NextResponse.json({ link });
    }

    // Active link - return as normal
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error fetching link:", error);
    return NextResponse.json({ error: "Failed to fetch link" }, { status: 500 });
  }
}
