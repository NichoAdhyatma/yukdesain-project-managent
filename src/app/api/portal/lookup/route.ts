import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// "Lacak pesanan": kode project + 4 digit akhir nomor WhatsApp klien (keputusan owner 2026-11-13). Sebelumnya kode
// project saja cukup untuk membuka portal lengkap dengan invoice, dan kode itu terlihat oleh desainer di Workspace.
// Klien yang membuka link portal dari WhatsApp tidak melewati halaman ini.

/** Percobaan 4 digit salah per kode project sebelum dikunci sementara. */
export const MAX_FAILED_LOOKUPS = 5;
export const LOOKUP_LOCK_MS = 15 * 60_000;

// Satu proses Node di VPS: cukup di memori (restart hanya mengosongkan hitungan).
const failures = new Map<string, { count: number; firstAt: number }>();

/** Untuk tes. */
export function resetLookupAttempts(): void {
  failures.clear();
}

const lastFour = (phone: string | null | undefined) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const NOT_FOUND = "Kode project atau 4 digit nomor WhatsApp tidak cocok. Periksa lagi, atau minta link project ke admin.";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim().toUpperCase();
  const phone = searchParams.get("phone")?.trim() ?? "";

  if (!code) {
    return NextResponse.json({ error: "Kode project diperlukan" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(phone)) {
    return NextResponse.json({ error: "Isi 4 digit terakhir nomor WhatsApp yang dipakai saat order." }, { status: 400 });
  }

  const now = Date.now();
  const tried = failures.get(code);
  if (tried && now - tried.firstAt > LOOKUP_LOCK_MS) failures.delete(code);
  if ((failures.get(code)?.count ?? 0) >= MAX_FAILED_LOOKUPS) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi, atau minta link project ke admin." }, { status: 429 });
  }

  const project = await prisma.project.findFirst({
    where: { projectNumber: { equals: code } },
    select: {
      projectNumber: true,
      clientName: true,
      client: { select: { phone: true, waConversations: { where: { isSandbox: false }, select: { waId: true } } } },
      clientLinks: { where: { status: "ACTIVE" }, take: 1, orderBy: { createdAt: "desc" }, select: { token: true } },
    },
  });

  const knownNumbers = project
    ? [project.client?.phone, ...(project.client?.waConversations ?? []).map((c) => c.waId)].map(lastFour).filter(Boolean)
    : [];
  if (project && knownNumbers.length === 0) {
    return NextResponse.json({ error: "Project ini belum punya nomor WhatsApp klien. Minta link project ke admin." }, { status: 404 });
  }
  if (!project || !knownNumbers.includes(phone)) {
    const current = failures.get(code);
    failures.set(code, { count: (current?.count ?? 0) + 1, firstAt: current?.firstAt ?? now });
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  const activeLink = project.clientLinks[0];
  if (!activeLink) {
    return NextResponse.json({ error: "Link tracking belum dibuat untuk project ini. Hubungi admin." }, { status: 404 });
  }

  failures.delete(code);
  return NextResponse.json({ projectNumber: project.projectNumber, clientName: project.clientName, token: activeLink.token });
}
