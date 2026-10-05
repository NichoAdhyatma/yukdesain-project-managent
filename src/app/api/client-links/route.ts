import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { randomBytes } from "crypto";

function generateToken(length = 16): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Check project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check for existing ACTIVE link
    const existingActive = await prisma.clientLink.findFirst({
      where: { projectId, status: "ACTIVE" },
    });
    if (existingActive) {
      return NextResponse.json({ error: "An active link already exists for this project", link: existingActive }, { status: 409 });
    }

    // Deactivate any existing links for this project
    await prisma.clientLink.updateMany({
      where: { projectId },
      data: { status: "EXPIRED" },
    });

    // Create new link with ACTIVE status
    const token = generateToken();
    const link = await prisma.clientLink.create({
      data: {
        token,
        projectId,
        status: "ACTIVE",
        expiresAt: null, // No expiration
      },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("Error creating client link:", error);
    return NextResponse.json({ error: "Failed to create client link" }, { status: 500 });
  }
}
