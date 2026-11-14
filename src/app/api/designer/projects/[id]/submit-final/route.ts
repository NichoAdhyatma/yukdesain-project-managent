import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { notifyClientProjectEvent } from "@/lib/notifications/client-project-events";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("DESIGNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify designer is assigned to this project
    const assignment = await prisma.projectAssignment.findFirst({
      where: {
        projectId: id,
        designerId: user.id,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Not assigned to this project" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: { assignments: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.finalSubmittedAt) {
      return NextResponse.json(
        { error: "Hasil akhir sudah dikirim" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const attachmentIds: string[] = Array.isArray(body?.attachmentIds)
      ? body.attachmentIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    if (!description) {
      return NextResponse.json({ error: "Catatan hasil akhir wajib diisi" }, { status: 400 });
    }
    // Cara kirim (2026-11-14): FILE = unggah (default form lama), LINK = Google Drive dll., WHATSAPP = dikirim langsung
    // lewat WhatsApp. Ketiganya terkunci untuk klien sampai lunas (link baru terlihat, file WA baru dikirim).
    const method = body?.method === undefined ? "FILE" : body.method;
    if (method !== "FILE" && method !== "LINK" && method !== "WHATSAPP") {
      return NextResponse.json({ error: "Cara kirim hasil akhir tidak dikenal" }, { status: 400 });
    }
    let finalLink: string | null = null;
    const ownFiles = { id: { in: attachmentIds }, projectId: id, updateId: null };
    if (method === "FILE") {
      // Hasil akhir = file yang dibuka klien setelah lunas (2026-11-12); tanpa file tidak ada yang dikirim.
      if (attachmentIds.length === 0) {
        return NextResponse.json({ error: "Lampirkan minimal satu file hasil akhir" }, { status: 400 });
      }
      // Hanya file yang diunggah ke project ini dan belum tertaut ke update lain.
      if ((await prisma.attachment.count({ where: ownFiles })) !== attachmentIds.length) {
        return NextResponse.json({ error: "File hasil akhir tidak ditemukan untuk project ini. Unggah ulang filenya." }, { status: 400 });
      }
    }
    if (method === "LINK") {
      finalLink = parseFinalLink(body?.link);
      if (!finalLink) {
        return NextResponse.json({ error: "Isi link file final yang lengkap, diawali https://" }, { status: 400 });
      }
    }

    // Project baru SELESAI setelah klien menyetujui, bukan di sini.
    const updated = await prisma.project.update({
      where: { id },
      data: { finalSubmittedAt: new Date(), finalDelivery: method, finalLink },
    });

    // Tampil di riwayat portal sebagai update 100%; klien dikabari lewat FINAL_SUBMITTED, bukan kabar progres.
    await prisma.projectUpdate.create({
      data: {
        projectId: id,
        description: `Hasil akhir: ${description}`,
        authorId: user.id,
        progress: 100,
        notifyClient: false,
      },
    });

    if (method === "FILE") await prisma.attachment.updateMany({ where: ownFiles, data: { category: "FINAL" } });

    after(() => notifyClientProjectEvent(id, { kind: "FINAL_SUBMITTED" }).then(() => undefined));

    return NextResponse.json({ project: updated }, { status: 200 });
  } catch (error) {
    console.error("Error submitting final:", error);
    return NextResponse.json(
      { error: "Failed to submit final work" },
      { status: 500 }
    );
  }
}

/** Link file final: hanya URL http(s) lengkap (bukan javascript:/data:), dibersihkan dari spasi. */
function parseFinalLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > 2000) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
