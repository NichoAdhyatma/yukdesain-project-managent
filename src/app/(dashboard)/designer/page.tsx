"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProgressUploader, type UploadedFile } from "@/components/ui/progress-uploader";
import { BriefReader } from "@/components/forms/brief/BriefReader";
import { Search, Loader2, Plus, Clock, FileText, TrendingUp, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import type { ProjectStatus } from "@/types";

type BriefResponse = { questionId: string; question: string; answer: string };

type ProjectUpdate = {
  id: string;
  description: string;
  progress: number | null;
  author: { name: string };
  createdAt: string;
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    storageKey: string;
  } | null;
};

type Project = {
  id: string;
  projectNumber: string;
  clientName: string;
  status: ProjectStatus;
  priority: string;
  deadline: string | null;
  agreedPrice: number;
  service: { code: string; name: string };
  brief: { id: string; responses: BriefResponse[] } | null;
  finalSubmittedAt?: string;
  finalApprovedAt?: string;
  assignments: Array<{ designer: { id: string; name: string } }>;
  updates: ProjectUpdate[];
  revisions: Array<{
    id: string;
    number: number;
    status: string;
    description: string;
    requestedAt: string;
  }>;
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  BELUM_DIKERJAKAN: { label: "Menunggu Brief", variant: "secondary" },
  SEDANG_DIKERJAKAN: { label: "Dikerjakan", variant: "default" },
  SELESAI: { label: "Selesai", variant: "outline" },
};

const priorityConfig: Record<string, { label: string; class: string }> = {
  URGENT: { label: "Urgent", class: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  HIGH: { label: "Tinggi", class: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  NORMAL: { label: "Normal", class: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  LOW: { label: "Rendah", class: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function DesignerWorkspacePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateDesc, setUpdateDesc] = useState("");
  const [updateProgress, setUpdateProgress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitFinalOpen, setSubmitFinalOpen] = useState(false);
  const [submitFinalDesc, setSubmitFinalDesc] = useState("");
  const [submitFinalFiles, setSubmitFinalFiles] = useState<UploadedFile[]>([]);
  const [submittingFinal, setSubmittingFinal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch("/api/designer/projects");
      const data = await res.json();
      if (data.projects) setProjects(data.projects);
    } catch (e) {
      console.error("Failed to load projects:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(projectId: string, newStatus: ProjectStatus) {
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadProjects();
        if (selectedProject?.id === projectId) {
          const updated = projects.find((p) => p.id === projectId);
          if (updated) setSelectedProject({ ...updated, status: newStatus });
        }
      }
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  }

  async function handlePostUpdate() {
    if (!selectedProject || !updateDesc.trim()) return;
    setSaving(true);
    try {
      const attachmentIds = uploadedFiles.map((f) => f.id);

      const res = await fetch(`/api/designer/projects/${selectedProject.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: updateDesc.trim(),
          progress: updateProgress ? parseInt(updateProgress) : null,
          attachmentIds,
        }),
      });
      if (res.ok) {
        setUpdateDialogOpen(false);
        setUpdateDesc("");
        setUpdateProgress("");
        setUploadedFiles([]);
        loadProjects();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal posting update");
      }
    } catch (e) {
      console.error("Failed:", e);
      alert("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitFinal() {
    if (!selectedProject || !submitFinalDesc.trim()) return;
    setSubmittingFinal(true);
    try {
      const res = await fetch(`/api/designer/projects/${selectedProject.id}/submit-final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: submitFinalDesc.trim(),
          attachmentIds: submitFinalFiles.map((f) => f.id),
        }),
      });
      if (res.ok) {
        setSubmitFinalOpen(false);
        setSubmitFinalDesc("");
        setSubmitFinalFiles([]);
        loadProjects();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal submit final");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setSubmittingFinal(false);
    }
  }

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.projectNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-semibold">Workspace</h1>
          <p className="text-muted-foreground text-sm">Project yang assigned ke kamu</p>
        </div>
        <Badge variant="secondary">{filteredProjects.length} project</Badge>
      </div>

      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari project..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select
          value={statusFilter}
          options={[
            { value: "all", label: "Semua Status" },
            { value: "BELUM_DIKERJAKAN", label: "Menunggu Brief" },
            { value: "SEDANG_DIKERJAKAN", label: "Dikerjakan" },
            { value: "SELESAI", label: "Selesai" },
          ]}
          onValueChange={(v) => { if (v) setStatusFilter(v); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="BELUM_DIKERJAKAN">Menunggu Brief</SelectItem>
            <SelectItem value="SEDANG_DIKERJAKAN">Dikerjakan</SelectItem>
            <SelectItem value="SELESAI">Selesai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Tidak ada project yang assigned</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => {
              const st = statusMap[project.status] || statusMap.DRAFT;
              const priority = priorityConfig[project.priority] || priorityConfig.NORMAL;
              const latestUpdate = project.updates?.[0];
              const pendingRevisions = project.revisions?.filter((r) => r.status === "PENDING") || [];

              return (
                <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedProject(project)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{project.projectNumber}</p>
                        <CardTitle className="text-base">{project.clientName}</CardTitle>
                        <p className="text-xs text-muted-foreground">{project.service.name}</p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${priority.class}`}>{priority.label}</Badge>
                      {project.deadline && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(project.deadline)}
                        </div>
                      )}
                    </div>

                    {latestUpdate && (
                      <div className="flex items-start gap-2 pt-2 border-t">
                        <TrendingUp className="h-3 w-3 text-green-600 mt-1 shrink-0" />
                        <div>
                          <p className="text-xs line-clamp-1">{latestUpdate.description}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {latestUpdate.progress !== null ? `${latestUpdate.progress}% · ` : ""}
                            {formatDate(latestUpdate.createdAt)}
                          </p>
                        </div>
                      </div>
                    )}

                    {pendingRevisions.length > 0 && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <AlertCircle className="h-3 w-3 text-yellow-600 shrink-0" />
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                          {pendingRevisions.length}x revisi pending
                        </p>
                      </div>
                    )}

                    {project.brief && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <FileText className="h-3 w-3 text-blue-600 shrink-0" />
                        <p className="text-xs text-muted-foreground">Brief tersedia</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProject.projectNumber} — {selectedProject.clientName}</DialogTitle>
                <p className="text-sm text-muted-foreground">{selectedProject.service.name}</p>
              </DialogHeader>

              <Tabs defaultValue="brief" className="w-full">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="brief">Brief</TabsTrigger>
                  <TabsTrigger value="progress">Progress</TabsTrigger>
                  <TabsTrigger value="revisions">Revisi</TabsTrigger>
                </TabsList>

                {/* Brief Tab */}
                <TabsContent value="brief" className="space-y-4">
                  {!selectedProject.brief ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Brief belum tersedia</p>
                    </div>
                  ) : (
                    <BriefReader
                      responses={selectedProject.brief.responses}
                      serviceCode={selectedProject.service.code}
                    />
                  )}
                </TabsContent>

                {/* Progress Tab */}
                <TabsContent value="progress" className="space-y-4">
                  {/* Status change */}
                  <div className="space-y-2">
                    <Label className="text-sm">Ubah Status</Label>
                    <div className="flex gap-2">
                      {(["BELUM_DIKERJAKAN", "SEDANG_DIKERJAKAN", "SELESAI"] as ProjectStatus[]).map((s) => {
                        const st = statusMap[s];
                        return (
                          <Button
                            key={s}
                            size="sm"
                            variant={selectedProject.status === s ? "default" : "outline"}
                            onClick={() => handleUpdateStatus(selectedProject.id, s)}
                          >
                            {st.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Post update */}
                  <div className="space-y-2">
                    <Label className="text-sm">Post Update</Label>
                    <Button size="sm" variant="outline" onClick={() => setUpdateDialogOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" /> Tambah Update
                    </Button>
                  </div>

                  {/* Submit Final */}
                  {!selectedProject.finalSubmittedAt && (
                    <div className="space-y-2">
                      <Label className="text-sm">Final Deliverable</Label>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSubmitFinalDesc("");
                          setSubmitFinalFiles([]);
                          setSubmitFinalOpen(true);
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Submit Final Work
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Kirim hasil akhir ke client untuk direview dan di-approve
                      </p>
                    </div>
                  )}

                  {selectedProject.finalSubmittedAt && !selectedProject.finalApprovedAt && (
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        ✅ Final Submitted
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Menunggu client approval
                      </p>
                    </div>
                  )}

                  {selectedProject.finalApprovedAt && (
                    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        🎉 Final Approved
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Project selesai. Approved {formatDate(selectedProject.finalApprovedAt)}
                      </p>
                    </div>
                  )}

                  {/* Update history */}
                  <div className="space-y-2">
                    <Label className="text-sm">Riwayat Update</Label>
                    {selectedProject.updates.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Belum ada update</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedProject.updates.map((update) => (
                          <div key={update.id} className="rounded-md border p-3">
                            {update.progress !== null && (
                              <div className="mb-2">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                  <span>Progress</span>
                                  <span>{update.progress}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${update.progress}%` }} />
                                </div>
                              </div>
                            )}
                            <p className="text-sm">{update.description}</p>
                            {update.attachment && (
                              <a
                                href={`${process.env.NEXT_PUBLIC_STORAGE_URL || ""}/${update.attachment.storageKey}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                              >
                                <Paperclip className="h-3 w-3" />
                                {update.attachment.filename}
                              </a>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {update.author.name} · {formatDate(update.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Revisions Tab */}
                <TabsContent value="revisions" className="space-y-4">
                  {selectedProject.revisions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Belum ada revisi</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedProject.revisions.map((rev) => (
                        <div key={rev.id} className="rounded-md border p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium">Revisi #{rev.number}</p>
                            <Badge variant={rev.status === "PENDING" ? "secondary" : rev.status === "APPROVED" ? "default" : "destructive"}>
                              {rev.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{rev.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(rev.requestedAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Post Update Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setUpdateDialogOpen(false);
        } else {
          setUpdateDesc("");
          setUpdateProgress("");
          setUploadedFiles([]);
          setUpdateDialogOpen(true);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Progress (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={updateProgress}
                onChange={(e) => setUpdateProgress(e.target.value)}
                placeholder="0-100"
              />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea
                value={updateDesc}
                onChange={(e) => setUpdateDesc(e.target.value)}
                placeholder="Update progress, deliverable, atau catatan..."
                rows={3}
              />
            </div>
            {selectedProject && (
              <ProgressUploader
                files={uploadedFiles}
                onChange={setUploadedFiles}
                maxFiles={5}
                label="Lampiran File"
                disabled={saving}
                uploadCategory="progress"
                projectId={selectedProject.id}
              />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>Batal</Button>
              <Button onClick={handlePostUpdate} disabled={saving || !updateDesc.trim()}>
                {saving ? "Menyimpan..." : "Post Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Submit Final Dialog */}
      <Dialog open={submitFinalOpen} onOpenChange={(open) => {
        if (!open) {
          setSubmitFinalOpen(false);
          setSubmitFinalDesc("");
          setSubmitFinalFiles([]);
        } else {
          setSubmitFinalDesc("");
          setSubmitFinalFiles([]);
          setSubmitFinalOpen(true);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Final Work</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Kirim hasil akhir project. Client akan menerima notifikasi dan bisa approve atau request revisi.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Setelah submit final, client akan bisa approve atau request revisi (kuota 3x). Pastikan hasil kerja sudah final sebelum submit.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Catatan Final</Label>
              <Textarea
                value={submitFinalDesc}
                onChange={(e) => setSubmitFinalDesc(e.target.value)}
                placeholder="Deskripsikan hasil akhir yang dikirimkan..."
                rows={4}
              />
            </div>
            {selectedProject && (
              <ProgressUploader
                files={submitFinalFiles}
                onChange={setSubmitFinalFiles}
                maxFiles={10}
                label="File Final Deliverables"
                disabled={submittingFinal}
                uploadCategory="final"
                projectId={selectedProject.id}
              />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSubmitFinalOpen(false)}>Batal</Button>
              <Button onClick={handleSubmitFinal} disabled={submittingFinal || !submitFinalDesc.trim()}>
                {submittingFinal ? "Mengirim..." : "Submit Final"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
