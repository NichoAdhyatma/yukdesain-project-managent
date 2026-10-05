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
} from "lucide-react";
import { ServiceBriefForm } from "@/components/forms/brief/ServiceBriefForm";
import type { BriefResponses } from "@/components/forms/brief/types";

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
        alert(data.error || "Gagal submit brief");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setIsSubmittingBrief(false);
    }
  };

  const handleSubmitRevision = async () => {
    if (!revisionDescription.trim()) {
      alert("Mohon isi deskripsi revisi");
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
        alert("Revisi berhasil disubmit!");
        setIsRevisionOpen(false);
        setRevisionDescription("");
        setRevisionFiles([]);
        fetchLink();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal submit revisi");
      }
    } catch {
      alert("Terjadi kesalahan");
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
        alert("🎉 Final work approved! Project selesai.");
        setApproveFinalOpen(false);
        fetchLink();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal approve final work");
      }
    } catch {
      alert("Terjadi kesalahan");
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
            {/* Status + Designer */}
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

            {/* Payment Status (BRD 19 - client sees invoice, payment state) */}
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

            {/* Invoice (BRD 19) */}
            {latestInvoice ? (
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Invoice</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{latestInvoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(latestInvoice.issuedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(latestInvoice.total)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border p-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Invoice belum tersedia</p>
              </div>
            )}

            {/* Revision Quota */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Sisa Revisi</p>
                <p className="font-medium">{remainingQuota}x / {MAX_REVISION_QUOTA}x</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unified Project Timeline */}
        <Card className="mb-6">
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
