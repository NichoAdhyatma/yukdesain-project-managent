import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { createProject, generateInvoiceNumber } from "./create-project";

vi.mock("@/lib/project-code", () => ({
  generateProjectCode: vi.fn(() => "PRJ-20261101-AAAAAA"),
}));

// Fake db minimal: merekam data yang ditulis, sama seperti yang dikirim route lama ke prisma.
function makeDb(opts: { clash?: boolean; lastInvoice?: string | null } = {}) {
  let clashLeft = opts.clash ? 1 : 0;
  const db = {
    project: {
      findUnique: vi.fn(async () => (clashLeft-- > 0 ? { id: "existing" } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "proj_1",
        ...data,
        service: { name: "Logo Minimalis" },
      })),
    },
    activityLog: { create: vi.fn(async () => ({})) },
    invoice: {
      findFirst: vi.fn(async () =>
        opts.lastInvoice ? { invoiceNumber: opts.lastInvoice } : null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "inv_1", ...data })),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pay_1", ...data })),
    },
  };
  return db;
}

const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Prisma.TransactionClient;

const base = {
  client: { id: "cli_1", name: "Budi" },
  serviceId: "svc_1",
  ownerId: "owner_1",
  agreedPrice: 2500000,
  deadline: "2026-12-01",
  notes: "catatan",
};

describe("createProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menulis project dengan data yang sama seperti POST /api/projects lama", async () => {
    const db = makeDb();
    await createProject(asDb(db), { ...base, paidAmount: 1000000 });

    expect(db.project.create).toHaveBeenCalledWith({
      data: {
        projectNumber: "PRJ-20261101-AAAAAA",
        clientId: "cli_1",
        clientName: "Budi",
        serviceId: "svc_1",
        ownerId: "owner_1",
        agreedPrice: 2500000,
        paidAmount: 1000000,
        deadline: new Date("2026-12-01"),
        notes: "catatan",
        status: "DRAFT",
        paymentStatus: "PARTIALLY_PAID",
      },
      include: { client: true, service: true, invoices: true },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "Project",
        entityId: "proj_1",
        action: "CREATED",
        actorId: "owner_1",
        newValue: { projectNumber: "PRJ-20261101-AAAAAA", clientName: "Budi" },
      },
    });
  });

  it("membuat struk dengan layanan sebagai line item dan payment DP", async () => {
    const db = makeDb();
    const { invoice, payment } = await createProject(asDb(db), { ...base, paidAmount: 1000000 });
    const year = new Date().getFullYear();

    expect(invoice).toMatchObject({
      invoiceNumber: `STRUK-${year}-001`,
      items: [{ description: "Logo Minimalis", quantity: 1, unitPrice: 2500000, total: 2500000 }],
      subtotal: 2500000,
      total: 2500000,
      status: "PARTIALLY_PAID",
    });
    expect(payment).toMatchObject({ projectId: "proj_1", amount: 1000000, recordedBy: "owner_1" });
  });

  it("tanpa DP: UNPAID dan tidak membuat payment", async () => {
    const db = makeDb();
    const { project, payment } = await createProject(asDb(db), base);
    expect(project).toMatchObject({ paidAmount: 0, paymentStatus: "UNPAID" });
    expect(payment).toBeNull();
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("membulatkan harga dan DP", async () => {
    const db = makeDb();
    const { project } = await createProject(asDb(db), {
      ...base,
      agreedPrice: 2500000.6,
      paidAmount: 999999.5,
    });
    expect(project).toMatchObject({ agreedPrice: 2500001, paidAmount: 1000000 });
  });

  it("memakai status awal dari pemanggil (alur WA)", async () => {
    const db = makeDb();
    const { project } = await createProject(asDb(db), { ...base, status: "BELUM_DIKERJAKAN" });
    expect(project).toMatchObject({ status: "BELUM_DIKERJAKAN" });
  });

  it("alur WA: status pembayaran & detail payment opsional", async () => {
    const db = makeDb();
    const { project, invoice, payment } = await createProject(asDb(db), {
      ...base,
      paidAmount: 2500000,
      status: "BELUM_DIKERJAKAN",
      paymentStatus: "PAID",
      payment: { method: "Transfer BCA", reference: "TRX1", notes: "via WA" },
    });
    expect(project).toMatchObject({ status: "BELUM_DIKERJAKAN", paymentStatus: "PAID" });
    expect(invoice).toMatchObject({ status: "PAID" });
    expect(payment).toMatchObject({ amount: 2500000, method: "Transfer BCA", reference: "TRX1", notes: "via WA" });
  });

  it("tanpa parameter WA, payment tidak membawa method/reference (sama seperti route lama)", async () => {
    const db = makeDb();
    await createProject(asDb(db), { ...base, paidAmount: 1000000 });
    expect(db.payment.create.mock.calls[0][0].data).not.toHaveProperty("method");
  });

  it("generate ulang kode project jika bentrok", async () => {
    const db = makeDb({ clash: true });
    await createProject(asDb(db), base);
    expect(db.project.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("generateInvoiceNumber", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  it("mulai dari 001 di tahun baru", async () => {
    expect(await generateInvoiceNumber(asDb(makeDb()), now)).toBe("STRUK-2026-001");
  });

  it("melanjutkan nomor terakhir tahun yang sama", async () => {
    const db = makeDb({ lastInvoice: "STRUK-2026-041" });
    expect(await generateInvoiceNumber(asDb(db), now)).toBe("STRUK-2026-042");
  });
});
