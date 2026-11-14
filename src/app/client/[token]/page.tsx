"use client";

import { useState, useEffect, use, type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { STUDIO_DEFAULTS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertTriangle,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  Paperclip,
  Loader2,
  Send,
  UserCheck,
  RefreshCw,
  Star,
  History,
  Receipt,
  CreditCard,
  CalendarDays,
  ChevronRight,
  Download,
  Building,
  Smartphone,
  ExternalLink,
  Lock,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { ServiceBriefForm } from "@/components/forms/brief/ServiceBriefForm";
import type { BriefResponses } from "@/components/forms/brief/types";
import { BRIEF_FIELD_LABELS } from "@/components/forms/brief/field-labels";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { toast } from "@/components/ui/toast";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { ReceiptPDF } from "@/components/invoice/ReceiptPDF";
import { ImageViewer, ImageViewerGroup, ViewableImage } from "@/components/ui/image-viewer";
import { LatestResultCard } from "@/components/client-portal/LatestResultCard";
import { isImageFile, pickLatestResult } from "@/lib/client-portal/latest-result";
import { SubmitProgressOverlay } from "@/components/ui/submit-progress-overlay";
import { revisionQuotaRemaining } from "@/lib/revisions/quota";
import { CLIENT_PROJECT_STATUS, workProgressPercent } from "@/lib/client-portal/project-progress";
import { REVISION_NOTICE } from "@/lib/constants";
import type { ClientLinkDto, ClientPaymentAccountDto } from "@/lib/client-portal/link-dto";
import { menuPriceLabel } from "@/components/forms/brief/menu-items";
import { MenuItemRows } from "@/components/forms/brief/MenuItemRows";

type BriefResponseItem = {
  questionId: string;
  question: string;
  answer: string;
};

type ClientLink = ClientLinkDto;

type PaymentAccount = ClientPaymentAccountDto;

type TimelineEvent = {
  id: string;
  type: "brief_submitted" | "designer_assigned" | "progress" | "revision" | "revision_done" | "final_submitted" | "final_approved";
  title: string;
  titleShort: string;
  description?: string;
  date: string;
  author?: string;
  progress?: number | null;
  attachments?: Array<{ id: string; filename: string; storageKey: string }>;
  status?: string;
  revisionNumber?: number;
};

const eventConfig: Record<TimelineEvent["type"], { icon: React.ElementType; color: string; bgColor: string; bgColorDark: string }> = {
  brief_submitted: { icon: Send, color: "text-blue-600", bgColor: "bg-blue-100", bgColorDark: "dark:bg-blue-900" },
  designer_assigned: { icon: UserCheck, color: "text-purple-600", bgColor: "bg-purple-100", bgColorDark: "dark:bg-purple-900" },
  progress: { icon: TrendingUp, color: "text-green-600", bgColor: "bg-green-100", bgColorDark: "dark:bg-green-900" },
  revision: { icon: RefreshCw, color: "text-orange-600", bgColor: "bg-orange-100", bgColorDark: "dark:bg-orange-900" },
  revision_done: { icon: CheckCircle2, color: "text-orange-600", bgColor: "bg-orange-100", bgColorDark: "dark:bg-orange-900" },
  final_submitted: { icon: Star, color: "text-amber-600", bgColor: "bg-amber-100", bgColorDark: "dark:bg-amber-900" },
  final_approved: { icon: CheckCircle2, color: "text-emerald-600", bgColor: "bg-emerald-100", bgColorDark: "dark:bg-emerald-900" },
};

// ── Status Config ──────────────────────────────────────────────────────────────

const projectStatusConfig: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  bgColorDark: string;
  textColor: string;
  textColorDark: string;
  description: string;
}> = {
  DRAFT: {
    label: CLIENT_PROJECT_STATUS.DRAFT.label,
    icon: FileText,
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    bgColorDark: "dark:bg-gray-800/60",
    textColor: "text-gray-700",
    textColorDark: "dark:text-gray-200",
    description: CLIENT_PROJECT_STATUS.DRAFT.description
  },
  BELUM_DIKERJAKAN: {
    label: CLIENT_PROJECT_STATUS.BELUM_DIKERJAKAN.label,
    icon: Clock,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    bgColorDark: "dark:bg-yellow-900",
    textColor: "text-yellow-800",
    textColorDark: "dark:text-white",
    description: CLIENT_PROJECT_STATUS.BELUM_DIKERJAKAN.description
  },
  SEDANG_DIKERJAKAN: {
    label: CLIENT_PROJECT_STATUS.SEDANG_DIKERJAKAN.label,
    icon: TrendingUp,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    bgColorDark: "dark:bg-blue-900",
    textColor: "text-blue-800",
    textColorDark: "dark:text-white",
    description: CLIENT_PROJECT_STATUS.SEDANG_DIKERJAKAN.description
  },
  SELESAI: {
    label: CLIENT_PROJECT_STATUS.SELESAI.label,
    icon: CheckCircle2,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    bgColorDark: "dark:bg-emerald-900",
    textColor: "text-emerald-800",
    textColorDark: "dark:text-white",
    description: CLIENT_PROJECT_STATUS.SELESAI.description
  },
};

const paymentStatusConfig: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  bgColorDark: string;
  textColor: string;
  textColorDark: string;
  description: string;
}> = {
  UNPAID: {
    label: "Belum Bayar",
    color: "text-red-600",
    bgColor: "bg-red-100",
    bgColorDark: "dark:bg-red-900",
    textColor: "text-red-800",
    textColorDark: "dark:text-white",
    description: "Segera lakukan pembayaran"
  },
  PARTIALLY_PAID: {
    label: "DP",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    bgColorDark: "dark:bg-yellow-900",
    textColor: "text-yellow-800",
    textColorDark: "dark:text-white",
    description: "Uang muka sudah diterima"
  },
  PAID: {
    label: "Lunas",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    bgColorDark: "dark:bg-emerald-900",
    textColor: "text-emerald-800",
    textColorDark: "dark:text-white",
    description: "Pembayaran lunas"
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** wa.me dari nomor studio ("0812…" / "+62 812…" → "62812…"); null bila nomor belum diisi. */
function waLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

// ── Hero Status Banner ─────────────────────────────────────────────────────────

function HeroBanner({ project, workPct, deadlineStr, statusCfg, paymentCfg }: {
  project: NonNullable<ClientLink["project"]>;
  /** Progres pengerjaan dari update desainer (bukan pembayaran) */
  workPct: number;
  deadlineStr: string;
  statusCfg: typeof projectStatusConfig[string];
  paymentCfg: typeof paymentStatusConfig[string];
}) {
  const Icon = statusCfg.icon;

  return (
    /* Purpose: visual hierarchy — separates hero section from page background, frames primary service info */
    <div className="rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/20 p-4 sm:p-5 space-y-4">
      {/* Top row: Service name + Status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
            {project.service.name}
          </h2>
          <p className="text-sm text-muted-foreground">{project.projectNumber} · {project.clientName}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={cn(
            "text-xs font-medium px-2.5 py-1",
            statusCfg.bgColor, statusCfg.bgColorDark, statusCfg.textColor, statusCfg.textColorDark
          )}>
            <Icon className="h-3 w-3 mr-1" />
            {statusCfg.label}
          </Badge>
        </div>
      </div>

      {/* Status description */}
      <p className="text-sm text-muted-foreground">{statusCfg.description}</p>

      {/* Progress + estimasi selesai (di HP tanggal mendapat baris sendiri supaya tidak terpotong) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Progres pengerjaan</span>
            <span className="font-semibold text-foreground tabular-nums">{workPct}%</span>
          </div>
          <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${workPct}%` }}
            />
          </div>
        </div>

        {/* Deadline */}
        <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Estimasi selesai</p>
            <p className="text-sm font-medium text-foreground">{deadlineStr}</p>
          </div>
        </div>
      </div>

      {/* Designer */}
      {project.assignedDesigner && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-muted-foreground">Desainer:</span>
          <span className="font-medium text-foreground">{project.assignedDesigner.name}</span>
        </div>
      )}
    </div>
  );
}

// ── Quick Action Cards ─────────────────────────────────────────────────────────

function QuickActionCards({ project, paymentPct, remainingQuota, isQuotaExhausted, latestInvoice, paymentCfg, onPaymentClick, onInvoiceClick }: {
  project: NonNullable<ClientLink["project"]>;
  paymentPct: number;
  remainingQuota: number;
  isQuotaExhausted: boolean;
  latestInvoice?: NonNullable<ClientLink["project"]>["invoices"][number];
  paymentCfg: typeof paymentStatusConfig[string];
  onPaymentClick: () => void;
  onInvoiceClick: () => void;
}) {
  const balance = Math.max(0, project.agreedPrice - project.paidAmount);
  // Kartu yang bisa diketuk diberi teks aksi + panah; kartu Revisi hanya informasi (audit 009 #4).
  const clickable =
    "group rounded-xl border bg-card text-left p-4 hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const action = (label: string) => (
    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
      {label}
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </span>
  );

  // Dibuka akun desainer: data keuangan tidak dikirim server, hanya kartu Revisi (keputusan owner 2026-11-13).
  const showFinance = !project.financeHidden;

  return (
    <div className={cn("grid grid-cols-1 gap-3", showFinance && "sm:grid-cols-3")}>
      {/* Pembayaran: yang sudah dibayar dan sisanya langsung terlihat (audit 009 #2) */}
      {showFinance && (
      <button type="button" className={clickable} onClick={onPaymentClick}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CreditCard className="h-4 w-4" aria-hidden />
            Pembayaran
          </span>
          <Badge className={cn("text-xs font-medium", paymentCfg.bgColor, paymentCfg.bgColorDark, paymentCfg.textColor, paymentCfg.textColorDark)}>
            {paymentCfg.label}
          </Badge>
        </div>
        {balance > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">Sisa yang perlu dibayar</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(balance)}</p>
          </>
        ) : (
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(project.agreedPrice)} lunas</p>
        )}
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={paymentPct}
          aria-label={`Sudah dibayar ${paymentPct}%`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${paymentPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">Dibayar {formatCurrency(project.paidAmount)}</p>
        {action("Lihat pembayaran")}
      </button>
      )}

      {/* Revisi: informasi, tidak bisa diketuk */}
      <div className="rounded-xl border bg-card text-left p-4">
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">Revisi</span>
        </div>
        {isQuotaExhausted ? (
          <>
            <Badge className="text-xs font-medium bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 mb-2">Habis</Badge>
            <p className="text-xs text-muted-foreground mt-1">Kuota revisi sudah terpakai semua</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-foreground tabular-nums">{remainingQuota}</span>
              <span className="text-sm text-muted-foreground">dari {project.revisionQuota}x tersisa</span>
            </div>
            <p className="text-xs text-muted-foreground">Pakai tombol Minta revisi bila perlu perubahan.</p>
          </>
        )}
      </div>

      {/* Invoice */}
      {showFinance && (
      <button type="button" className={clickable} onClick={onInvoiceClick}>
        <div className="flex items-center gap-2 mb-2">
          <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">Invoice</span>
        </div>
        {latestInvoice ? (
          <>
            <p className="text-sm font-semibold text-foreground">{latestInvoice.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground tabular-nums">Total {formatCurrency(latestInvoice.total)}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Invoice belum tersedia</p>
        )}
        {action(latestInvoice ? "Lihat & unduh" : "Lihat detail")}
      </button>
      )}
    </div>
  );
}

// ── Langkah berikutnya (audit 009 #10) ─────────────────────────────────────────

/** Apa yang ditunggu dari klien sekarang, tepat di bawah hero, supaya aksinya tidak tertimbun di bawah halaman. */
function NextStepCard({
  project,
  onPayment,
  onFinal,
}: {
  project: NonNullable<ClientLink["project"]>;
  onPayment: () => void;
  onFinal: () => void;
}) {
  const balance = Math.max(0, project.agreedPrice - project.paidAmount);
  const hasFinalFiles = project.finalFiles.files.length > 0;
  const pendingRevision = project.revisions.find((r) => !r.completedAt);

  let title: string;
  let body: string;
  let cta: { label: string; onClick: () => void } | null = null;
  if (project.finalApprovedAt && balance > 0 && hasFinalFiles && !project.financeHidden) {
    title = "Bayar pelunasan untuk membuka file final";
    body = `Sisa ${formatCurrency(balance)}. Setelah admin mencatat pelunasan, file final langsung bisa diunduh.`;
    cta = { label: "Lihat cara bayar", onClick: onPayment };
  } else if (project.finalApprovedAt && project.financeHidden) {
    title = "Project selesai";
    body = "Hasil akhir sudah disetujui klien.";
  } else if (project.finalApprovedAt) {
    title = hasFinalFiles ? "File final siap diunduh" : "Project selesai";
    body = hasFinalFiles ? "Terima kasih sudah mempercayakan desainnya ke kami." : "Terima kasih! File akhir dikirim admin lewat WhatsApp.";
    cta = hasFinalFiles ? { label: "Unduh file final", onClick: onFinal } : null;
  } else if (project.finalSubmittedAt && !pendingRevision) {
    title = "Hasil akhir menunggu persetujuan kamu";
    body = "Cek hasilnya, lalu setujui atau minta revisi kalau masih ada yang perlu diubah.";
    cta = { label: "Cek hasil akhir", onClick: onFinal };
  } else if (pendingRevision) {
    title = `Revisi #${pendingRevision.number} sedang dikerjakan`;
    body = "Kamu dikabari lewat WhatsApp begitu revisinya selesai.";
  } else {
    // Belum ada yang ditunggu dari klien: status di hero sudah cukup, kartu ini tidak mengulangnya.
    return null;
  }

  return (
    <section aria-labelledby="next-step-title" className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">Langkah berikutnya</p>
      <h3 id="next-step-title" className="mt-1 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {cta && (
        <Button type="button" className="mt-3 h-11 w-full rounded-xl sm:w-auto" onClick={cta.onClick}>
          {cta.label}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Button>
      )}
    </section>
  );
}

// ── Horizontal Timeline ────────────────────────────────────────────────────────

function TimelineStep({ event, isActive, isCompleted }: { event: TimelineEvent; isActive: boolean; isCompleted: boolean }) {
  const config = eventConfig[event.type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center text-center min-w-[70px] sm:min-w-[80px]">
      <div className={cn(
        "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ring-4 ring-primary/30 bg-primary text-primary-foreground",
        isActive
          ? "ring-4 ring-primary/30 bg-primary text-primary-foreground"
          : isCompleted
            ? cn(config.bgColor, config.bgColorDark, "ring-2 ring-primary/20")
            : "bg-muted text-muted-foreground"
      )}>
        <Icon className={cn(
          "h-4 w-4 sm:h-4.5 sm:w-4.5",
          isActive ? "text-primary-foreground" : isCompleted ? config.color : "text-muted-foreground"
        )} />
      </div>
      <p className={cn(
        "text-xs mt-2 font-medium leading-tight max-w-[80px] truncate",
        isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
      )}>
        {event.titleShort}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {formatDateShort(event.date)}
      </p>
    </div>
  );
}

function HorizontalTimeline({ events, activeProgress }: { events: TimelineEvent[]; activeProgress?: number }) {
  if (events.length === 0) {
    return (
      <div className="py-6 text-center">
        <History className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Belum ada aktivitas</p>
      </div>
    );
  }

  const progressWidth = activeProgress !== undefined
    ? activeProgress
    : Math.min(100, (events.length / Math.max(events.length, 4)) * 100);

  return (
    <div className="space-y-3">
      {/* Timeline steps */}
      <div className="w-full overflow-x-auto">
        <div className="flex items-start min-w-max px-2 py-1">
          {events.map((event, idx) => (
            <div key={event.id} className="flex items-center">
              <TimelineStep
                event={event}
                isActive={idx === events.length - 1}
                isCompleted={idx < events.length - 1}
              />
              {idx < events.length - 1 && (
                <div className={cn(
                  "h-0.5 w-6 sm:w-8 mx-0.5 sm:mx-1 -mt-5 rounded-full transition-colors duration-500",
                  idx < events.length - 2 ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Timeline Detail (Expandable) ──────────────────────────────────────────────

function TimelineDetail({ events }: { events: TimelineEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) return null;

  // Show only latest 3 events in collapsed list
  const visibleEvents = events.slice(-3);

  return (
    <div className="space-y-2">
      {visibleEvents.map((event) => {
        const config = eventConfig[event.type];
        const Icon = config.icon;
        const isExpanded = expandedId === event.id;

        return (
          <div key={event.id} className="rounded-lg border bg-card overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
            >
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", config.bgColor, config.bgColorDark)}>
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(event.date)}</p>
              </div>
              <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", isExpanded && "rotate-90")} />
            </button>
            {isExpanded && event.description && (
              <div className="px-3 pb-3 pt-0">
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">{event.description}</p>
                {event.progress !== undefined && event.progress !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progres</span>
                      <span className="font-medium">{event.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${event.progress}%` }} />
                    </div>
                  </div>
                )}
                {event.attachments && event.attachments.some((att) => isImageFile(att.filename)) && (
                  <ImageViewerGroup className="mt-2 grid grid-cols-3 gap-2">
                    {event.attachments.filter((att) => isImageFile(att.filename)).map((att) => (
                      <div key={att.id} className="overflow-hidden rounded-md border bg-muted/40">
                        <ViewableImage
                          src={`${process.env.NEXT_PUBLIC_STORAGE_URL || ""}/${att.storageKey}`}
                          alt={`${event.title} ${formatDateShort(event.date)}`}
                          imgClassName="aspect-square w-full object-cover"
                        />
                      </div>
                    ))}
                  </ImageViewerGroup>
                )}
                {event.attachments && event.attachments.some((att) => !isImageFile(att.filename)) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {event.attachments.filter((att) => !isImageFile(att.filename)).map((att) => (
                      <a
                        key={att.id}
                        href={`${process.env.NEXT_PUBLIC_STORAGE_URL || ""}/${att.storageKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-muted/50 px-2 py-1 rounded-md"
                      >
                        <Paperclip className="h-3 w-3" />
                        {att.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab Components ────────────────────────────────────────────────────────────

type BriefTabProject = NonNullable<ClientLink["project"]>;

function BriefTab({ project }: { project: BriefTabProject }) {
  const brief = project.brief;
  if (!brief) return null;

  const responses = Array.isArray(brief.responses) ? (brief.responses as BriefResponseItem[]) : [];
  if (responses.length === 0) return null;

  const textFields: Array<{ label: string; value: string }> = [];
  let menuItems: Array<{ id: string; name: string; price?: string; image?: string; caption?: string }> = [];
  let cartSides: Array<{ sideName: string; dimensions: string; textBrief: string }> = [];
  let boxRefs: Array<{ imageUrl?: string; description?: string }> = [];
  let cartRefs: Array<{ imageUrl?: string; description?: string }> = [];
  const referenceItems: Array<{ type: string; url: string; caption?: string }> = [];
  let brandLogoUrl = "";
  let vendorLogoUrl = "";
  const logosJson: Array<{ url: string; caption?: string }> = [];
  let KopiMenuItems: Array<{ id: string; name: string; price?: string; image?: string; caption?: string }> = [];

  // Label bersama dengan Order WA dan workspace desainer (audit 009 #1: "client_notes" sempat tampil mentah).
  const fieldLabel = (key: string) => BRIEF_FIELD_LABELS[key] ?? key.replace(/_/g, " ");


  function isImageUrl(val: string) {
    if (!val) return false;
    try {
      const ext = new URL(val).pathname.toLowerCase();
      return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(ext) ||
        val.includes("r2.dev") || val.includes("cloudflarestorage") || val.includes("imgix");
    } catch { return false; }
  }

  function parseJson(val: string) {
    try { return JSON.parse(val); }
    catch { return null; }
  }

  for (const item of responses) {
    const q = item.questionId;
    const a = item.answer;
    if (!a) continue;

    if (q === "brand_logo_url" && isImageUrl(a)) { brandLogoUrl = a; continue; }
    if (q === "vendor_logo_url" && isImageUrl(a)) { vendorLogoUrl = a; continue; }

    if (q === "logos_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) {
        for (const logo of parsed) {
          if (logo.url) logosJson.push({ url: logo.url, caption: logo.caption });
        }
      }
      continue;
    }

    if (q === "reference_items_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) {
        for (const refItem of parsed) {
          const url = refItem.type === "url" ? refItem.url : (refItem.imageUrl || refItem.url);
          if (url) {
            referenceItems.push({
              type: refItem.type || "image",
              url,
              caption: refItem.caption || refItem.description,
            });
          }
        }
      }
      continue;
    }

    if (q === "menu_items_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) menuItems = parsed;
      continue;
    }
    if (q === "kopi_menu_items_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) KopiMenuItems = parsed;
      continue;
    }
    if (q === "cart_sides_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) cartSides = parsed;
      continue;
    }
    if (q === "box_references_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) boxRefs = parsed;
      continue;
    }
    if (q === "cart_references_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) cartRefs = parsed;
      continue;
    }

    textFields.push({ label: fieldLabel(q), value: a });
  }

  const textFieldsNonImage = textFields.filter(f => !isImageUrl(f.value));

  return (
    <div className="space-y-4">
      {/* Logo images */}
      {(brandLogoUrl || vendorLogoUrl || logosJson.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {/* Multi logos with captions */}
          {logosJson.map((logo, idx) => (
            <div key={logo.url || idx} className="space-y-1.5 rounded-xl border overflow-hidden">
              <ImageViewer
                src={logo.url}
                alt={logo.caption || `Logo ${idx + 1}`}
                imgClassName="w-full aspect-square object-contain"
                containerClassName="bg-muted/50"
              />
              <div className="p-2">
                <p className="text-xs font-medium text-muted-foreground">Logo Brand</p>
                {logo.caption && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{logo.caption}</p>
                )}
              </div>
            </div>
          ))}
          {/* Legacy single brand logo */}
          {brandLogoUrl && !logosJson.some(l => l.url === brandLogoUrl) && (
            <div className="space-y-1.5 rounded-xl border overflow-hidden">
              <ImageViewer
                src={brandLogoUrl}
                alt="Logo Brand"
                imgClassName="w-full aspect-square object-contain"
                containerClassName="bg-muted/50"
              />
              <div className="p-2">
                <p className="text-xs font-medium text-muted-foreground">Logo Brand</p>
              </div>
            </div>
          )}
          {/* Single vendor logo */}
          {vendorLogoUrl && (
            <div className="space-y-1.5 rounded-xl border overflow-hidden">
              <ImageViewer
                src={vendorLogoUrl}
                alt="Logo Vendor"
                imgClassName="w-full aspect-square object-contain"
                containerClassName="bg-muted/50"
              />
              <div className="p-2">
                <p className="text-xs font-medium text-muted-foreground">Logo Vendor</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Text fields */}
      {textFieldsNonImage.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle role="heading" aria-level={3} className="text-sm">Informasi Project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {textFieldsNonImage.map((f) => (
              <div key={f.label} className="flex flex-col sm:flex-row sm:gap-3 text-sm">
                <p className="text-muted-foreground shrink-0 sm:w-36 text-xs sm:text-sm">{f.label}</p>
                <p className="font-medium text-foreground whitespace-pre-wrap break-words text-sm">{f.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Menu Items */}
      {menuItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daftar Menu</CardTitle>
          </CardHeader>
          <CardContent>
            {!menuItems.some((item) => item.image) ? (
              <MenuItemRows items={menuItems} />
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {menuItems.map((item, idx) => (
                <div key={item.id || idx} className="rounded-xl border overflow-hidden">
                  {item.image && (
                    <ImageViewer
                      src={item.image}
                      alt={item.name}
                      imgClassName="w-full aspect-square object-cover"
                      containerClassName="bg-muted/50"
                    />
                  )}
                  <div className="p-2.5">
                    <p className="text-sm font-medium break-words">{item.name}</p>
                    {menuPriceLabel(item.price) && (
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{menuPriceLabel(item.price)}</p>
                    )}
                    {item.caption && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.caption}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cart Sides */}
      {cartSides.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sisi Gerobak</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-2">
              {cartSides.map((side, idx) => (
                <div key={idx} className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{side.sideName}</p>
                    <p className="text-xs text-muted-foreground">{side.dimensions}</p>
                  </div>
                  {side.textBrief && (
                    <p className="text-xs text-muted-foreground">{side.textBrief}</p>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-auto">
              <div className="min-w-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Sisi</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Ukuran</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartSides.map((side, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2.5 font-medium text-sm">{side.sideName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground text-sm">{side.dimensions}</td>
                        <td className="px-3 py-2.5 text-sm">{side.textBrief || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kopi Menu Items */}
      {KopiMenuItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Menu Kopi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {KopiMenuItems.map((item, idx) => (
                <div key={item.id || idx} className="rounded-xl border overflow-hidden">
                  {item.image && (
                    <ImageViewer
                      src={item.image}
                      alt={item.name}
                      imgClassName="w-full aspect-square object-cover"
                      containerClassName="bg-muted/50"
                    />
                  )}
                  <div className="p-2.5">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {menuPriceLabel(item.price) && (
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{menuPriceLabel(item.price)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Box / Cart References */}
      {(boxRefs.length > 0 || cartRefs.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Referensi Desain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...boxRefs, ...cartRefs].map((ref, idx) =>
                ref.imageUrl ? (
                  <div key={idx} className="space-y-1 rounded-xl border overflow-hidden">
                    <ImageViewer
                      src={ref.imageUrl}
                      alt={ref.description || `Referensi ${idx + 1}`}
                      imgClassName="w-full h-28 sm:h-32 object-cover"
                    />
                    {ref.description && <p className="text-xs text-muted-foreground p-2">{ref.description}</p>}
                  </div>
                ) : ref.description ? (
                  <div key={idx} className="rounded-xl border p-3 text-xs text-muted-foreground">{ref.description}</div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference images */}
      {referenceItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Referensi Gambar & Link</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {referenceItems.map((item, idx) => (
                <div key={item.url + idx} className="space-y-1">
                  {item.type === "url" ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-muted/30 p-3 hover:border-primary/50 transition-colors min-h-28"
                    >
                      <ExternalLink className="h-5 w-5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground text-center leading-tight line-clamp-2 break-all px-1">
                        {item.url.replace(/^https?:\/\//, "")}
                      </p>
                    </a>
                  ) : (
                    <ImageViewer
                      src={item.url}
                      alt={item.caption || `Referensi ${idx + 1}`}
                      imgClassName="w-full h-28 object-cover"
                    />
                  )}
                  {item.caption && (
                    <p className="text-xs text-muted-foreground leading-snug">{item.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InvoiceTab({
  project,
  latestInvoice,
  formatCurrency,
  onDownload,
  isDownloading,
  paymentAccounts,
}: {
  project: NonNullable<ClientLink["project"]>;
  latestInvoice?: NonNullable<ClientLink["project"]>["invoices"][number];
  formatCurrency: (n: number) => string;
  onDownload?: () => void;
  isDownloading?: boolean;
  paymentAccounts: PaymentAccount[];
}) {
  if (!latestInvoice) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Struk belum tersedia</p>
          <p className="text-xs text-muted-foreground mt-1">Struk akan otomatis tersedia setelah project dibuat.</p>
        </CardContent>
      </Card>
    );
  }

  const statusConfig: Record<string, { label: string; bgColor: string; bgColorDark: string; textColor: string; textColorDark: string }> = {
    DRAFT: { label: "Draft", bgColor: "bg-gray-100", bgColorDark: "dark:bg-gray-800", textColor: "text-gray-900", textColorDark: "dark:text-white" },
    ISSUED: { label: "Issued", bgColor: "bg-blue-100", bgColorDark: "dark:bg-blue-900", textColor: "text-blue-950", textColorDark: "dark:text-white" },
    PAID: { label: "Lunas", bgColor: "bg-emerald-100", bgColorDark: "dark:bg-emerald-900", textColor: "text-emerald-950", textColorDark: "dark:text-white" },
    CANCELLED: { label: "Cancelled", bgColor: "bg-red-100", bgColorDark: "dark:bg-red-900", textColor: "text-red-950", textColorDark: "dark:text-white" },
    UNPAID: { label: "Belum Bayar", bgColor: "bg-red-100", bgColorDark: "dark:bg-red-900", textColor: "text-red-950", textColorDark: "dark:text-white" },
    PARTIALLY_PAID: { label: "DP / Cicilan", bgColor: "bg-yellow-100", bgColorDark: "dark:bg-yellow-900", textColor: "text-yellow-950", textColorDark: "dark:text-white" },
  };
  const statusCfg = statusConfig[latestInvoice.status] || statusConfig.UNPAID;

  const remaining = project.agreedPrice - project.paidAmount;

  return (
    <div className="space-y-4">
      {/* Receipt Header Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Struk Pembayaran</p>
              <h3 className="text-lg font-bold text-foreground">{latestInvoice.invoiceNumber}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(latestInvoice.issuedAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={cn("text-xs font-medium shrink-0", statusCfg.bgColor, statusCfg.bgColorDark, statusCfg.textColor, statusCfg.textColorDark)}>
                {statusCfg.label}
              </Badge>
              {onDownload && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1"
                  onClick={onDownload}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Download Struk
                </Button>
              )}
            </div>
          </div>

          {/* Price breakdown — receipt style */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm py-2 border-b">
              <span className="text-muted-foreground">Total Tagihan</span>
              <span className="font-semibold text-foreground">{formatCurrency(latestInvoice.total)}</span>
            </div>
            <div className="flex justify-between text-sm py-2 border-b">
              <span className="text-muted-foreground">Sudah Dibayar</span>
              <span className="font-medium text-emerald-600">{formatCurrency(project.paidAmount)}</span>
            </div>
            {remaining > 0 ? (
              <div className="flex justify-between text-sm py-2">
                <span className="text-muted-foreground font-medium">Sisa Bayar</span>
                <span className="font-bold text-red-600 text-base">{formatCurrency(remaining)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm py-2">
                <span className="text-muted-foreground font-medium">Status</span>
                <span className="font-bold text-emerald-600 text-base">LUNAS</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Guide */}
      {remaining > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Cara Pembayaran</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Transfer ke salah satu akun berikut, lalu konfirmasi ke admin via WhatsApp.
                </p>
              </div>
            </div>

            {paymentAccounts.length > 0 ? (
              <div className="space-y-3">
                {paymentAccounts.map((acc) => (
                  <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg bg-background/80">
                    <div className="flex items-center gap-2 shrink-0">
                      {acc.logoUrl ? (
                        <ImageViewer
                          src={acc.logoUrl}
                          alt={acc.name}
                          imgClassName="w-9 h-9 rounded-lg object-contain"
                          containerClassName="w-9 h-9 rounded-lg overflow-hidden bg-white"
                        />
                      ) : (
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center",
                          acc.type === "BANK" ? "bg-blue-100 dark:bg-blue-900/50" : "bg-green-100 dark:bg-green-900/50"
                        )}>
                          {acc.type === "BANK" ? (
                            <Building className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Smartphone className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      )}
                      {acc.type === "EWALLET" && acc.qrisImageUrl && (
                        <ImageViewer
                          src={acc.qrisImageUrl}
                          alt="QRIS"
                          imgClassName="w-9 h-9 rounded-lg object-contain"
                          containerClassName="w-9 h-9 rounded-lg overflow-hidden bg-white border"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{acc.name}</p>
                      <p className="text-sm font-mono text-foreground">{acc.accountNumber}</p>
                      <p className="text-xs text-muted-foreground">a/n {acc.accountHolder}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Akun pembayaran belum dikonfigurasi. Hubungi admin untuk info rekening.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaymentTab({
  project,
  formatCurrency,
  paymentAccounts,
}: {
  project: NonNullable<ClientLink["project"]>;
  formatCurrency: (n: number) => string;
  paymentAccounts: PaymentAccount[];
}) {
  const paymentCfg = paymentStatusConfig[project.paymentStatus] || paymentStatusConfig.UNPAID;
  const remaining = project.agreedPrice - project.paidAmount;
  const paidPct = project.agreedPrice > 0 ? Math.round((project.paidAmount / project.agreedPrice) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Main Payment Status */}
      <Card className="border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p role="heading" aria-level={3} className="text-xs text-muted-foreground">Status Pembayaran</p>
              <Badge className={cn("text-sm font-semibold mt-1 px-3 py-1", paymentCfg.bgColor, paymentCfg.bgColorDark, paymentCfg.textColor, paymentCfg.textColorDark)}>
                {paymentCfg.label}
              </Badge>
            </div>
          </div>

          {/* Amount breakdown */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Harga</span>
              <span className="font-medium text-foreground">{formatCurrency(project.agreedPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sudah Dibayar</span>
              <span className="font-medium text-emerald-600">{formatCurrency(project.paidAmount)}</span>
            </div>
            {remaining > 0 ? (
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground font-medium">Sisa</span>
                <span className="font-bold text-destructive text-base">{formatCurrency(remaining)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground font-medium">Status</span>
                <span className="font-bold text-emerald-600 text-base">LUNAS</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{formatCurrency(project.paidAmount)} dibayar</span>
              <span className="font-medium">{paidPct}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Guide */}
      {remaining > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Segera Lakukan Pembayaran</p>
                <p className="text-xs text-amber-950 dark:text-amber-300 leading-relaxed">
                  Transfer ke rekening yang tertera pada invoice resmi. Setelah transfer, kirim bukti ke admin via WhatsApp untuk konfirmasi.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment complete message */}
      {remaining === 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Pembayaran sudah lunas. Terima kasih!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Accounts */}
      {paymentAccounts.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p role="heading" aria-level={3} className="text-xs font-medium text-muted-foreground">Rekening Pembayaran</p>
            </div>
            {paymentAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1.5 shrink-0">
                  {acc.logoUrl ? (
                    <ImageViewer
                      src={acc.logoUrl}
                      alt={acc.name}
                      imgClassName="w-9 h-9 rounded-lg object-contain"
                      containerClassName="w-9 h-9 rounded-lg overflow-hidden bg-white"
                    />
                  ) : (
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      acc.type === "BANK" ? "bg-blue-100 dark:bg-blue-900/50" : "bg-green-100 dark:bg-green-900/50"
                    )}>
                      {acc.type === "BANK" ? (
                        <Building className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Smartphone className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                  )}
                  {acc.type === "EWALLET" && acc.qrisImageUrl && (
                    <ImageViewer
                      src={acc.qrisImageUrl}
                      alt="QRIS"
                      imgClassName="w-9 h-9 rounded-lg object-contain"
                      containerClassName="w-9 h-9 rounded-lg overflow-hidden bg-white border"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{acc.name}</p>
                  <p className="text-sm font-mono text-foreground">{acc.accountNumber}</p>
                  <p className="text-xs text-muted-foreground">a/n {acc.accountHolder}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Final Approval Card ───────────────────────────────────────────────────────

function FinalApprovalCard({
  project,
  isApproveOpen,
  setApproveOpen,
  approvingFinal,
  onApprove,
  formatDate,
}: {
  project: NonNullable<ClientLink["project"]>;
  isApproveOpen: boolean;
  setApproveOpen: (v: boolean) => void;
  approvingFinal: boolean;
  onApprove: () => void;
  formatDate: (d: string) => string;
}) {
  // Ada file final: kartu File final menjadi kartu penutup (selesai + unduh / pelunasan), audit 009 #14.
  if (project.finalApprovedAt && project.finalFiles.files.length > 0) return null;
  if (project.finalApprovedAt) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">Project selesai</p>
              <p className="text-sm text-emerald-900 dark:text-emerald-100">
                Disetujui pada {formatDate(project.finalApprovedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!project.finalSubmittedAt) return null;

  return (
    <div className="space-y-3">
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <Star className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Hasil akhir sudah dikirim</p>
              <p className="text-xs text-blue-950 dark:text-blue-100 mt-0.5">
                Desainer sudah mengirim hasil akhir. Cek dulu, lalu setujui kalau sudah sesuai.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="h-11 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl shadow-sm"
        onClick={() => setApproveOpen(true)}
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Setujui hasil akhir
      </Button>

      {isApproveOpen && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle role="heading" aria-level={3} className="text-base">Setujui hasil akhir?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-3">
              <p className="text-sm text-emerald-950 dark:text-emerald-100">
                Setelah disetujui, project ditandai selesai. Kalau masih ada yang perlu diubah, pakai tombol <strong>Minta revisi</strong>.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setApproveOpen(false)}>
                Batal
              </Button>
              <Button
                className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                onClick={onApprove}
                disabled={approvingFinal}
              >
                {approvingFinal ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memproses...</>
                ) : "Ya, setujui"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── File final: terkunci sampai lunas (2026-11-12) ────────────────────────────

function FinalFilesCard({
  project,
  formatCurrency,
  onPaymentClick,
}: {
  project: NonNullable<ClientLink["project"]>;
  formatCurrency: (n: number) => string;
  onPaymentClick: () => void;
}) {
  const { locked, files } = project.finalFiles;
  if (!project.finalSubmittedAt || files.length === 0) return null;
  const balance = Math.max(0, project.agreedPrice - project.paidAmount);
  const approvedAt = project.finalApprovedAt;

  return (
    <Card id="final-files" className={cn("scroll-mt-4", approvedAt && "border-emerald-200 dark:border-emerald-800")}>
      {approvedAt && (
        <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="font-semibold">Project selesai</span>, disetujui {formatDate(approvedAt)}. Terima kasih!
          </span>
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle role="heading" aria-level={3} className="flex items-center gap-2 text-base">
          {locked ? <Lock className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          File final
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && project.financeHidden && (
          <p role="note" className="text-sm text-muted-foreground">File final terbuka untuk klien setelah pelunasan.</p>
        )}
        {locked && !project.financeHidden && (
          <div
            role="note"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="text-sm font-medium">Bisa diunduh setelah pelunasan</p>
            <p className="mt-0.5 text-xs">
              Sisa pelunasan <span className="font-semibold tabular-nums">{formatCurrency(balance)}</span>. Setelah admin
              mencatat pelunasan, file di bawah langsung bisa diunduh dari halaman ini.
            </p>
          </div>
        )}
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id}>
              {locked || !f.storageKey ? (
                <div className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 break-all">{f.filename}</span>
                  <span className="sr-only">, terkunci sampai pelunasan</span>
                </div>
              ) : (
                <a
                  href={`${process.env.NEXT_PUBLIC_STORAGE_URL || ""}/${f.storageKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 break-all">{f.filename}</span>
                  <span className="sr-only">, unduh</span>
                </a>
              )}
            </li>
          ))}
        </ul>
        {locked && !project.financeHidden && (
          <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={onPaymentClick}>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden />
            Lihat cara bayar pelunasan
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Revision Form ─────────────────────────────────────────────────────────────

function RevisionForm({
  isOpen,
  setOpen,
  isSubmitting,
  description,
  setDescription,
  files,
  setFiles,
  onSubmit,
  onBeforeSubmit,
  notice,
}: {
  isOpen: boolean;
  setOpen: (v: boolean) => void;
  isSubmitting: boolean;
  /** Peringatan revisi dari Operasional studio */
  notice: string;
  description: string;
  setDescription: (v: string) => void;
  files: Array<{ id: string; file: File; preview?: string }>;
  setFiles: Dispatch<SetStateAction<Array<{ id: string; file: File; preview?: string }>>>;
  onSubmit: () => void;
  onBeforeSubmit?: () => void;
}) {
  if (!isOpen) return null;

  return (
    <Card id="revision-form" className="scroll-mt-4">
      <CardHeader className="pb-3">
        <CardTitle role="heading" aria-level={3} className="text-base">Minta revisi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning */}
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-950 dark:text-amber-300 leading-relaxed">
              {notice}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label htmlFor="revision" className="text-sm font-medium text-foreground">
            Deskripsi Revisi <span className="text-destructive">*</span>
          </label>
          <textarea
            id="revision"
            className="w-full min-h-32 p-3 border rounded-xl text-sm resize-none bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
            placeholder="Jelaskan perubahan yang diinginkan secara detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* File Upload */}
        <FileUploadField
          files={files}
          onChange={setFiles}
          maxFiles={10}
          label="Gambar Referensi"
          hint="untuk upload"
        />

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => { setOpen(false); setFiles([]); }}
          >
            Batal
          </Button>
          <Button
            className="flex-1 rounded-xl"
            onClick={() => { onBeforeSubmit?.(); onSubmit(); }}
            disabled={isSubmitting || !description.trim()}
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengirim...</>
            ) : "Kirim Revisi"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [link, setLink] = useState<ClientLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingBrief, setIsSubmittingBrief] = useState(false);

  const [briefSubmittedData, setBriefSubmittedData] = useState<{
    projectNumber: string;
    clientName: string;
    token: string;
  } | null>(null);

  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [revisionProgress, setRevisionProgress] = useState(0);
  const [revisionDescription, setRevisionDescription] = useState("");
  const [revisionFiles, setRevisionFiles] = useState<Array<{ id: string; file: File; preview?: string }>>([]);
  const [approveFinalOpen, setApproveFinalOpen] = useState(false);
  const [approvingFinal, setApprovingFinal] = useState(false);
  const [activeTab, setActiveTab] = useState<"brief" | "invoice" | "payment">("brief");

  // Gulir ke bagian yang dituju; tanpa animasi bila pengguna meminta gerakan dikurangi.
  const scrollToSection = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  // Ganti tab lalu gulir ke tab itu: di HP tab ada ±1.000px di bawah kartu (audit 009 #3).
  const goToTab = (tab: "brief" | "invoice" | "payment") => {
    setActiveTab(tab);
    scrollToSection("project-tabs");
  };
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [revisionNotice, setRevisionNotice] = useState<string>(REVISION_NOTICE);
  const [studioName, setStudioName] = useState(STUDIO_DEFAULTS.name);
  const [studioPhone, setStudioPhone] = useState("");

  useEffect(() => {
    fetch("/api/settings/studio")
      .then((r) => r.json())
      .then((s) => {
        if (s.name) setStudioName(s.name);
        if (typeof s.phone === "string") setStudioPhone(s.phone);
      })
      .catch(() => {});
  }, []);

  const fetchLink = async () => {
    try {
      const res = await fetch(`/api/client-links/${token}`);
      if (!res.ok) {
        if (res.status === 410) setError("Link ini sudah tidak berlaku.");
        else setError("Link tidak ditemukan");
        return;
      }
      const data = await res.json();
      setLink(data.link);
      setPaymentAccounts(data.paymentAccounts || []);
      if (typeof data.revisionNotice === "string" && data.revisionNotice) setRevisionNotice(data.revisionNotice);
    } catch {
      setError("Halaman belum bisa dimuat. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern */
  useEffect(() => { fetchLink(); }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmitBrief = async (responses: BriefResponses, attachmentIds: string[]) => {
    setIsSubmittingBrief(true);
    try {
      const res = await fetch(`/api/client-links/${token}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, attachmentIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setBriefSubmittedData({
          projectNumber: data.projectNumber,
          clientName: data.clientName,
          token: data.token,
        });
        await fetchLink();
      } else {
        toast(data.error || "Gagal submit brief", "error");
      }
    } catch {
      toast("Terjadi kesalahan", "error");
    } finally {
      setIsSubmittingBrief(false);
    }
  };

  const handleSubmitRevision = async () => {
    if (!revisionDescription.trim()) { toast("Mohon isi deskripsi revisi", "error"); return; }
    const total = revisionFiles.length;
    setRevisionProgress(total > 0 ? 0 : 100);
    try {
      const attachmentIds: string[] = [];
      for (let i = 0; i < revisionFiles.length; i++) {
        const fd = new FormData();
        fd.append("file", revisionFiles[i].file);
        fd.append("projectId", link!.project!.id);
        fd.append("category", "revision");
        const res = await fetch(`/api/client-links/${token}/upload`, { method: "POST", body: fd });
        if (res.ok) { const d = await res.json(); attachmentIds.push(d.attachmentId); }
        setRevisionProgress(Math.round(((i + 1) / total) * 95));
      }
      const fd = new FormData();
      fd.append("description", revisionDescription);
      attachmentIds.forEach((id) => fd.append("attachmentIds", id));
      const res = await fetch(`/api/client-links/${token}/revisions`, { method: "POST", body: fd });
      if (res.ok) {
        toast("Revisi berhasil disubmit!", "success");
        setIsRevisionOpen(false);
        setRevisionDescription("");
        setRevisionFiles([]);
        fetchLink();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal submit revisi", "error");
      }
    } catch {
      toast("Terjadi kesalahan", "error");
    } finally {
      setIsSubmittingRevision(false);
      setRevisionProgress(0);
    }
  };

  const handleApproveFinal = async () => {
    setApprovingFinal(true);
    try {
      const res = await fetch(`/api/client-links/${token}/approve-final`, { method: "POST" });
      if (res.ok) {
        toast("Project selesai. Terima kasih!", "success");
        setApproveFinalOpen(false);
        fetchLink();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal approve", "error");
      }
    } catch {
      toast("Terjadi kesalahan", "error");
    } finally {
      setApprovingFinal(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!latestInvoice) return;
    setIsDownloadingInvoice(true);
    try {
      const doc = (
        <ReceiptPDF
          invoiceNumber={latestInvoice.invoiceNumber}
          issuedAt={latestInvoice.issuedAt}
          clientName={project.clientName}
          projectNumber={project.projectNumber}
          serviceName={project.service.name}
          items={latestInvoice.items}
          subtotal={latestInvoice.subtotal}
          total={latestInvoice.total}
          paidAmount={project.paidAmount}
          paymentStatus={project.paymentStatus}
          agreedPrice={project.agreedPrice}
          studioName={studioName}
        />
      );
      const blob = await pdf(doc).toBlob();
      saveAs(blob, `${latestInvoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate receipt:", err);
      toast("Gagal generate struk. Coba lagi.", "error");
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  // Loading state
  // Kerangka bentuk halaman, bukan spinner layar penuh (audit 009 #13).
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" role="status" aria-live="polite">
        <span className="sr-only">Memuat progres project…</span>
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4 motion-safe:animate-pulse" aria-hidden>
          <div className="mx-auto h-6 w-40 rounded bg-muted" />
          <div className="h-44 rounded-2xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !link) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-sm w-full text-center p-6">
          <div className="w-14 h-14 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-yellow-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Halaman project tidak bisa dibuka</h2>
          <p className="text-sm text-muted-foreground">{error || "Link tidak ditemukan."}</p>
          <p className="mt-2 text-sm text-muted-foreground">Minta link terbaru ke admin, nanti kami kirimkan lewat WhatsApp.</p>
          {waLink(studioPhone) && (
            <a
              href={waLink(studioPhone)!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "mt-4 h-11 w-full rounded-xl")}
            >
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
              Hubungi admin di WhatsApp
            </a>
          )}
        </Card>
      </div>
    );
  }

  const project = link.project!;
  // non-null: we've returned early if !link or (!hasBrief && !project)
  const hasBrief = !!project?.brief;

  // Brief form (before submission)
  if (!hasBrief && project) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-foreground">{studioName}</h1>
            <p className="text-sm text-muted-foreground">Form Brief Project</p>
          </div>
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{project.service.name}</p>
                  <p className="text-xs text-muted-foreground">{project.projectNumber}</p>
                </div>
                <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-white">
                  Brief Required
                </Badge>
              </div>
            </CardContent>
          </Card>
          <ServiceBriefForm
            projectId={project.id}
            clientToken={token}
            serviceCode={project.service.code}
            serviceName={project.service.name}
            onSubmit={handleSubmitBrief}
            isSubmitting={isSubmittingBrief}
            onBeforeSubmit={() => setIsSubmittingBrief(true)}
          />
        </div>
      </div>
    );
  }

  // Brief submitted confirmation
  if (briefSubmittedData) {
    const submittedInvoice = project?.invoices?.[0];
    const submittedPaymentAccounts = paymentAccounts;

    const handleDownloadReceipt = async () => {
      if (!submittedInvoice) return;
      setIsDownloadingInvoice(true);
      try {
        const invoiceItems = submittedInvoice.items.map((item: { description: string; quantity: number; unitPrice: number; total: number }) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        }));
        const blob = await pdf(
          <ReceiptPDF
            invoiceNumber={submittedInvoice.invoiceNumber}
            issuedAt={submittedInvoice.issuedAt}
            clientName={briefSubmittedData.clientName}
            projectNumber={briefSubmittedData.projectNumber}
            serviceName={project?.service?.name}
            items={invoiceItems}
            subtotal={submittedInvoice.subtotal}
            total={submittedInvoice.total}
            paidAmount={project?.paidAmount ?? 0}
            paymentStatus={project?.paymentStatus ?? "UNPAID"}
            agreedPrice={project?.agreedPrice ?? submittedInvoice.total}
            paymentAccounts={submittedPaymentAccounts}
            clientToken={briefSubmittedData.projectNumber}
            studioName={studioName}
            clientPortalUrl={`${window.location.origin}/client-portal`}
          />
        ).toBlob();
        saveAs(blob, `struk-${briefSubmittedData.projectNumber}.pdf`);
      } finally {
        setIsDownloadingInvoice(false);
      }
    };

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-md mx-auto px-4 py-10 sm:py-16">

          {/* Logo mark */}
          <div className="text-center mb-10">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {studioName}
            </p>
          </div>

          {/* Main card */}
          <div className="border border-border rounded-lg overflow-hidden">

            {/* Top: confirmation */}
            <div className="px-6 pt-6 pb-5 border-b border-border">
              <div className="flex items-start gap-4">
                {/* Check circle — minimal, unambiguous confirmation signal */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mt-0.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-foreground leading-snug">
                    Brief berhasil dikirim
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Brief Anda sudah diterima. Designer akan menghubungi melalui WhatsApp untuk konfirmasi berikutnya.
                  </p>
                </div>
              </div>
            </div>

            {/* Tracking code — the ONE focal point: dashed border box */}
            <div className="px-6 py-5 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Kode Lacak Pesanan
              </p>
              <div className="border-2 border-dashed border-foreground/20 rounded-md px-4 py-3 text-center">
                <p className="text-2xl font-bold font-mono tracking-widest text-foreground">
                  {briefSubmittedData.projectNumber}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Catat kode ini dan masukkan di Client Portal untuk melacak pesanan
              </p>
            </div>

            {/* Bottom section: invoice + client portal */}
            <div className="px-6 py-5 space-y-4">

              {/* Invoice download */}
              {submittedInvoice ? (
                <div className="flex items-center justify-between py-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Struk Pembayaran</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{submittedInvoice.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        minimumFractionDigits: 0,
                      }).format(submittedInvoice.total)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadReceipt}
                    disabled={isDownloadingInvoice}
                  >
                    {isDownloadingInvoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-1">
                  Invoice akan tersedia setelah project diproses oleh designer
                </p>
              )}

              {/* Client portal link */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">Lacak pesanan</p>
                <a
                  href="/client-portal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground hover:text-primary underline underline-offset-4"
                >
                  Buka Client Portal
                  <ExternalLink className="inline h-3.5 w-3.5 ml-1.5 align-middle" />
                </a>
              </div>
            </div>

          </div>

          {/* Footer */}
          <p className="text-xs text-center text-muted-foreground mt-6">
            Brief Required · {studioName} · Jakarta
          </p>
        </div>
      </div>
    );
  }

  // Tracking view
  const revisions = project?.revisions || [];
  const remainingQuota = revisionQuotaRemaining(revisions.length, project.revisionQuota);
  const isQuotaExhausted = remainingQuota === 0;
  // Hasil desain terbaru di atas halaman (permintaan owner 2026-11-14).
  const latestResult = pickLatestResult(project.updates || []);
  const openRevisionForm = () => {
    setIsRevisionOpen(true);
    // Form revisi baru dirender setelah state berubah; gulir setelah frame berikutnya.
    requestAnimationFrame(() => scrollToSection("revision-form"));
  };
  const latestInvoice = project?.invoices?.[0];
  const statusCfg = projectStatusConfig[project.status] || projectStatusConfig.DRAFT;
  const paymentCfg = paymentStatusConfig[project.paymentStatus] || paymentStatusConfig.UNPAID;
  const paidPct = project.agreedPrice > 0 ? Math.round((project.paidAmount / project.agreedPrice) * 100) : 0;
  const workPct = workProgressPercent(project);

  const timelineEvents = buildTimeline(project);
  const deadlineStr = project.deadline ? formatDate(project.deadline) : "-";

  const allTabs = [
    {
      id: "brief" as const,
      label: "Brief",
      icon: FileText,
      badge: hasBrief ? "✓" : undefined,
    },
    {
      id: "invoice" as const,
      label: "Invoice",
      icon: Receipt,
      // Nomor invoice ada di dalam tab; badge panjang terlipat 3 baris di HP (audit 009 #8).
      badge: undefined,
    },
    {
      id: "payment" as const,
      label: "Pembayaran",
      icon: CreditCard,
      badge: paymentCfg.label,
    },
  ];
  // Dibuka akun desainer: tab Invoice dan Pembayaran tidak ditampilkan (keputusan owner 2026-11-13).
  const tabs = project.financeHidden ? allTabs.filter((t) => t.id === "brief") : allTabs;

  return (
    <>
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">
        {/* Header */}
        <div className="text-center pb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{studioName}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Progres project</p>
        </div>

        {/* Hero Banner — status + progress + deadline */}
        <HeroBanner
          project={project}
          workPct={workPct}
          deadlineStr={deadlineStr}
          statusCfg={statusCfg}
          paymentCfg={paymentCfg}
        />

        <NextStepCard
          project={project}
          onPayment={() => goToTab("payment")}
          onFinal={() => scrollToSection(project.finalFiles.files.length > 0 && project.finalApprovedAt ? "final-files" : "final-actions")}
        />

        {/* Hasil desain terbaru: tepat di bawah langkah berikutnya, sebelum riwayat (permintaan owner 2026-11-14) */}
        {latestResult && (
          <LatestResultCard
            result={latestResult}
            canRevise={!project.finalApprovedAt && !isQuotaExhausted}
            remainingRevisions={remainingQuota}
            onRevise={openRevisionForm}
          />
        )}

        {/* Quick Action Cards */}
        <QuickActionCards
          project={project}
          paymentPct={paidPct}
          remainingQuota={remainingQuota}
          isQuotaExhausted={isQuotaExhausted}
          latestInvoice={latestInvoice}
          paymentCfg={paymentCfg}
          onPaymentClick={() => goToTab("payment")}
          onInvoiceClick={() => goToTab("invoice")}
        />

        {/* Timeline horizontal mulai tablet; di HP langkah terakhir terpotong dan isinya sama dengan daftar di bawah
            (audit 009 #9). */}
        <Card className="hidden sm:block">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle role="heading" aria-level={3} className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4" aria-hidden />
                Riwayat
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {timelineEvents.length} langkah
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <HorizontalTimeline events={timelineEvents} activeProgress={workPct} />
          </CardContent>
        </Card>

        {/* Timeline Detail (expandable) */}
        {timelineEvents.length > 0 && (
          <TimelineDetail events={timelineEvents} />
        )}

        {/* Tab Bar — mobile-friendly, full width */}
        <div id="project-tabs" className="flex gap-1 bg-muted/30 rounded-xl p-1 scroll-mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex min-h-11 items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-medium transition-all",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
                {tab.badge && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px]">
          {activeTab === "brief" && project?.brief && <BriefTab project={project} />}
          {activeTab === "brief" && !project?.brief && (
            <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">Brief belum disubmit.</p></CardContent></Card>
          )}
          {activeTab === "invoice" && (
            <InvoiceTab
              project={project}
              latestInvoice={latestInvoice}
              formatCurrency={formatCurrency}
              onDownload={handleDownloadInvoice}
              isDownloading={isDownloadingInvoice}
              paymentAccounts={paymentAccounts}
            />
          )}
          {activeTab === "payment" && (
            <PaymentTab project={project} formatCurrency={formatCurrency} paymentAccounts={paymentAccounts} />
          )}
        </div>

        {/* Final Approval / Revision Actions */}
        <div id="final-actions" className="space-y-3 pt-2 scroll-mt-4">
          {/* Show revision button if not yet final approved, quota available, and has final submission */}
          {/* Kartu hasil terbaru sudah punya tombol ini; di sini hanya bila belum ada gambar hasil. */}
          {!project.finalApprovedAt && !isQuotaExhausted && !latestResult && (
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl text-sm font-medium"
              onClick={() => setIsRevisionOpen(true)}
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
              Minta revisi ({remainingQuota}x tersisa)
            </Button>
          )}

          {isQuotaExhausted && !project.finalApprovedAt && (
            <Button className="h-11 w-full rounded-xl" disabled>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Kuota Revisi Habis
            </Button>
          )}

          <FinalApprovalCard
            project={project}
            isApproveOpen={approveFinalOpen}
            setApproveOpen={setApproveFinalOpen}
            approvingFinal={approvingFinal}
            onApprove={handleApproveFinal}
            formatDate={formatDate}
          />

          <FinalFilesCard
            project={project}
            formatCurrency={formatCurrency}
            onPaymentClick={() => goToTab("payment")}
          />

          <RevisionForm
            isOpen={isRevisionOpen}
            setOpen={setIsRevisionOpen}
            isSubmitting={isSubmittingRevision}
            description={revisionDescription}
            setDescription={setRevisionDescription}
            files={revisionFiles}
            setFiles={setRevisionFiles}
            onSubmit={handleSubmitRevision}
            onBeforeSubmit={() => setIsSubmittingRevision(true)}
            notice={revisionNotice}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-2 pb-4">
          {studioName} © 2026
        </p>
      </div>
    </div>

    <SubmitProgressOverlay progress={revisionProgress} label="Mengunggah lampiran..." />
    </>
  );
}

// ── Build Timeline ─────────────────────────────────────────────────────────────

function buildTimeline(project: NonNullable<ClientLink["project"]>): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const shortTitles: Record<string, string> = {
    brief_submitted: "Brief",
    designer_assigned: "Desainer",
    progress: "Progres",
    revision: "Revisi",
    final_submitted: "Final",
    final_approved: "Selesai",
  };

  if (project.brief) {
    events.push({
      id: "brief-submitted",
      type: "brief_submitted",
      title: "Brief dikirim",
      titleShort: shortTitles.brief_submitted,
      description: "Brief sudah kami terima. Project siap dikerjakan.",
      date: project.brief.submittedAt,
    });
  }

  if (project.assignedDesigner) {
    events.push({
      id: "designer-assigned",
      type: "designer_assigned",
      title: "Desainer ditugaskan",
      titleShort: shortTitles.designer_assigned,
      description: `${project.assignedDesigner.name} telah ditugaskan untuk project ini.`,
      date: project.assignedDesigner.assignedAt,
    });
  }

  const sortedUpdates = [...(project.updates || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const update of sortedUpdates) {
    events.push({
      id: `progress-${update.id}`,
      type: "progress",
      title: "Update progres",
      titleShort: shortTitles.progress,
      description: update.description,
      date: update.createdAt,
      author: update.author.name,
      progress: update.progress,
      attachments: update.attachment ? [update.attachment] : [],
    });
  }

  const sortedRevisions = [...project.revisions].sort(
    (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
  );
  for (const rev of sortedRevisions) {
    events.push({
      id: `revision-${rev.id}`,
      type: "revision",
      title: `Revisi #${rev.number}`,
      titleShort: `${shortTitles.revision} ${rev.number}`,
      description: rev.description,
      date: rev.requestedAt,
      status: rev.status,
      revisionNumber: rev.number,
      attachments: rev.attachments,
    });
    // Desainer menandai revisi selesai dikerjakan (docs/CLIENT_NOTIFICATIONS.md)
    if (rev.completedAt) {
      events.push({
        id: `revision-done-${rev.id}`,
        type: "revision_done",
        title: `Revisi #${rev.number} selesai`,
        titleShort: `${shortTitles.revision} ${rev.number} selesai`,
        description: "Revisi sudah dikerjakan desainer. Cek hasilnya di update terbaru.",
        date: rev.completedAt,
        revisionNumber: rev.number,
      });
    }
  }

  if (project.finalSubmittedAt) {
    events.push({
      id: "final-submitted",
      type: "final_submitted",
      title: "Hasil akhir dikirim",
      titleShort: shortTitles.final_submitted,
      description: "Desainer sudah mengirim hasil akhir. Menunggu persetujuan kamu.",
      date: project.finalSubmittedAt,
    });
  }

  if (project.finalApprovedAt) {
    events.push({
      id: "final-approved",
      type: "final_approved",
      title: "Project selesai",
      titleShort: shortTitles.final_approved,
      description: "Hasil akhir sudah kamu setujui. Terima kasih!",
      date: project.finalApprovedAt,
    });
  }

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
