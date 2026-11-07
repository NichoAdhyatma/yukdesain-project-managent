import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getStudioOperations, studioOperationsSchema } from "@/lib/studio-operations";
import { saveStudioOperations } from "@/lib/studio-operations-api";

// Operasional studio (docs/STUDIO_OPERATIONS.md): khusus owner.

async function requireOwner() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Login diperlukan", code: "UNAUTHORIZED" }, { status: 401 }) };
  if (user.activeRole !== "OWNER") {
    return { error: NextResponse.json({ error: "Hanya owner yang dapat mengatur operasional studio", code: "FORBIDDEN" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await getStudioOperations());
}

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = studioOperationsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Data operasional tidak valid", code: "VALIDATION_ERROR", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await saveStudioOperations(parsed.data, auth.user.id));
  } catch (error) {
    console.error("Error saving studio operations:", (error as Error).name);
    return NextResponse.json({ error: "Gagal menyimpan operasional studio", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
