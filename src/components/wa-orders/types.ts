// Bentuk respons /api/wa-intakes/* untuk komponen klien (lihat src/lib/whatsapp/intake-api.ts).

export type WaIntakeStatus = "COLLECTING" | "AWAITING_QUOTE" | "QUOTED" | "DP_REVIEW" | "APPROVED" | "CANCELLED";

export type WaIntakeListItem = {
  id: string;
  status: WaIntakeStatus;
  clientName: string | null;
  phoneMasked: string;
  service: { code: string; name: string } | null;
  agreedPrice: number | null;
  dpAmount: number | null;
  deadline: string | null;
  pendingProofs: number;
  conversationMode: "BOT" | "HUMAN";
  outsideServiceWindow: boolean;
  updatedAt: string;
};

export type WaIntakeListResponse = {
  items: WaIntakeListItem[];
  counts: Record<WaIntakeStatus, number>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DeliveryResult =
  | { ok: true; via: "text" | "template"; messageId: string }
  | { ok: false; via: "text" | "template" | null; errorCode: string; messageId: string | null };

export type PaymentExtraction = {
  isTransferReceipt: boolean;
  amount: number | null;
  transferDate: string | null;
  senderName: string | null;
  recipientName: string | null;
  recipientAccount: string | null;
  bankOrWallet: string | null;
  referenceNo: string | null;
  readability: "clear" | "partial" | "unreadable";
};

export type WaIntakeDetail = {
  id: string;
  status: WaIntakeStatus;
  service: { id: string; code: string; name: string } | null;
  clientName: string | null;
  clientEmail: string | null;
  brief: {
    draft: Record<string, unknown>;
    responses: { questionId: string; question: string; answer: string }[];
    summary: string | null;
    confirmedAt: string | null;
    editedByAdmin: boolean;
  };
  quote: { agreedPrice: number | null; dpAmount: number | null; deadline: string | null; quotedAt: string | null };
  cancelReason: string | null;
  projectId: string | null;
  project: { id: string; projectNumber: string } | null;
  conversation: {
    id: string;
    waId: string;
    profileName: string | null;
    mode: "BOT" | "HUMAN";
    lastInboundAt: string | null;
    outsideServiceWindow: boolean;
  };
  messages: {
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    type: string;
    body: string;
    imageUrl: string | null;
    sentByBot: boolean;
    sentByAdmin: boolean;
    deliveryStatus: string | null;
    errorCode: string | null;
    createdAt: string;
  }[];
  proofs: {
    id: string;
    imageUrl: string | null;
    extraction: PaymentExtraction | null;
    flags: string[];
    status: "PENDING" | "APPROVED" | "REJECTED";
    verifiedAmount: number | null;
    rejectReason: string | null;
    reviewedAt: string | null;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type ActionResponse = { intake: WaIntakeDetail | null; delivery?: DeliveryResult };
