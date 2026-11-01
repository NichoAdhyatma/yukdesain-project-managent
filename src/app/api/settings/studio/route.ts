import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  // Field eksplisit: tabel ini juga menyimpan pengaturan internal (bot WA/AI)
  // yang tidak boleh terbaca oleh non-owner.
  const settings = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: {
      id: true,
      name: true,
      tagline: true,
      email: true,
      phone: true,
      address: true,
      logoUrl: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(settings || {
    id: "default",
    name: "YukDesain Studio",
    tagline: "Creative Design Agency",
    email: "hello@yukdesain.com",
    phone: "",
    address: "Jakarta, Indonesia",
    logoUrl: "",
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, tagline, email, phone, address, logoUrl } = body;

  const settings = await prisma.studioSettings.upsert({
    where: { id: "default" },
    update: {
      ...(name !== undefined && { name }),
      ...(tagline !== undefined && { tagline }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(logoUrl !== undefined && { logoUrl }),
    },
    create: {
      id: "default",
      name: name || "YukDesain Studio",
      tagline: tagline || "Creative Design Agency",
      email: email || "hello@yukdesain.com",
      phone: phone || "",
      address: address || "Jakarta, Indonesia",
      logoUrl: logoUrl || "",
    },
    select: {
      id: true,
      name: true,
      tagline: true,
      email: true,
      phone: true,
      address: true,
      logoUrl: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(settings);
}
