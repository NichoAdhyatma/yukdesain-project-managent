import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { encryptApiKey, isKeyCryptoReady, KeyCryptoUnavailableError } from "@/lib/ai/key-crypto";
import { normalizeBaseUrl, providerInputSchema } from "@/lib/ai/providers";
import { getUsage, usagesOfProvider } from "@/lib/ai/provider-admin";

type Params = { params: Promise<{ id: string }> };

const builtIn = () => NextResponse.json({ error: "FORBIDDEN", message: "Provider bawaan server diatur lewat env, bukan dari portal" }, { status: 403 });
const notFound = () => NextResponse.json({ error: "NOT_FOUND", message: "Provider tidak ditemukan" }, { status: 404 });

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (id.startsWith("env:")) return builtIn();
  const existing = await prisma.aiProvider.findUnique({ where: { id } });
  if (!existing) return notFound();

  const parsed = providerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) },
      { status: 400 },
    );
  }
  const input = parsed.data;
  if (input.apiKey && !isKeyCryptoReady()) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: new KeyCryptoUnavailableError().message }, { status: 400 });
  }
  // Key kosong = tidak diubah. Mengubah base URL / key memperbarui updatedAt → hasil tes lama batal.
  const key = input.apiKey ? encryptApiKey(input.apiKey) : null;
  const row = await prisma.aiProvider.update({
    where: { id },
    data: {
      name: input.name,
      format: input.format,
      baseUrl: normalizeBaseUrl(input.baseUrl, input.format),
      ...(key && { apiKeyCiphertext: key.ciphertext, apiKeyLast4: key.last4 }),
    },
  });
  await prisma.activityLog.create({
    data: {
      entityType: "AiProvider",
      entityId: id,
      action: "AI_PROVIDER_UPDATED",
      actorId: auth.user.id,
      newValue: { name: row.name, format: row.format, baseUrl: row.baseUrl, keyChanged: !!key },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (id.startsWith("env:")) return builtIn();
  const existing = await prisma.aiProvider.findUnique({ where: { id } });
  if (!existing) return notFound();
  const usedFor = usagesOfProvider(await getUsage(), `db:${id}`);
  if (usedFor.length) {
    return NextResponse.json({ error: "CONFLICT", message: `Provider sedang dipakai untuk ${usedFor.join(", ")}` }, { status: 409 });
  }
  await prisma.aiProvider.delete({ where: { id } });
  await prisma.activityLog.create({
    data: { entityType: "AiProvider", entityId: id, action: "AI_PROVIDER_DELETED", actorId: auth.user.id },
  });
  return NextResponse.json({ ok: true });
}
