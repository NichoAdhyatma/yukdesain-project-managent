import type { PaymentStatus, Prisma, ProjectStatus } from "@prisma/client";
import { generateProjectCode } from "@/lib/project-code";

// Diekstrak dari POST /api/projects supaya alur WhatsApp (approve-intake) memakai
// logika yang sama persis. Menerima `db` berupa prisma atau transaction client.
type Db = Prisma.TransactionClient;

export async function generateUniqueProjectNumber(db: Db): Promise<string> {
  // Project code: unik dan tidak bisa ditebak — endpoint lookup di client
  // portal bersifat publik, kode berurutan bisa dienumerate.
  let projectNumber = generateProjectCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.project.findUnique({
      where: { projectNumber },
      select: { id: true },
    });
    if (!clash) break;
    projectNumber = generateProjectCode();
  }
  return projectNumber;
}

export async function generateInvoiceNumber(db: Db, now: Date): Promise<string> {
  const year = now.getFullYear();
  const lastInvoice = await db.invoice.findFirst({
    where: { invoiceNumber: { startsWith: `STRUK-${year}-` } },
    orderBy: { invoiceNumber: "desc" },
  });
  let nextInvoiceNum = 1;
  if (lastInvoice?.invoiceNumber) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(`STRUK-${year}-`, ""));
    nextInvoiceNum = lastNum + 1;
  }
  return `STRUK-${year}-${String(nextInvoiceNum).padStart(3, "0")}`;
}

export type CreateProjectInput = {
  client: { id: string; name: string };
  serviceId: string;
  ownerId: string;
  agreedPrice: number;
  paidAmount?: number; // DP yang sudah diterima; > 0 → payment dicatat
  deadline: string | number | Date;
  notes?: string | null;
  status?: ProjectStatus; // alur lama: DRAFT (brief belum masuk); alur WA: BELUM_DIKERJAKAN
  // Opsional, hanya dipakai alur WA. Alur lama tidak mengirimnya → perilaku tetap.
  paymentStatus?: PaymentStatus;
  payment?: { method?: string | null; reference?: string | null; notes?: string | null };
};

/**
 * Buat project + struk (STRUK-YYYY-NNN) + payment DP + ActivityLog.
 * Pembuatan client dilakukan pemanggil.
 */
export async function createProject(db: Db, input: CreateProjectInput) {
  const { client, serviceId, ownerId, agreedPrice, paidAmount, deadline, notes } = input;

  const projectNumber = await generateUniqueProjectNumber(db);

  const project = await db.project.create({
    data: {
      projectNumber,
      clientId: client.id,
      clientName: client.name,
      serviceId,
      ownerId,
      agreedPrice: Math.round(agreedPrice || 0),
      paidAmount: Math.round(paidAmount || 0),
      deadline: new Date(deadline),
      notes,
      status: input.status ?? "DRAFT",
      paymentStatus: input.paymentStatus ?? ((paidAmount ?? 0) > 0 ? "PARTIALLY_PAID" : "UNPAID"),
    },
    include: {
      client: true,
      service: true,
      invoices: true,
    },
  });

  await db.activityLog.create({
    data: {
      entityType: "Project",
      entityId: project.id,
      action: "CREATED",
      actorId: ownerId,
      newValue: { projectNumber, clientName: client.name },
    },
  });

  // Struk otomatis dengan layanan sebagai line item
  const now = new Date();
  const invoiceNumber = await generateInvoiceNumber(db, now);

  const invoice = await db.invoice.create({
    data: {
      projectId: project.id,
      invoiceNumber,
      items: [{
        description: project.service?.name || "Jasa Design",
        quantity: 1,
        unitPrice: project.agreedPrice,
        total: project.agreedPrice,
      }],
      subtotal: project.agreedPrice,
      total: project.agreedPrice,
      status: project.paymentStatus,
      issuedAt: now,
    },
  });

  // DP dicatat di depan jika paidAmount > 0
  const payment =
    project.paidAmount > 0
      ? await db.payment.create({
          data: {
            projectId: project.id,
            amount: project.paidAmount,
            date: now,
            recordedBy: ownerId,
            ...(input.payment && {
              method: input.payment.method ?? null,
              reference: input.payment.reference ?? null,
              notes: input.payment.notes ?? null,
            }),
          },
        })
      : null;

  return { project, invoice, payment };
}
