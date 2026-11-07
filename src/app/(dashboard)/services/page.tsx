"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EMPTY_SERVICE_FORM, ServiceForm, type ServiceFormValues } from "@/components/services/ServiceForm";
import { SERVICE_BOT_LIMITS } from "@/lib/constants";
import { formatRupiah } from "@/lib/whatsapp/format";
import { Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle } from "lucide-react";

type Service = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  outputFormat: string | null;
  isActive: boolean;
  startingPrice: number | null;
  priceNote: string | null;
  suitableFor: string | null;
  botNotes: string | null;
};

/** Error dari API dengan pesan per field (validasi kolom bot). */
class ServiceSaveError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string>,
  ) {
    super(message);
  }
}

function toPayload(values: ServiceFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    outputFormat: values.outputFormat.trim(),
    startingPrice: values.startingPrice,
    priceNote: values.priceNote,
    suitableFor: values.suitableFor,
    botNotes: values.botNotes,
  };
}

function toFormValues(service: Service): ServiceFormValues {
  return {
    name: service.name,
    description: service.description ?? "",
    outputFormat: service.outputFormat ?? "",
    startingPrice: service.startingPrice,
    priceNote: service.priceNote ?? "",
    suitableFor: service.suitableFor ?? "",
    botNotes: service.botNotes ?? "",
  };
}

export default function ServicesPage() {
  const queryClient = useQueryClient();
  // null = dialog tertutup; id null = layanan baru
  const [formTarget, setFormTarget] = useState<{ id: string | null } | null>(null);
  const [formValues, setFormValues] = useState<ServiceFormValues>(EMPTY_SERVICE_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["services"],
    staleTime: Infinity,
    queryFn: async () => {
      // no-store: GET /api/services di-cache browser 1 jam; setelah menyimpan, daftar harus langsung terbaru.
      const res = await fetch("/api/services", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat layanan.");
      const data = await res.json();
      return data.services as Service[];
    },
  });

  const services = data ?? [];

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: ServiceFormValues }) => {
      const res = await fetch(id ? `/api/services/${id}` : "/api/services", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(toPayload(values)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ServiceSaveError(body.error || "Gagal menyimpan layanan.", body.fields ?? {});
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setFormTarget(null);
    },
    onError: (err: Error) => {
      if (err instanceof ServiceSaveError && Object.keys(err.fields).length > 0) {
        setFormErrors(err.fields);
        return;
      }
      setAlertMessage(err.message || "Gagal menyimpan layanan.");
      setAlertOpen(true);
    },
  });

  const openForm = (service: Service | null) => {
    setFormValues(service ? toFormValues(service) : EMPTY_SERVICE_FORM);
    setFormErrors({});
    setFormTarget({ id: service?.id ?? null });
  };

  const tooLong =
    formValues.priceNote.length > SERVICE_BOT_LIMITS.priceNoteMaxChars ||
    formValues.suitableFor.length > SERVICE_BOT_LIMITS.suitableForMaxChars ||
    formValues.botNotes.length > SERVICE_BOT_LIMITS.botNotesMaxChars;

  const handleSave = () => {
    if (!formTarget || !formValues.name.trim()) {
      setFormErrors({ name: "Nama layanan wajib diisi" });
      return;
    }
    setFormErrors({});
    saveMutation.mutate({ id: formTarget.id, values: formValues });
  };

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/services/${id}`, {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Gagal memperbarui layanan.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: () => {
      setAlertMessage("Gagal memperbarui layanan.");
      setAlertOpen(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menghapus layanan.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setDeleteConfirmOpen(false);
    },
    onError: (err: Error) => {
      setAlertMessage(err.message || "Gagal menghapus layanan.");
      setAlertOpen(true);
    },
  });

  const handleToggleActive = (id: string, currentActive: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentActive });
  };

  const openDeleteConfirm = (id: string, name: string) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteService = () => {
    if (!deleteTargetId) return;
    deleteMutation.mutate(deleteTargetId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Memuat layanan">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 p-4 md:p-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Services</h1>
            <p className="text-muted-foreground">Kelola katalog layanan desain dan yang dibaca bot WhatsApp</p>
          </div>
          <Button onClick={() => openForm(null)} className="max-md:h-11">
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            Layanan Baru
          </Button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">Daftar layanan gagal dimuat.</p>
            <Button variant="outline" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">Belum ada layanan. Tambahkan layanan pertama supaya bisa dipesan klien.</p>
            <Button onClick={() => openForm(null)}>
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              Layanan Baru
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Card key={service.id} className={!service.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge variant="outline" className="mb-2">
                        {service.code}
                      </Badge>
                      <CardTitle className="text-lg">{service.name}</CardTitle>
                    </div>
                    <Badge variant={service.isActive ? "default" : "secondary"}>{service.isActive ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="line-clamp-2">{service.description || "Tidak ada deskripsi"}</CardDescription>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Output:</span> {service.outputFormat || "-"}
                  </div>
                  <div className="text-sm">
                    {service.startingPrice ? (
                      <p>
                        <span className="font-medium tabular-nums">Mulai {formatRupiah(service.startingPrice)}</span>
                        {service.priceNote && <span className="text-muted-foreground"> · {service.priceNote}</span>}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">Harga mulai belum diisi</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="ghost" className="max-md:h-11" onClick={() => openForm(service)}>
                      <Pencil className="h-4 w-4 mr-1" aria-hidden="true" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="max-md:h-11"
                      onClick={() => handleToggleActive(service.id, service.isActive)}
                    >
                      {service.isActive ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive max-md:h-11"
                      onClick={() => openDeleteConfirm(service.id, service.name)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" /> Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form tambah / edit */}
      <Dialog open={formTarget !== null} onOpenChange={(open) => !open && setFormTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formTarget?.id ? "Edit Layanan" : "Tambah Layanan Baru"}</DialogTitle>
          </DialogHeader>
          <ServiceForm idPrefix="service" values={formValues} onChange={setFormValues} errors={formErrors} />
          {formErrors.name && (
            <p role="alert" className="text-sm text-destructive">
              {formErrors.name}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormTarget(null)}>
              <X className="h-4 w-4 mr-1" aria-hidden="true" /> Batal
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || tooLong}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="destructive" onClick={handleDeleteService} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
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
