import { NextResponse } from "next/server";
import { WaIntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { REAL_INTAKE, errorResponse, listInclude, toListItem } from "@/lib/whatsapp/intake-api";

const STATUSES = Object.values(WaIntakeStatus);

// GET /api/wa-intakes?status=AWAITING_QUOTE&page=1&pageSize=20
export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  if (statusParam && statusParam !== "all" && !STATUSES.includes(statusParam as WaIntakeStatus)) {
    return errorResponse("VALIDATION_ERROR", "Status tidak dikenal", { fields: { status: statusParam } });
  }
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(params.get("pageSize") ?? "20", 10) || 20));
  const where = statusParam && statusParam !== "all" ? { ...REAL_INTAKE, status: statusParam as WaIntakeStatus } : REAL_INTAKE;

  const [rows, total, grouped] = await Promise.all([
    prisma.waIntake.findMany({
      where,
      include: listInclude,
      orderBy: { updatedAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.waIntake.count({ where }),
    prisma.waIntake.groupBy({ by: ["status"], where: REAL_INTAKE, _count: { _all: true } }),
  ]);

  // Jumlah per status untuk badge tab (§12.1)
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<WaIntakeStatus, number>;
  for (const g of grouped) counts[g.status] = g._count._all;

  return NextResponse.json({
    items: rows.map(toListItem),
    counts,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}
