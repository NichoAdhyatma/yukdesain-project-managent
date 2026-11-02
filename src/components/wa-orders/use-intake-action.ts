"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { deliveryErrorText } from "./labels";
import type { ActionResponse, DeliveryResult } from "./types";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Options = {
  successMessage: string;
  // Untuk aksi yang tujuannya memang mengirim pesan (kirim ulang): kalimat hasil langsung.
  deliveryMessages?: { ok: string; fail: string };
  onSuccess?: (data: ActionResponse) => void;
  // Error ditampilkan sendiri di dekat field (mis. kolom balas chat), bukan lewat toast.
  inlineError?: boolean;
};

/** POST/PATCH ke /api/wa-intakes/[id]/..., perbarui cache detail, daftar, dan badge. */
export function useIntakeAction<TBody>(intakeId: string, path: string, method: "POST" | "PATCH", options: Options) {
  const queryClient = useQueryClient();
  return useMutation<ActionResponse & { delivery?: DeliveryResult }, ActionError, TBody>({
    mutationFn: async (body) => {
      const res = await fetch(`/api/wa-intakes/${intakeId}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ActionError(data.message ?? "Aksi gagal", data.details?.fields ?? {});
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.intake) queryClient.setQueryData(["wa-intake", intakeId], data.intake);
      queryClient.invalidateQueries({ queryKey: ["wa-intakes"] });
      // Keterangan pengiriman ditambahkan dari hasil sebenarnya, bukan diasumsikan terkirim.
      if (data.delivery && options.deliveryMessages) {
        if (data.delivery.ok) toast(options.deliveryMessages.ok, "success");
        else toast(`${options.deliveryMessages.fail} ${deliveryErrorText(data.delivery.errorCode)}`, "error");
      } else if (data.delivery && !data.delivery.ok) {
        toast(`${options.successMessage}, tapi pesan ke klien gagal terkirim. ${deliveryErrorText(data.delivery.errorCode)}`, "error");
      } else if (data.delivery) {
        toast(`${options.successMessage}. Klien sudah dikabari.`, "success");
      } else {
        toast(options.successMessage, "success");
      }
      options.onSuccess?.(data);
    },
    onError: (error) => {
      // Status sudah berubah di tempat lain (409): muat ulang supaya admin melihat keadaan terbaru.
      queryClient.invalidateQueries({ queryKey: ["wa-intake", intakeId] });
      if (!options.inlineError) toast(error.message, "error");
    },
  });
}
