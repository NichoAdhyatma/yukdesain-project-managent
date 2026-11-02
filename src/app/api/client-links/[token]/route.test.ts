import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    clientLink: { findUnique: vi.fn(), update: vi.fn() },
    paymentAccount: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.db }));

import { GET } from "./route";

// Strings that only exist in internal columns. None of them may appear anywhere in the response.
const SECRETS = {
  notes: "SECRET_INTERNAL_NOTE",
  ownerId: "SECRET_OWNER_ID",
  clientId: "SECRET_CLIENT_ID",
  serviceId: "SECRET_SERVICE_ID",
  clientEmail: "secret-client@example.com",
  clientPhone: "+6281999000111",
  designerId: "SECRET_DESIGNER_ID",
  assignmentId: "SECRET_ASSIGNMENT_ID",
  assignedBy: "SECRET_ASSIGNED_BY",
  authorId: "SECRET_AUTHOR_ID",
  uploaderId: "SECRET_UPLOADER_ID",
  paymentNotes: "SECRET_PAYMENT_NOTE",
  paymentReference: "SECRET_BANK_SLIP",
  recordedBy: "SECRET_RECORDED_BY",
  linkId: "SECRET_LINK_ID",
  invoiceId: "SECRET_INVOICE_ID",
  briefId: "SECRET_BRIEF_ID",
};
const FREELANCER_PAYOUT = 987654321;

const assignedAt = new Date("2026-10-02T09:00:00.000Z");
const submittedAt = new Date("2026-10-01T08:00:00.000Z");

// What a careless `include` would load: every column of every relation.
function rawLink(status: string, expiresAt: Date | null = null) {
  return {
    id: SECRETS.linkId,
    token: "Abc123Def456Ghi7",
    projectId: "proj_1",
    status,
    expiresAt,
    usedAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    project: {
      id: "proj_1",
      projectNumber: "PRJ-20261001-K7M4Q2",
      clientId: SECRETS.clientId,
      clientName: "Budi",
      serviceId: SECRETS.serviceId,
      agreedPrice: 1500000,
      paidAmount: 750000,
      projectDate: new Date("2026-10-01T00:00:00.000Z"),
      deadline: new Date("2026-10-20T00:00:00.000Z"),
      status: "SEDANG_DIKERJAKAN",
      priority: "HIGH",
      paymentStatus: "DP",
      ownerId: SECRETS.ownerId,
      notes: SECRETS.notes,
      finalSubmittedAt: null,
      finalApprovedAt: null,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      updatedAt: new Date("2026-10-02T00:00:00.000Z"),
      client: {
        id: SECRETS.clientId,
        name: "Budi",
        email: SECRETS.clientEmail,
        phone: SECRETS.clientPhone,
      },
      service: { id: SECRETS.serviceId, code: "SVC-01", name: "Logo Design", description: "internal desc" },
      brief: {
        id: SECRETS.briefId,
        projectId: "proj_1",
        submittedAt,
        responses: { brandName: "Kopi Budi" },
      },
      invoices: [
        {
          id: SECRETS.invoiceId,
          projectId: "proj_1",
          invoiceNumber: "INV-2026-0001",
          items: [
            { description: "Logo", quantity: 1, unitPrice: 1500000, total: 1500000, cost: FREELANCER_PAYOUT },
          ],
          subtotal: 1500000,
          tax: null,
          total: 1500000,
          status: "DP",
          issuedAt: new Date("2026-10-01T10:00:00.000Z"),
          dueDate: null,
        },
      ],
      assignments: [
        {
          id: SECRETS.assignmentId,
          projectId: "proj_1",
          designerId: SECRETS.designerId,
          assignedAt,
          assignedBy: SECRETS.assignedBy,
          freelancerPayout: FREELANCER_PAYOUT,
          designer: { id: SECRETS.designerId, name: "Sari", email: "sari@yukdesain.com" },
        },
      ],
      updates: [
        {
          id: "upd_1",
          projectId: "proj_1",
          progress: 40,
          description: "Sketsa awal",
          authorId: SECRETS.authorId,
          createdAt: new Date("2026-10-03T00:00:00.000Z"),
          author: { id: SECRETS.authorId, name: "Sari" },
          attachment: {
            id: "att_1",
            filename: "sketsa.png",
            mimeType: "image/png",
            size: 1234,
            storageKey: "progress/proj_1/sketsa.png",
            uploaderId: SECRETS.uploaderId,
            projectId: "proj_1",
          },
        },
      ],
      revisions: [
        {
          id: "rev_1",
          projectId: "proj_1",
          number: 1,
          description: "Warna lebih terang",
          status: "PENDING",
          remainingQuota: 2,
          requestedAt: new Date("2026-10-04T00:00:00.000Z"),
          handledAt: null,
          attachments: [
            {
              id: "att_2",
              filename: "ref.jpg",
              mimeType: "image/jpeg",
              size: 999,
              storageKey: "revision/proj_1/ref.jpg",
              uploaderId: SECRETS.uploaderId,
            },
          ],
        },
      ],
      payments: [
        {
          id: "pay_1",
          amount: 750000,
          notes: SECRETS.paymentNotes,
          reference: SECRETS.paymentReference,
          recordedBy: SECRETS.recordedBy,
        },
      ],
    },
  };
}

const rawAccount = {
  id: "acc_1",
  type: "BANK",
  name: "BCA",
  accountNumber: "1234567890",
  accountHolder: "YukDesain",
  logoUrl: "",
  qrisImageUrl: "",
  isActive: true,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function call(token = "Abc123Def456Ghi7") {
  return GET(new Request(`http://localhost/api/client-links/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.paymentAccount.findMany.mockResolvedValue([rawAccount]);
  mocks.db.clientLink.update.mockResolvedValue({});
});

describe("GET /api/client-links/[token]", () => {
  it("never returns internal fields, even when the DB row contains them", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink("LOCKED"));

    const res = await call();
    expect(res.status).toBe(200);
    const text = await res.text();

    for (const secret of Object.values(SECRETS)) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(String(FREELANCER_PAYOUT));
    for (const key of [
      "notes",
      "ownerId",
      "clientId",
      "serviceId",
      "client",
      "assignments",
      "freelancerPayout",
      "designerId",
      "assignedBy",
      "authorId",
      "uploaderId",
      "payments",
      "priority",
      "remainingQuota",
      "email",
      "phone",
      "isActive",
    ]) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it("returns exactly the fields the client portal renders", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink("LOCKED"));

    const body = await (await call()).json();

    expect(body).toEqual({
      link: {
        status: "LOCKED",
        project: {
          id: "proj_1",
          projectNumber: "PRJ-20261001-K7M4Q2",
          clientName: "Budi",
          deadline: "2026-10-20T00:00:00.000Z",
          status: "SEDANG_DIKERJAKAN",
          agreedPrice: 1500000,
          paidAmount: 750000,
          paymentStatus: "DP",
          finalSubmittedAt: null,
          finalApprovedAt: null,
          service: { code: "SVC-01", name: "Logo Design" },
          brief: { submittedAt: submittedAt.toISOString(), responses: { brandName: "Kopi Budi" } },
          invoices: [
            {
              invoiceNumber: "INV-2026-0001",
              items: [{ description: "Logo", quantity: 1, unitPrice: 1500000, total: 1500000 }],
              subtotal: 1500000,
              total: 1500000,
              status: "DP",
              issuedAt: "2026-10-01T10:00:00.000Z",
            },
          ],
          assignedDesigner: { name: "Sari", assignedAt: assignedAt.toISOString() },
          updates: [
            {
              id: "upd_1",
              progress: 40,
              description: "Sketsa awal",
              createdAt: "2026-10-03T00:00:00.000Z",
              author: { name: "Sari" },
              attachment: { id: "att_1", filename: "sketsa.png", storageKey: "progress/proj_1/sketsa.png" },
            },
          ],
          revisions: [
            {
              id: "rev_1",
              number: 1,
              status: "PENDING",
              description: "Warna lebih terang",
              requestedAt: "2026-10-04T00:00:00.000Z",
              attachments: [{ id: "att_2", filename: "ref.jpg", storageKey: "revision/proj_1/ref.jpg" }],
            },
          ],
        },
      },
      paymentAccounts: [
        {
          id: "acc_1",
          type: "BANK",
          name: "BCA",
          accountNumber: "1234567890",
          accountHolder: "YukDesain",
          logoUrl: "",
          qrisImageUrl: "",
        },
      ],
    });
  });

  it("does not load internal columns from the database", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink("ACTIVE"));
    await call();

    const args = mocks.db.clientLink.findUnique.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    const query = JSON.stringify(args.select);
    for (const key of ["notes", "ownerId", "client", "payments", "freelancerPayout", "assignedBy", "email", "phone"]) {
      expect(query).not.toContain(`"${key}"`);
    }
    expect(mocks.db.paymentAccount.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it("returns an empty brief and no designer before the brief is submitted", async () => {
    const link = rawLink("ACTIVE");
    link.project.brief = null as never;
    link.project.assignments = [];
    mocks.db.clientLink.findUnique.mockResolvedValue(link);

    const body = await (await call()).json();
    expect(body.link.status).toBe("ACTIVE");
    expect(body.link.project.brief).toBeNull();
    expect(body.link.project.assignedDesigner).toBeNull();
  });

  it("returns 404 for an unknown token", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(null);
    const res = await call("Unknown000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Link not found", code: "NOT_FOUND" });
  });

  it("marks an ACTIVE link past expiresAt as EXPIRED and returns 410", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink("ACTIVE", new Date("2020-01-01T00:00:00.000Z")));
    const res = await call();
    expect(res.status).toBe(410);
    expect(mocks.db.clientLink.update).toHaveBeenCalledWith({
      where: { id: SECRETS.linkId },
      data: { status: "EXPIRED" },
    });
    expect(await res.text()).not.toContain(SECRETS.notes);
  });

  it("returns 410 for an EXPIRED link", async () => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink("EXPIRED"));
    const res = await call();
    expect(res.status).toBe(410);
    expect(mocks.db.clientLink.update).not.toHaveBeenCalled();
  });

  it.each(["LOCKED", "SUBMITTED"])("still returns tracking data for a %s link", async (status) => {
    mocks.db.clientLink.findUnique.mockResolvedValue(rawLink(status, new Date("2020-01-01T00:00:00.000Z")));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).link.status).toBe(status);
    expect(mocks.db.clientLink.update).not.toHaveBeenCalled();
  });
});
