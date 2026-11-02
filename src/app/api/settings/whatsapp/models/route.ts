import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { aiProviderSchema } from "@/lib/whatsapp/ai/ai-config";
import { listModels } from "@/lib/whatsapp/ai/model-list";

// GET /api/settings/whatsapp/models?provider=ANTHROPIC|GATEWAY — isi dropdown model di Settings.
export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const provider = aiProviderSchema.safeParse(new URL(request.url).searchParams.get("provider"));
  if (!provider.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "provider tidak dikenal" }, { status: 400 });
  }
  return NextResponse.json(await listModels(provider.data));
}
