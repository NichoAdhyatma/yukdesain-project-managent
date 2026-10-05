"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle } from "lucide-react";

type Service = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  outputFormat: string | null;
  isActive: boolean;
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", outputFormat: "" });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", outputFormat: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  const fetchServices = async () => {
    try {
      const res = await fetch("/api/services");
      const data = await res.json();
      if (data.services) {
        setServices(data.services);
      }
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchServices();
  }, []);

  const handleStartEdit = (service: Service) => {
    setEditingId(service.id);
    setEditForm({
      name: service.name,
      description: service.description || "",
      outputFormat: service.outputFormat || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/services/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, description: editForm.description, outputFormat: editForm.outputFormat }),
      });
      if (res.ok) {
        setServices((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? { ...s, name: editForm.name, description: editForm.description, outputFormat: editForm.outputFormat }
              : s
          )
        );
        setEditingId(null);
      } else {
        setAlertMessage("Gagal menyimpan perubahan.");
        setAlertOpen(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await fetch(`/api/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: !currentActive } : s))
      );
    } catch {
      setAlertMessage("Gagal memperbarui layanan.");
      setAlertOpen(true);
    }
  };

  const openDeleteConfirm = (id: string, name: string) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteService = async () => {
    if (!deleteTargetId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/services/${deleteTargetId}`, { method: "DELETE" });
      if (res.ok) {
        setServices((prev) => prev.filter((s) => s.id !== deleteTargetId));
        setDeleteConfirmOpen(false);
      } else {
        setAlertMessage("Gagal menghapus layanan.");
        setAlertOpen(true);
      }
    } catch {
      setAlertMessage("Gagal menghapus layanan.");
      setAlertOpen(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateService = async () => {
    if (!newService.name) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newService),
      });
      if (res.ok) {
        const data = await res.json();
        setServices((prev) => [...prev, data.service]);
        setNewService({ name: "", description: "", outputFormat: "" });
        setIsCreateOpen(false);
      } else {
        setAlertMessage("Gagal membuat layanan.");
        setAlertOpen(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Services</h1>
            <p className="text-muted-foreground">
              Kelola katalog layanan desain
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger render={<Button><Plus className="w-4 h-4 mr-2" />Layanan Baru</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Layanan Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newName">Nama Layanan</Label>
                  <Input
                    id="newName"
                    value={newService.name}
                    onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Contoh: Logo Minimalis"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newDesc">Deskripsi</Label>
                  <Input
                    id="newDesc"
                    value={newService.description}
                    onChange={(e) => setNewService((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Deskripsi layanan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newFormat">Format Output</Label>
                  <Input
                    id="newFormat"
                    value={newService.outputFormat}
                    onChange={(e) => setNewService((p) => ({ ...p, outputFormat: e.target.value }))}
                    placeholder="Contoh: AI, PNG, SVG"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                  <Button onClick={handleCreateService} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Simpan
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Services Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.id} className={!service.isActive ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="mb-2">{service.code}</Badge>
                    {editingId === service.id ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        className="font-semibold"
                      />
                    ) : (
                      <CardTitle className="text-lg">{service.name}</CardTitle>
                    )}
                  </div>
                  <Badge variant={service.isActive ? "default" : "secondary"}>
                    {service.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {editingId === service.id ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Deskripsi</Label>
                      <Input
                        value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Format Output</Label>
                      <Input
                        value={editForm.outputFormat}
                        onChange={(e) => setEditForm((p) => ({ ...p, outputFormat: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="h-4 w-4 mr-1" /> Batal
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Simpan
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <CardDescription className="line-clamp-2">
                      {service.description || "Tidak ada deskripsi"}
                    </CardDescription>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Output:</span> {service.outputFormat || "-"}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="ghost" onClick={() => handleStartEdit(service)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleActive(service.id, service.isActive)}
                      >
                        {service.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteConfirm(service.id, service.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Hapus
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Layanan
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Yakin ingin menghapus layanan <strong>&quot;{deleteTargetName}&quot;</strong>? Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteService} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Hapus
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
