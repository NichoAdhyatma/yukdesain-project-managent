"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link as LinkIcon, Check, Loader2, ExternalLink, Search, Plus, MessageCircle } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";

type Service = { id: string; code: string; name: string };
type ClientLink = { id: string; token: string; status: string; projectId: string };
type ProjectData = {
  id: string;
  projectNumber: string;
  clientName: string;
  agreedPrice: number;
  paidAmount: number;
  status: string;
  deadline: string;
  createdAt: string;
  service: { name: string } | null;
  brief: { id: string } | null;
  clientLinks: ClientLink[];
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  BELUM_DIKERJAKAN: { label: "Menunggu Brief", variant: "secondary" },
  SEDANG_DIKERJAKAN: { label: "Dikerjakan", variant: "default" },
  SELESAI: { label: "Selesai", variant: "outline" },
};


export default function FormLinkPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedClientName, setGeneratedClientName] = useState<string>("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    clientName: "",
    serviceId: "",
    agreedPrice: 0,
    paidAmount: 0,
    deadline: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [servicesRes, projectsRes] = await Promise.all([
        fetch("/api/services"),
        fetch("/api/form-links/projects"),
      ]);
      const servicesData = await servicesRes.json();
      const projectsData = await projectsRes.json();
      if (servicesData.services) setServices(servicesData.services);
      if (projectsData.projects) setProjects(projectsData.projects);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setGeneratedLink(null);

    try {
      const projectRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!projectRes.ok) {
        const data = await projectRes.json();
        alert(data.error || "Gagal membuat project");
        return;
      }

      const projectData = await projectRes.json();
      const projectId = projectData.project.id;

      const linkRes = await fetch("/api/client-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!linkRes.ok) {
        const data = await linkRes.json();
        alert(data.error || "Gagal generate link");
        return;
      }

      const linkData = await linkRes.json();
      const fullLink = `${window.location.origin}/client/${linkData.link.token}`;
      setGeneratedLink(fullLink);
      setGeneratedClientName(form.clientName);

      loadData();

    } catch (e) {
      console.error("Failed:", e);
      alert("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateLink(projectId: string, clientName: string) {
    try {
      const res = await fetch("/api/client-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Gagal generate link");
        return;
      }

      const data = await res.json();
      const fullLink = `${window.location.origin}/client/${data.link.token}`;
      setGeneratedLink(fullLink);
      setGeneratedClientName(clientName);

      loadData();
    } catch (e) {
      console.error("Failed:", e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredProjects = projects
    .filter((p) =>
      p.projectNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // DRAFT projects first (newly created, awaiting brief)
      if (a.status === "DRAFT" && b.status !== "DRAFT") return -1;
      if (a.status !== "DRAFT" && b.status === "DRAFT") return 1;
      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-semibold">Form Link</h1>
          <p className="text-muted-foreground text-sm">Buat project baru dan generate link untuk client</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Create Form */}
        <Card>
          <CardHeader>
            <CardTitle>Buat Project Baru</CardTitle>
            <CardDescription>Isi form di bawah untuk membuat project dan generate link brief</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Nama Client</Label>
                  <Input id="clientName" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Nama client / usaha" required />
                </div>
                <div className="space-y-2">
                  <Label>Layanan</Label>
                  <Select
                    value={form.serviceId}
                    options={services.map(s => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
                    onValueChange={(v) => { if (v) setForm((f) => ({ ...f, serviceId: v })); }}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pilih layanan" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agreedPrice">Harga Total</Label>
                  <CurrencyInput
                    id="agreedPrice"
                    value={form.agreedPrice}
                    onChange={(v) => setForm((f) => ({ ...f, agreedPrice: v }))}
                    placeholder="Rp 0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paidAmount">DP</Label>
                  <CurrencyInput
                    id="paidAmount"
                    value={form.paidAmount}
                    onChange={(v) => setForm((f) => ({ ...f, paidAmount: v }))}
                    placeholder="Rp 0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} required />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Membuat...</> : <><LinkIcon className="h-4 w-4 mr-2" />Buat Project & Generate Link</>}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Generated Link */}
        {generatedLink && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="h-5 w-5" />Link Berhasil Dibuat!
              </CardTitle>
              {generatedClientName && (
                <CardDescription className="text-green-600 dark:text-green-400 font-medium">
                  Untuk: {generatedClientName}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    const waUrl = `https://wa.me/?text=Halo%20${encodeURIComponent(generatedClientName)}!%20Berikut%20link%20brief%20untuk%20project%20Anda:%20${encodeURIComponent(generatedLink)}`;
                    window.open(waUrl, "_blank");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Kirimkan link ini ke client via WhatsApp.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => window.open(generatedLink, "_blank")}><ExternalLink className="h-4 w-4 mr-2" />Buka Link</Button>
                <Button variant="secondary" className="flex-1" onClick={() => { setGeneratedLink(null); setGeneratedClientName(""); setForm({ clientName: "", serviceId: "", agreedPrice: 0, paidAmount: 0, deadline: "" }); }}>Buat Lagi</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recap Table with Links */}
        <Card>
          <CardHeader>
            <CardTitle>
              Recap All Projects ({filteredProjects.length})
              <span className="text-sm font-normal text-muted-foreground ml-2">
                — includes DRAFT (awaiting brief)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari project..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Brief</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada project</TableCell></TableRow>
                ) : (
                  filteredProjects.map((p) => {
                    const st = statusMap[p.status] || statusMap.DRAFT;
                    const activeLink = p.clientLinks?.find((l) => l.status === "ACTIVE");
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.projectNumber}</TableCell>
                        <TableCell>{p.clientName}</TableCell>
                        <TableCell>
                          {p.brief ? (
                            <Badge variant="default" className="text-xs">Submitted</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {activeLink ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="default" className="font-mono text-xs">{activeLink.token.slice(0, 8)}...</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => window.open(`${window.location.origin}/client/${activeLink.token}`, "_blank")}
                                aria-label="Buka link brief"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label="Bagikan via WhatsApp"
                                onClick={() => {
                                  const link = `${window.location.origin}/client/${activeLink.token}`;
                                  const waUrl = `https://wa.me/?text=Halo%20${encodeURIComponent(p.clientName)}!%20Berikut%20link%20brief%20untuk%20project%20Anda:%20${encodeURIComponent(link)}`;
                                  window.open(waUrl, "_blank");
                                }}
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerateLink(p.id, p.clientName)}>
                              <Plus className="h-3 w-3 mr-1" /> Generate
                            </Button>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(p.agreedPrice)}</TableCell>
                        <TableCell>{formatDate(p.deadline)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
