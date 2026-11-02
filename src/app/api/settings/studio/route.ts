import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

// Public studio profile (name, logo, contact). Read by the dashboard, sidebar,
// invoices and the client portal, so only these fields are ever returned.
const STUDIO_PROFILE_SELECT = {
  id: true,
  name: true,
  tagline: true,
  email: true,
  phone: true,
  address: true,
  logoUrl: true,
} as const;

const DEFAULT_STUDIO_PROFILE = {
  id: "default",
  name: "YukDesain Studio",
  tagline: "Creative Design Agency",
  email: "hello@yukdesain.com",
  phone: "",
  address: "Jakarta, Indonesia",
  logoUrl: "",
};

const updateStudioSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().max(200).optional(),
  email: z.email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  logoUrl: z.string().trim().max(2048).optional(),
});

type StudioProfileField = keyof z.infer<typeof updateStudioSchema>;

export async function GET() {
  const settings = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: STUDIO_PROFILE_SELECT,
  });
  return NextResponse.json(settings ?? DEFAULT_STUDIO_PROFILE);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login diperlukan", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (user.activeRole !== "OWNER") {
    return NextResponse.json(
      { error: "Hanya owner yang dapat mengubah pengaturan studio", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = updateStudioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Data pengaturan studio tidak valid", code: "VALIDATION_ERROR", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }
  const update = parsed.data;
  const changedFields = Object.keys(update) as StudioProfileField[];

  try {
    const settings = await prisma.$transaction(async (tx) => {
      const previous =
        (await tx.studioSettings.findUnique({ where: { id: "default" }, select: STUDIO_PROFILE_SELECT })) ??
        DEFAULT_STUDIO_PROFILE;

      const saved = await tx.studioSettings.upsert({
        where: { id: "default" },
        update,
        create: { ...DEFAULT_STUDIO_PROFILE, ...update },
        select: STUDIO_PROFILE_SELECT,
      });

      await tx.activityLog.create({
        data: {
          entityType: "StudioSettings",
          entityId: "default",
          action: "UPDATED",
          actorId: user.id,
          previousValue: Object.fromEntries(changedFields.map((field) => [field, previous[field]])),
          newValue: update,
        },
      });

      return saved;
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating studio settings:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan pengaturan studio", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
