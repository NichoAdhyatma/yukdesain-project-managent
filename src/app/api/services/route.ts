import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { parseServiceBotFields, toServiceDto, toServiceWriteData } from "@/lib/services/service-dto";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const services = await prisma.service.findMany({
      orderBy: { code: "asc" },
    });

    // Harga mulai dan catatan bot khusus owner (docs/SERVICES_CATALOG.md).
    const isOwner = user.roles.includes("OWNER");
    return NextResponse.json(
      { services: services.map((s) => toServiceDto(s, isOwner)) },
      {
        headers: {
          // Tanpa cache browser: harga mulai yang baru disimpan harus langsung terbaca di semua halaman
          // (docs/SERVICES_CATALOG.md §1); daftarnya kecil, jadi biaya ambil ulang tidak berarti.
          "Cache-Control": "private, no-cache",
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
    const botFields = parseServiceBotFields(body);
    if (!botFields.ok) {
      return NextResponse.json({ error: "Data tidak valid", fields: botFields.fields }, { status: 400 });
    }

    // Generate next service code
    const lastService = await prisma.service.findFirst({ orderBy: { code: "desc" } });
    const nextNum = lastService
      ? parseInt(lastService.code.replace("SVC-", ""), 10) + 1
      : 1;
    const code = `SVC-${String(nextNum).padStart(2, "0")}`;

    const service = await prisma.service.create({
      data: { code, name, description, outputFormat, ...toServiceWriteData(botFields.data) },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error("Error creating service:", error);
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}
