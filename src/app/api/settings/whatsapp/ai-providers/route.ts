import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { encryptApiKey, isKeyCryptoReady, KeyCryptoUnavailableError } from "@/lib/ai/key-crypto";
import { listProviders, normalizeBaseUrl, providerInputSchema } from "@/lib/ai/providers";
import { getUsage, testsByProvider } from "@/lib/ai/provider-admin";
import { getAiTargets } from "@/lib/whatsapp/ai/ai-config";

// Provider AI dari portal (docs/AI_PROVIDERS.md). Key tidak pernah ada di respons maupun log.

const fieldsOf = (issues: { path: PropertyKey[]; message: string }[]) => Object.fromEntries(issues.map((i) => [i.path.join("."), i.message]));

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const providers = await listProviders();
  const [tests, usage, effective] = await Promise.all([testsByProvider(providers), getUsage(), getAiTargets()]);
  // effective = yang sedang dipakai bot (termasuk bawaan server bila pemakaian belum dipilih).
  return NextResponse.json({
    providers,
    tests,
    usage,
    effective: { chat: effective.chat, proof: effective.proof, fallback: effective.fallback },
    cryptoReady: isKeyCryptoReady(),
  });
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!isKeyCryptoReady()) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: new KeyCryptoUnavailableError().message }, { status: 400 });
  }
  const parsed = providerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", fields: fieldsOf(parsed.error.issues) }, { status: 400 });
  const input = parsed.data;
  if (!input.apiKey) return NextResponse.json({ error: "VALIDATION_ERROR", fields: { apiKey: "API key wajib diisi" } }, { status: 400 });

  const { ciphertext, last4 } = encryptApiKey(input.apiKey);
  const row = await prisma.aiProvider.create({
    data: {
      name: input.name,
      format: input.format,
      baseUrl: normalizeBaseUrl(input.baseUrl, input.format),
      apiKeyCiphertext: ciphertext,
      apiKeyLast4: last4,
      createdById: auth.user.id,
    },
  });
  await prisma.activityLog.create({
    data: {
      entityType: "AiProvider",
      entityId: row.id,
      action: "AI_PROVIDER_CREATED",
      actorId: auth.user.id,
      newValue: { name: row.name, format: row.format, baseUrl: row.baseUrl },
    },
  });
  const provider = (await listProviders()).find((p) => p.key === `db:${row.id}`) ?? null;
  return NextResponse.json({ provider }, { status: 201 });
}
