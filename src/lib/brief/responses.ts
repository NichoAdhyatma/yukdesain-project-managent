// Format Brief.responses yang dibaca BriefReader. Dipakai oleh form brief
// (POST /api/client-links/[token]/brief) dan alur WhatsApp, supaya kedua sumber
// menghasilkan brief yang identik (docs/WHATSAPP_AI_CHATBOT.md §10.6).

export type BriefResponseEntry = {
  questionId: string;
  question: string;
  answer: string;
};

/** Objek BriefResponses → array entri. Nilai kosong dibuang; objek/array di-JSON-kan. */
export function briefResponsesToEntries(responses: Record<string, unknown>): BriefResponseEntry[] {
  return Object.entries(responses)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      questionId: key,
      question: key.replace(/_/g, " "),
      answer: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}
