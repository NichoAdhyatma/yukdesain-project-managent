"use client";

import { useState, useEffect, use } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { ServiceBriefForm } from "@/components/forms/brief/ServiceBriefForm";
import type { BriefResponses } from "@/components/forms/brief/types";

type BriefResponseItem = {
  questionId: string;
  question: string;
  answer: string;
};
import { toast } from "@/components/ui/toast";

type ClientLink = {
  id: string;
  token: string;
  status: string;
  project: {
    id: string;
    projectNumber: string;
    clientName: string;
    deadline: string;
    status: string;
    agreedPrice: number;
    paidAmount: number;
    paymentStatus: string;
    finalSubmittedAt?: string;
    finalApprovedAt?: string;
    service: { code: string; name: string };
    brief: { id: string; responses: BriefResponses } | null;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      total: number;
      status: string;
      issuedAt: string;
    }>;
    updates: Array<{
      id: string;
      progress: number | null;
      description: string;
      author: { name: string };
      createdAt: string;
      attachment?: {
        id: string;
        filename: string;
        storageKey: string;
      } | null;
    }>;
    revisions: Array<{
      id: string;
      number: number;
      status: string;
      description: string;
      requestedAt: string;
      attachments: Array<{
        id: string;
        filename: string;
        storageKey: string;
        mimeType: string;
      }>;
    }>;
    assignments: Array<{
      designer: { id: string; name: string };
    }>;
  } | null;
};

type TimelineEvent = {
  id: string;
  type: "brief_submitted" | "designer_assigned" | "progress" | "revision" | "final_submitted" | "final_approved";
  title: string;
  description?: string;
  date: string;
  author?: string;
  progress?: number | null;
  attachments?: Array<{ id: string; filename: string; storageKey: string }>;
  status?: string;
  revisionNumber?: number;
};

const eventConfig: Record<TimelineEvent["type"], { icon: React.ElementType; color: string; bgColor: string }> = {
  brief_submitted: { icon: Send, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900" },
  designer_assigned: { icon: UserCheck, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900" },
  progress: { icon: TrendingUp, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900" },
  revision: { icon: RefreshCw, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900" },
  final_submitted: { icon: Star, color: "text-yellow-600", bgColor: "bg-yellow-100 dark:bg-yellow-900" },
  final_approved: { icon: CheckCircle2, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900" },
};

const MAX_REVISION_QUOTA = 3;

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const config = eventConfig[event.type];
  const Icon = config.icon;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{event.title}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(event.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
          </span>
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground mt-0.5">{event.description}</p>
        )}
        {event.progress !== undefined && event.progress !== null && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{event.progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${event.progress}%` }}
              />
            </div>
          </div>
        )}
        {event.attachments && event.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {event.attachments.map((att) => (
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
    </div>
  );
}

function buildTimeline(project: NonNullable<ClientLink["project"]>): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Brief submitted
  if (project.brief) {
    events.push({
      id: `brief-${project.brief.id}`,
      type: "brief_submitted",
      title: "Brief submitted",
      description: "Brief berhasil disubmit. Project siap diproses.",
      date: (project.brief as { submittedAt?: string }).submittedAt || project.brief.id,
    });
  }

  // Designer assigned
  if (project.assignments && project.assignments.length > 0) {
    events.push({
      id: `assigned-${project.assignments[0].designer.id}`,
      type: "designer_assigned",
      title: "Designer ditugaskan",
      description: `${project.assignments[0].designer.name} telah ditugaskan untuk project ini.`,
      date: (project.assignments[0] as unknown as { assignedAt?: string }).assignedAt || new Date().toISOString(),
    });
  }

  // Progress updates (sorted oldest first)
  const sortedUpdates = [...(project.updates || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const update of sortedUpdates) {
    events.push({
      id: `progress-${update.id}`,
      type: "progress",
      title: "Progress update",
      description: update.description,
      date: update.createdAt,
      author: update.author.name,
      progress: update.progress,
      attachments: update.attachment ? [update.attachment] : [],
    });
  }

  // Revisions (sorted oldest first)
  const sortedRevisions = [...project.revisions].sort(
    (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
  );
  for (const rev of sortedRevisions) {
    events.push({
      id: `revision-${rev.id}`,
      type: "revision",
      title: `Revisi #${rev.number}`,
      description: rev.description,
      date: rev.requestedAt,
      status: rev.status,
      revisionNumber: rev.number,
      attachments: rev.attachments,
    });
  }

  // Final submitted
  if (project.finalSubmittedAt) {
    events.push({
      id: "final-submitted",
      type: "final_submitted",
      title: "Final work submitted",
      description: "Designer telah submit hasil akhir. Menunggu approval kamu.",
      date: project.finalSubmittedAt,
    });
  }

  // Final approved
  if (project.finalApprovedAt) {
    events.push({
      id: "final-approved",
      type: "final_approved",
      title: "Project selesai!",
      description: "Final work telah disetujui. Terima kasih!",
      date: project.finalApprovedAt,
    });
  }

  // Sort by date
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

const statusMap: Record<string, { label: string; variant: string; class: string }> = {
  DRAFT: { label: "Draft", variant: "secondary", class: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  BELUM_DIKERJAKAN: { label: "Menunggu Brief", variant: "secondary", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  SEDANG_DIKERJAKAN: { label: "Sedang Dikerjakan", variant: "default", class: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  SELESAI: { label: "Selesai", variant: "default", class: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const paymentStatusMap: Record<string, { label: string; class: string }> = {
  UNPAID: { label: "Belum Bayar", class: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  PARTIALLY_PAID: { label: "DP", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  PAID: { label: "Lunas", class: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

// ── Tab Components ──────────────────────────────────────────────────────────

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
  const referenceImages: string[] = [];
  let brandLogoUrl = "";
  let vendorLogoUrl = "";
  let KopiMenuItems: Array<{ id: string; name: string; price?: string; image?: string; caption?: string }> = [];

  const FIELD_LABELS: Record<string, string> = {
    brand_name: "Nama Brand / Usaha",
    tagline: "Tagline",
    business_desc: "Deskripsi Bisnis",
    colors: "Warna yang Diinginkan",
    main_text: "Teks Utama",
    size: "Ukuran",
    style: "Gaya / Style",
    dimensions: "Dimensi",
    mandatory_info: "Informasi Wajib",
    color_concept: "Konsep Warna",
    sticker_shape: "Bentuk Sticker",
    sticker_media: "Media Cetak",
    sticker_text: "Teks Sticker",
    photobooth_size: "Ukuran Fotobooth",
    vendor_name: "Nama Vendor / Tempat",
    event_theme: "Tema Acara",
    sosmed_platform: "Platform Social Media",
    sosmed_vibe: "Vibe / Gaya",
  };

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

    if (q === "reference_items_json") {
      const parsed = parseJson(a);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.imageUrl) referenceImages.push(item.imageUrl);
          else if (item.url) referenceImages.push(item.url);
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

    // Regular text / image URL fields
    if (isImageUrl(a)) {
      textFields.push({ label: FIELD_LABELS[q] || q, value: a });
    } else {
      textFields.push({ label: FIELD_LABELS[q] || q, value: a });
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo images */}
      {(brandLogoUrl || vendorLogoUrl) && (
        <div className="grid grid-cols-2 gap-3">
          {brandLogoUrl && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Logo Brand</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandLogoUrl} alt="Logo Brand" className="w-full max-h-32 object-contain rounded-lg border bg-muted/50" />
            </div>
          )}
          {vendorLogoUrl && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Logo Vendor</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vendorLogoUrl} alt="Logo Vendor" className="w-full max-h-32 object-contain rounded-lg border bg-muted/50" />
            </div>
          )}
        </div>
      )}

      {/* Text fields */}
      {textFields.filter(f => !isImageUrl(f.value)).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Informasi Brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {textFields.filter(f => !isImageUrl(f.value)).map((f) => (
              <div key={f.label} className="flex gap-3 text-sm">
                <p className="text-muted-foreground shrink-0 w-40">{f.label}</p>
                <p className="font-medium whitespace-pre-wrap wrap-break-word">{f.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Menu Items (SVC-03/04/05) */}
      {menuItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daftar Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {menuItems.map((item, idx) => (
                <div key={item.id || idx} className="rounded-lg border overflow-hidden">
                  {item.image && (
                    <div className="aspect-square bg-muted/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.price && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(parseInt(item.price, 10) || 0)}</p>
                    )}
                    {item.caption && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.caption}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cart Sides (SVC-11) */}
      {cartSides.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sisi Gerobak</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
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
                    <td className="px-3 py-2 font-medium">{side.sideName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{side.dimensions}</td>
                    <td className="px-3 py-2">{side.textBrief || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Kopi Menu Items (SVC-11) */}
      {KopiMenuItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Menu Kopi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {KopiMenuItems.map((item, idx) => (
                <div key={item.id || idx} className="rounded-lg border overflow-hidden">
                  {item.image && (
                    <div className="aspect-square bg-muted/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.price && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(parseInt(item.price, 10) || 0)}</p>
                    )}
                    {item.caption && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.caption}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Box References (SVC-07) */}
      {(boxRefs.length > 0 || cartRefs.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Referensi Desain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...boxRefs, ...cartRefs].map((ref, idx) =>
                ref.imageUrl ? (
                  <div key={idx} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.imageUrl} alt={ref.description || `Referensi ${idx + 1}`} className="w-full h-32 object-cover rounded-lg border" />
                    {ref.description && <p className="text-xs text-muted-foreground">{ref.description}</p>}
                  </div>
                ) : ref.description ? (
                  <div key={idx} className="rounded-lg border p-2 text-xs text-muted-foreground">{ref.description}</div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference images */}
      {referenceImages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Referensi Gambar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {referenceImages.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Referensi ${idx + 1}`} className="w-full h-28 object-cover rounded-lg border hover:border-primary transition-colors" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Info */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Layanan:</span> {project.service.name} ({project.service.code})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

type InvoiceTabProject = NonNullable<ClientLink["project"]>;
type InvoiceTabInvoice = NonNullable<ClientLink["project"]>["invoices"][number];

function InvoiceTab({
  project,
  latestInvoice,
  formatDate,
  formatCurrency,
}: {
  project: InvoiceTabProject;
  latestInvoice: InvoiceTabInvoice;
  formatDate: (d: string) => string;
  formatCurrency: (n: number) => string;
}) {
  if (!latestInvoice) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Receipt className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">Invoice belum tersedia</p>
          <p className="text-xs text-muted-foreground mt-1">Hubungi admin untuk informasi tagihan.</p>
        </CardContent>
      </Card>
    );
  }

  const statusConfig: Record<string, { label: string; class: string }> = {
    DRAFT: { label: "Draft", class: "bg-gray-100 text-gray-700" },
    ISSUED: { label: "Issued", class: "bg-blue-100 text-blue-700" },
    PAID: { label: "Lunas", class: "bg-green-100 text-green-700" },
    CANCELLED: { label: "Cancelled", class: "bg-red-100 text-red-700" },
  };
  const statusCfg = statusConfig[latestInvoice.status] || { label: latestInvoice.status, class: "bg-gray-100 text-gray-700" };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{latestInvoice.invoiceNumber}</CardTitle>
            <p className="text-sm text-muted-foreground">Diterbitkan: {formatDate(latestInvoice.issuedAt)}</p>
          </div>
          <Badge className={statusCfg.class}>{statusCfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Project Info */}
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground mb-1">Project</p>
          <p className="text-sm font-medium">{project.service.name}</p>
          <p className="text-xs text-muted-foreground">{project.projectNumber} — {project.clientName}</p>
        </div>

        {/* Price Summary */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Tagihan</span>
            <span className="font-medium">{formatCurrency(latestInvoice.total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Yang Sudah Dibayar</span>
            <span className="text-green-600 font-medium">{formatCurrency(project.paidAmount)}</span>
          </div>
          {project.agreedPrice - project.paidAmount > 0 && (
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-muted-foreground">Sisa Bayar</span>
              <span className="text-destructive font-semibold">
                {formatCurrency(project.agreedPrice - project.paidAmount)}
              </span>
            </div>
          )}
        </div>

        {/* Note */}
        <p className="text-xs text-muted-foreground text-center">
          Pembayaran dapat dilakukan melalui transfer ke rekening yang tertera pada invoice resmi yang dikirimkan oleh admin.
        </p>
      </CardContent>
    </Card>
  );
}

type PaymentTabProject = NonNullable<ClientLink["project"]>;
type PaymentStatusMap = Record<string, { label: string; class: string }>;

function PaymentTab({
  project,
  formatCurrency,
  paymentStatusMap,
}: {
  project: PaymentTabProject;
  formatCurrency: (n: number) => string;
  paymentStatusMap: PaymentStatusMap;
}) {
  const statusCfg = paymentStatusMap[project.paymentStatus] || paymentStatusMap.UNPAID;
  const remaining = project.agreedPrice - project.paidAmount;

  return (
    <div className="space-y-4">
      {/* Payment Status Card */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Status Pembayaran
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge className={statusCfg.class}>{statusCfg.label}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Harga</span>
              <span className="font-medium">{formatCurrency(project.agreedPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sudah Dibayar</span>
              <span className="text-green-600 font-medium">-{formatCurrency(project.paidAmount)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Sisa</span>
              <span className={remaining > 0 ? "text-destructive font-semibold" : "text-green-600 font-semibold"}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Progress Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Progress Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(project.paidAmount)} dibayar</span>
            <span>{formatCurrency(project.agreedPrice)}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, (project.paidAmount / project.agreedPrice) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {Math.round((project.paidAmount / project.agreedPrice) * 100)}% lunas
          </p>
        </CardContent>
      </Card>

      {/* Payment Guide */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cara Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Silakan lakukan pembayaran sesuai sisa tagihan ke rekening yang tertera pada invoice resmi.</p>
          <p>Setelah melakukan pembayaran, informasikan ke admin melalui WhatsApp untuk konfirmasi pelunasan.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClientTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [link, setLink] = useState<ClientLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingBrief, setIsSubmittingBrief] = useState(false);

  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [revisionDescription, setRevisionDescription] = useState("");
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [approveFinalOpen, setApproveFinalOpen] = useState(false);
  const [approvingFinal, setApprovingFinal] = useState(false);
  const [briefTab, setBriefTab] = useState<"brief" | "invoice" | "payment">("brief");

  const fetchLink = async () => {
    try {
      const res = await fetch(`/api/client-links/${token}`);
      if (!res.ok) {
        if (res.status === 410) {
          setError("Link sudah expired atau sudah digunakan");
        } else {
          setError("Link tidak ditemukan");
        }
        return;
      }
      const data = await res.json();
      setLink(data.link);
      setError(null);
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern in codebase */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { fetchLink(); }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const handleSubmitBrief = async (responses: BriefResponses, attachmentIds: string[]) => {
    setIsSubmittingBrief(true);
    try {
      const res = await fetch(`/api/client-links/${token}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, attachmentIds }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal submit brief", "error");
      }
    } catch {
      toast("Terjadi kesalahan", "error");
    } finally {
      setIsSubmittingBrief(false);
    }
  };

  const handleSubmitRevision = async () => {
    if (!revisionDescription.trim()) {
      toast("Mohon isi deskripsi revisi", "error");
      return;
    }
    setIsSubmittingRevision(true);
    try {
      // 1. Upload reference images first
      const attachmentIds: string[] = [];
      for (const file of revisionFiles) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);
        uploadFormData.append("projectId", link!.project!.id);
        uploadFormData.append("category", "revision");
        const res = await fetch(`/api/client-links/${token}/upload`, {
          method: "POST",
          body: uploadFormData,
        });
        if (res.ok) {
          const data = await res.json();
          attachmentIds.push(data.attachmentId);
        }
      }

      // 2. Submit revision with attachmentIds
      const formData = new FormData();
      formData.append("description", revisionDescription);
      attachmentIds.forEach((id) => formData.append("attachmentIds", id));

      const res = await fetch(`/api/client-links/${token}/revisions`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast("Revisi berhasil disubmit!");
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
    }
  };

  const handleApproveFinal = async () => {
    setApprovingFinal(true);
    try {
      const res = await fetch(`/api/client-links/${token}/approve-final`, {
        method: "POST",
      });
      if (res.ok) {
        toast("Project selesai. Terima kasih!", "success");
        setApproveFinalOpen(false);
        fetchLink();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal approve final work", "error");
      }
    } catch {
      toast("Terjadi kesalahan", "error");
    } finally {
      setApprovingFinal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
            <h1 className="text-xl font-semibold mb-2">Link Tidak Valid</h1>
            <p className="text-muted-foreground">{error || "Link tidak ditemukan"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const project = link.project;
  const hasBrief = !!project?.brief;
  const revisions = project?.revisions || [];
  const remainingQuota = Math.max(0, MAX_REVISION_QUOTA - revisions.length);
  const isQuotaExhausted = remainingQuota === 0;
  const latestInvoice = project?.invoices?.[0];
  const projectStatus = project ? (statusMap[project.status] || statusMap.DRAFT) : null;
  const paymentStatus = project ? (paymentStatusMap[project.paymentStatus] || paymentStatusMap.UNPAID) : null;

  // If brief not yet submitted, show brief form
  if (!hasBrief && project) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">YukDesain Studio</h1>
            <p className="text-muted-foreground">Form Brief Project</p>
          </div>
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{project.service.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{project.projectNumber}</p>
                </div>
                <Badge variant="secondary">Brief Required</Badge>
              </div>
            </CardHeader>
          </Card>
          <ServiceBriefForm
            projectId={project.id}
            clientToken={token}
            serviceCode={project.service.code}
            serviceName={project.service.name}
            onSubmit={handleSubmitBrief}
            isSubmitting={isSubmittingBrief}
          />
        </div>
      </div>
    );
  }

  // Tracking View (after brief submitted)
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">YukDesain Studio</h1>
          <p className="text-muted-foreground">Tracking Project</p>
        </div>

        {/* Project Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{link.project?.service.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{link.project?.projectNumber}</p>
              </div>
              {projectStatus && (
                <Badge className={projectStatus.class}>
                  {projectStatus.label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Deadline</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {project?.deadline ? formatDate(project.deadline) : "-"}
                  </p>
                </div>
              </div>
              {project?.assignments?.[0] && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Designer</p>
                  <p className="text-sm font-medium">{project.assignments[0].designer.name}</p>
                </div>
              )}
            </div>

            {/* Payment Summary */}
            {paymentStatus && (
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Status Pembayaran</p>
                <div className="flex items-center justify-between">
                  <Badge className={paymentStatus.class}>{paymentStatus.label}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {project ? `${formatCurrency(project.paidAmount)} / ${formatCurrency(project.agreedPrice)}` : ""}
                  </span>
                </div>
              </div>
            )}

            {/* Revision Quota */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Sisa Revisi</p>
                <p className="text-sm font-medium">{remainingQuota}x / {MAX_REVISION_QUOTA}x</p>
              </div>
              {latestInvoice && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Tagihan</p>
                  <p className="text-sm font-semibold">{formatCurrency(latestInvoice.total)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-4 border-b">
          <button
            onClick={() => setBriefTab("brief")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              briefTab === "brief"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-4 w-4" />
            Brief Saya
          </button>
          <button
            onClick={() => setBriefTab("invoice")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              briefTab === "invoice"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Receipt className="h-4 w-4" />
            Invoice
          </button>
          <button
            onClick={() => setBriefTab("payment")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              briefTab === "payment"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <CreditCard className="h-4 w-4" />
            Pembayaran
          </button>
        </div>

        {/* Tab Content */}
        {briefTab === "brief" && project?.brief && (
          <BriefTab project={project} />
        )}
        {briefTab === "brief" && !project?.brief && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Brief belum disubmit.</CardContent></Card>
        )}
        {briefTab === "invoice" && project && latestInvoice && (
          <InvoiceTab project={project} latestInvoice={latestInvoice} formatDate={formatDate} formatCurrency={formatCurrency} />
        )}
        {briefTab === "invoice" && project && !latestInvoice && (
          <Card><CardContent className="py-8 text-center text-muted-foreground"><Receipt className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />Invoice belum tersedia.</CardContent></Card>
        )}
        {briefTab === "payment" && project && (
          <PaymentTab project={project} formatCurrency={formatCurrency} paymentStatusMap={paymentStatusMap} />
        )}

        {/* Timeline is always visible below tabs */}
        <Card className="mt-6 mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Timeline Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const events = buildTimeline(project!);
              return events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Belum ada aktivitas
                </p>
              ) : (
                <div>
                  {events.map((event, idx) => (
                    <TimelineItem key={event.id} event={event} isLast={idx === events.length - 1} />
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Spacing before action buttons */}
        <div className="mt-6" />

        {/* Final Approval Status / Actions */}
        {project?.finalApprovedAt ? (
          <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-200">Project Selesai</p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Final work approved on {formatDate(project.finalApprovedAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : project?.finalSubmittedAt ? (
          <>
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 mb-4">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-800 dark:text-blue-200">Final Work Submitted</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Designer telah submit final work. Review dan approve jika sudah sesuai.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setApproveFinalOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve Final Work
            </Button>

            {approveFinalOpen && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Konfirmasi Approval</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      Dengan menekan &quot;Ya, Approve&quot;, project ini akan ditandai sebagai SELESAI. Pastikan kamu sudah puas dengan hasil akhir. Jika ada revisi, gunakan tombol Request Revision di atas.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setApproveFinalOpen(false)}>Batal</Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleApproveFinal}
                      disabled={approvingFinal}
                    >
                      {approvingFinal ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        "Ya, Approve"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        {/* Revision Button */}
        {isQuotaExhausted ? (
          <Button className="w-full" disabled>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Kuota Revisi Habis
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => setIsRevisionOpen(true)}
          >
            Request Revision ({remainingQuota}x tersisa)
          </Button>
        )}

        {isRevisionOpen && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Request Revision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Mohon diisi revisi sebaik mungkin karena akan terhitung 1x jika kamu hanya input tidak lengkap
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="revision" className="text-sm font-medium">
                  Deskripsi Revision
                </label>
                <textarea
                  id="revision"
                  className="w-full min-h-30 p-3 border rounded-lg text-base resize-none bg-background"
                  placeholder="Jelaskan secara detail perubahan yang diinginkan..."
                  value={revisionDescription}
                  onChange={(e) => setRevisionDescription(e.target.value)}
                />
              </div>

              {/* Revision Reference Images (BRD 20.2) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Gambar Referensi (opsional)
                </label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="revision-files"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setRevisionFiles((prev) => [...prev, ...files]);
                    }}
                  />
                  <label htmlFor="revision-files" className="cursor-pointer">
                    <Paperclip className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Klik untuk upload gambar referensi revisi
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, GIF, WebP — maks 10MB per file
                    </p>
                  </label>
                </div>
                {revisionFiles.length > 0 && (
                  <div className="space-y-1">
                    {revisionFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({(file.size / 1024).toFixed(0)}KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline shrink-0 ml-2"
                          onClick={() => setRevisionFiles((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsRevisionOpen(false); setRevisionFiles([]); }}>Batal</Button>
                <Button onClick={handleSubmitRevision} disabled={isSubmittingRevision}>
                  {isSubmittingRevision ? "Mengirim..." : "Kirim Revision"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          YukDesain Studio Portal © 2026
        </p>
      </div>
    </div>
  );
}
