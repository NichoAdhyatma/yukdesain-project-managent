import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code) {
    return NextResponse.json({ error: "Kode project diperlukan" }, { status: 400 });
  }

  // Try to find by project number
  const project = await prisma.project.findFirst({
    where: {
      projectNumber: {
        equals: code,
      },
    },
    include: {
      clientLinks: {
        where: { status: "ACTIVE" },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Kode project tidak ditemukan. Pastikan kode yang dimasukkan benar." },
      { status: 404 }
    );
  }

  const activeLink = project.clientLinks[0];
  if (!activeLink) {
    return NextResponse.json(
      { error: "Link tracking belum dibuat untuk project ini. Hubungi designer." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    projectNumber: project.projectNumber,
    clientName: project.clientName,
    token: activeLink.token,
  });
}
