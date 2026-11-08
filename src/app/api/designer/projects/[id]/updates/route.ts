import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { parseAttachmentIds, parseProgress } from "@/lib/projects/progress-update";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Data update tidak valid" }, { status: 400 });
    }
    const { description, progress, attachmentIds } = body as Record<string, unknown>;

    // Verify designer is assigned to this project
    const assignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id, designerId: user.id },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Not assigned to this project" }, { status: 403 });
    }

    if (typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Catatan update wajib diisi" }, { status: 400 });
    }

    const parsedProgress = parseProgress(progress);
    if (!parsedProgress.ok) {
      return NextResponse.json({ error: parsedProgress.error }, { status: 400 });
    }

    const parsedAttachments = parseAttachmentIds(attachmentIds);
    if (!parsedAttachments.ok) {
      return NextResponse.json({ error: parsedAttachments.error }, { status: 400 });
    }

    // Lampiran harus file progres project ini yang belum tertaut ke update lain.
    if (parsedAttachments.value.length > 0) {
      const usable = await prisma.attachment.count({
        where: {
          id: { in: parsedAttachments.value },
          projectId: id,
          category: "PROGRESS",
          updateId: null,
        },
      });
      if (usable !== parsedAttachments.value.length) {
        return NextResponse.json(
          { error: "Lampiran tidak ditemukan untuk project ini. Unggah ulang filenya." },
          { status: 400 }
        );
      }
    }

    const update = await prisma.$transaction(async (tx) => {
      const created = await tx.projectUpdate.create({
        data: {
          projectId: id,
          description: description.trim(),
          progress: parsedProgress.value,
          authorId: user.id,
        },
      });

      if (parsedAttachments.value.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: parsedAttachments.value }, projectId: id, updateId: null },
          data: { updateId: created.id },
        });
      }

      return tx.projectUpdate.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          author: { select: { name: true } },
          attachment: true,
        },
      });
    });

    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    console.error("Error creating update:", error);
    return NextResponse.json({ error: "Gagal menyimpan update. Coba lagi." }, { status: 500 });
  }
}
