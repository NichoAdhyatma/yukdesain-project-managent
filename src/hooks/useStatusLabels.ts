"use client";

import { useState, useEffect } from "react";

export type StatusLabel = {
  value: string;
  label: string;
  variant: string;
};

export type PaymentStatusLabel = {
  value: string;
  label: string;
  variant: string;
};

let cachedStatuses: StatusLabel[] | null = null;
let cachedPaymentStatuses: PaymentStatusLabel[] | null = null;

export function useStatusLabels() {
  const [projectStatuses, setProjectStatuses] = useState<StatusLabel[]>(cachedStatuses || []);
  const [paymentStatuses, setPaymentStatuses] = useState<PaymentStatusLabel[]>(cachedPaymentStatuses || []);
  const [loading, setLoading] = useState(!cachedStatuses);

  useEffect(() => {
    if (cachedStatuses && cachedPaymentStatuses) return;

    async function fetchLabels() {
      try {
        const res = await fetch("/api/status-labels");
        const data = await res.json();

        if (data.projectStatuses) {
          cachedStatuses = data.projectStatuses;
          setProjectStatuses(data.projectStatuses);
        }
        if (data.paymentStatuses) {
          cachedPaymentStatuses = data.paymentStatuses;
          setPaymentStatuses(data.paymentStatuses);
        }
      } catch (e) {
        console.error("Failed to fetch status labels:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchLabels();
  }, []);

  return {
    projectStatuses,
    paymentStatuses,
    loading,
    getProjectStatus: (value: string) => projectStatuses.find((s) => s.value === value),
    getPaymentStatus: (value: string) => paymentStatuses.find((s) => s.value === value),
  };
}
