import { NextResponse } from "next/server";
import type { z } from "zod";
import { WA_BOT_GUIDE_LIMITS } from "@/lib/constants";
import { getDraftGuide, getPublishedGuide, listGuideVersions, sameGuide } from "./bot-guide";

// Bagian bersama route /api/settings/whatsapp/guide/* (owner). DTO eksplisit (AGENTS.md §36).

export async function guideDto() {
  const [draft, published, versions] = await Promise.all([getDraftGuide(), getPublishedGuide(), listGuideVersions()]);
  return {
    draft,
    published: published && { version: published.version, publishedAt: published.publishedAt },
    // Belum pernah terbit: draft yang berisi dianggap perubahan; draft kosong tidak.
    hasUnpublishedChanges: published
      ? !sameGuide(draft, published.guide)
      : draft.instructions !== "" || draft.faqs.length > 0,
    versions,
    limits: WA_BOT_GUIDE_LIMITS,
  };
}

export function validationError(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "VALIDATION_ERROR",
      message: "Input tidak valid",
      fields: Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message])),
    },
    { status: 400 },
  );
}
