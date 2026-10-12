"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Briefcase,
  User,
  Mail,
  Loader2,
  Pencil,
  Key,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  Trash2,
} from "lucide-react";

type Designer = {
  id: string;
  name: string;
  email: string;
  classification: "FULL_TIME" | "FREELANCER";
  isActive: boolean;
  createdAt: string;
};

const typeConfig: Record<string, { label: string; variant: "default" | "secondary" }> = {
  FULL_TIME: { label: "Full Time", variant: "default" },
  FREELANCER: { label: "Freelancer", variant: "secondary" },
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" }> = {
  true: { label: "Aktif", variant: "default" },
  false: { label: "Nonaktif", variant: "secondary" },
};

export default function DesignersPage() {
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDesigner, setNewDesigner] = useState({
    name: "",
    email: "",
    classification: "FULL_TIME" as "FULL_TIME" | "FREELANCER",
  });

  // Generated password after create
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Edit designer
  const [editingDesigner, setEditingDesigner] = useState<Designer | null>(null);
  const [editName, setEditName] = useState("");
  const [editClassification, setEditClassification] = useState<"FULL_TIME" | "FREELANCER">("FULL_TIME");

  // Change password
  const [changePasswordDesigner, setChangePasswordDesigner] = useState<Designer | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState("");

  // Delete designer
  const [deletingDesigner, setDeletingDesigner] = useState<Designer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Error/success dialog
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  useEffect(() => {
    loadDesigners();
  }, []);

  async function loadDesigners() {
    try {
      const res = await fetch("/api/designers");
      const data = await res.json();
      if (data.designers) setDesigners(data.designers);
    } catch (e) {
      console.error("Failed to load designers:", e);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateDesigner = async () => {
    if (!newDesigner.name || !newDesigner.email) return;
    setSaving(true);
    try {
      const res = await fetch("/api/designers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDesigner),
      });
      const data = await res.json();
      if (res.ok) {
        setNewDesigner({ name: "", email: "", classification: "FULL_TIME" });
        setGeneratedPassword(data.rawPassword || "");
        setIsCreateOpen(false);
        loadDesigners();
      } else {
        setAlertMessage(data.error || "Gagal membuat designer");
        setAlertOpen(true);
      }
    } catch (e) {
      console.error("Failed:", e);
      setAlertMessage("Terjadi kesalahan");
      setAlertOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const filteredDesigners = designers.filter((designer) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      designer.name.toLowerCase().includes(query) ||
      designer.email.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" || designer.classification === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeDesigners = designers.filter((d) => d.isActive);
  const fullTimeCount = activeDesigners.filter((d) => d.classification === "FULL_TIME").length;
  const freelancerCount = activeDesigners.filter((d) => d.classification === "FREELANCER").length;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Designers</h1>
            <p className="text-muted-foreground">Kelola designer dan freelancer</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger>
              <Button><Plus className="w-4 h-4 mr-2" />Designer Baru</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Designer Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama</Label>
                  <Input
                    id="name"
                    value={newDesigner.name}
                    onChange={(e) => setNewDesigner((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nama lengkap"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newDesigner.email}
                    onChange={(e) => setNewDesigner((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Tipe</Label>
                  <Select
                    value={newDesigner.classification}
                    options={[
                      { value: "FULL_TIME", label: "Full Time" },
                      { value: "FREELANCER", label: "Freelancer" },
                    ]}
                    onValueChange={(v) => v && setNewDesigner((p) => ({ ...p, classification: v as "FULL_TIME" | "FREELANCER" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full Time</SelectItem>
                      <SelectItem value="FREELANCER">Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                  <Button onClick={handleCreateDesigner} disabled={saving || !newDesigner.name || !newDesigner.email}>
                    {saving ? "Menyimpan..." : "Simpan"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari designer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={typeFilter}
            options={[
              { value: "all", label: "Semua Tipe" },
              { value: "FULL_TIME", label: "Full Time" },
              { value: "FREELANCER", label: "Freelancer" },
            ]}
            onValueChange={(v) => v && setTypeFilter(v)}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="FULL_TIME">Full Time</SelectItem>
              <SelectItem value="FREELANCER">Freelancer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 pb-0">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Designer</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{designers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Full Time</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fullTimeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Freelancer</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{freelancerCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aktif</CardTitle>
              <User className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeDesigners.length}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Designer</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terdaftar</TableHead>
                  <TableHead className="w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDesigners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Tidak ada designer yang ditemukan
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDesigners.map((designer) => {
                    const type = typeConfig[designer.classification];
                    const status = statusConfig[String(designer.isActive)];
                    return (
                      <TableRow key={designer.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-xs">
                                {getInitials(designer.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{designer.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {designer.email || "-"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={type.variant}>{type.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(designer.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingDesigner(designer);
                                setEditName(designer.name);
                                setEditClassification(designer.classification);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setChangePasswordDesigner(designer);
                                setNewPassword("");
                                setChangePasswordError("");
                              }}
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingDesigner(designer)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Generated Password Dialog */}
      <Dialog open={!!generatedPassword} onOpenChange={(v) => !v && setGeneratedPassword("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Designer Berhasil Dibuat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Password untuk akun designer telah di-generate otomatis. Simpan password ini sekarang — tidak bisa diambil lagi.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={generatedPassword}
                readOnly
                className="font-mono text-sm"
                type={showPassword ? "text" : "password"}
              />
              <Button variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigator.clipboard.writeText(generatedPassword)}
                aria-label="Salin password"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setGeneratedPassword("")}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Designer Dialog */}
      <Dialog open={!!editingDesigner} onOpenChange={(v) => !v && setEditingDesigner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Designer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipe</Label>
              <Select
                value={editClassification}
                onValueChange={(v) => v && setEditClassification(v as "FULL_TIME" | "FREELANCER")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_TIME">Full Time</SelectItem>
                  <SelectItem value="FREELANCER">Freelancer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDesigner(null)}>Batal</Button>
            <Button
              onClick={async () => {
                if (!editingDesigner) return;
                setSaving(true);
                try {
                  const res = await fetch(`/api/designers/${editingDesigner.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: editName, classification: editClassification }),
                  });
                  if (res.ok) {
                    setEditingDesigner(null);
                    loadDesigners();
                  } else {
                    const d = await res.json();
                    setAlertMessage(d.error || "Gagal update");
                    setAlertOpen(true);
                  }
                } catch {
                  setAlertMessage("Terjadi kesalahan");
                  setAlertOpen(true);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || !editName}
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!changePasswordDesigner} onOpenChange={(v) => !v && setChangePasswordDesigner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Password — {changePasswordDesigner?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {changePasswordError && (
              <p className="text-sm text-destructive">{changePasswordError}</p>
            )}
            <div className="space-y-2">
              <Label>Password Baru</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordDesigner(null)}>Batal</Button>
            <Button
              onClick={async () => {
                if (!changePasswordDesigner) return;
                if (newPassword.length < 8) {
                  setChangePasswordError("Password minimal 8 karakter");
                  return;
                }
                setChangePasswordSaving(true);
                setChangePasswordError("");
                try {
                  const res = await fetch(`/api/designers/${changePasswordDesigner.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newPassword }),
                  });
                  if (res.ok) {
                    setChangePasswordDesigner(null);
                    setNewPassword("");
                    setAlertMessage("Password berhasil diubah");
                    setAlertOpen(true);
                  } else {
                    const d = await res.json();
                    setChangePasswordError(d.error || "Gagal ubah password");
                  }
                } catch {
                  setChangePasswordError("Terjadi kesalahan");
                } finally {
                  setChangePasswordSaving(false);
                }
              }}
              disabled={changePasswordSaving || newPassword.length < 8}
            >
              {changePasswordSaving ? "Menyimpan..." : "Ubah Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Designer Dialog */}
      <Dialog open={!!deletingDesigner} onOpenChange={(v) => !v && setDeletingDesigner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Designer
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Yakin ingin menghapus designer <strong>&quot;{deletingDesigner?.name}&quot;</strong>?
            Semua data designer ini akan dihapus permanen dan tidak dapat dikembalikan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingDesigner(null)} disabled={deleting}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deletingDesigner) return;
                setDeleting(true);
                try {
                  const res = await fetch(`/api/designers/${deletingDesigner.id}`, { method: "DELETE" });
                  if (res.ok) {
                    setDeletingDesigner(null);
                    loadDesigners();
                  } else {
                    const d = await res.json();
                    setAlertMessage(d.error || "Gagal menghapus designer");
                    setAlertOpen(true);
                  }
                } catch {
                  setAlertMessage("Terjadi kesalahan");
                  setAlertOpen(true);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Error
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{alertMessage}</p>
          <DialogFooter>
            <Button onClick={() => setAlertOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
