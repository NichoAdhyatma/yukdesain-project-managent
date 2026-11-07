import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { normalizePhone } from "@/lib/whatsapp/phone";

// Nomor WhatsApp owner yang sedang login (docs/WHATSAPP_OWNER_COMMANDS.md §3). Pesan dari nomor
// ini ke bot diperlakukan sebagai instruksi owner, jadi hanya bisa diubah oleh owner itu sendiri.

async function dto(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { waNumber: true } });
  return { waNumber: user.waNumber };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await dto(auth.user.id));
}

const schema = z.object({ waNumber: z.string().trim().max(30).nullable() });

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", fields: { waNumber: "Nomor tidak valid" } }, { status: 400 });
  }
  const raw = parsed.data.waNumber;
  const waNumber = raw ? normalizePhone(raw) : null;
  if (raw && (!waNumber || waNumber.length < 10 || waNumber.length > 15)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", fields: { waNumber: "Nomor tidak valid. Contoh: 0812 3456 7890" } },
      { status: 400 },
    );
  }

  // Unik dicek di sini (kolom tanpa @unique, lihat schema).
  if (waNumber) {
    const taken = await prisma.user.findFirst({ where: { waNumber, NOT: { id: auth.user.id } }, select: { id: true } });
    if (taken) {
      return NextResponse.json(
        { error: "CONFLICT", fields: { waNumber: "Nomor ini sudah dipakai owner lain" } },
        { status: 409 },
      );
    }
    // Nomor yang pernah order sebagai klien boleh dipakai: owner bisa tetap tes order dengan #klien
    // (docs/WHATSAPP_OWNER_COMMANDS.md §9). Order lama tetap ada di Order WA.
  }

  const before = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { waNumber: true } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: auth.user.id }, data: { waNumber } }),
    prisma.activityLog.create({
      data: {
        entityType: "User",
        entityId: auth.user.id,
        action: "WA_OWNER_NUMBER_UPDATED",
        actorId: auth.user.id,
        previousValue: { waNumber: before.waNumber },
        newValue: { waNumber },
      },
    }),
  ]);
  return NextResponse.json(await dto(auth.user.id));
}
