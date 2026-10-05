import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/session";

function generateStrongPassword(length = 16): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const designers = await prisma.user.findMany({
      where: {
        roles: { has: "DESIGNER" },
      },
      select: {
        id: true,
        name: true,
        email: true,
        classification: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ designers });
  } catch (error) {
    console.error("Error fetching designers:", error);
    return NextResponse.json(
      { error: "Failed to fetch designers" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, classification } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Auto-generate strong password
    const rawPassword = generateStrongPassword();
    const passwordHash = await hashPassword(rawPassword);

    const designer = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roles: { set: ["DESIGNER"] },
        classification: classification || "FULL_TIME",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        classification: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "Designer",
        entityId: designer.id,
        action: "CREATED",
        actorId: user.id,
        newValue: { name, email, classification },
      },
    });

    return NextResponse.json({ designer, rawPassword }, { status: 201 });
  } catch (error) {
    console.error("Error creating designer:", error);
    return NextResponse.json({ error: "Failed to create designer" }, { status: 500 });
  }
}
