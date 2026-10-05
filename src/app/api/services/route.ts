import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const services = await prisma.service.findMany({
      orderBy: { code: "asc" },
    });

    return NextResponse.json(
      { services },
      {
        headers: {
          // Cache for 1 hour on client, revalidate in background for up to 24h
          "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching services:", error);
    return NextResponse.json(
      { error: "Failed to fetch services" },
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
    const { name, description, outputFormat } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Generate next service code
    const lastService = await prisma.service.findFirst({ orderBy: { code: "desc" } });
    const nextNum = lastService
      ? parseInt(lastService.code.replace("SVC-", ""), 10) + 1
      : 1;
    const code = `SVC-${String(nextNum).padStart(2, "0")}`;

    const service = await prisma.service.create({
      data: { code, name, description, outputFormat },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error("Error creating service:", error);
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}
