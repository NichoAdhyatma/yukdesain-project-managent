"use client";

import { useState, useEffect, useDeferredValue } from "react";
import Image from "next/image";
import { toast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Image as ImageIcon,
  File,
  Trash2,
  Search,
  RefreshCw,
  HardDrive,
  FileImage,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";

type StorageObject = {
  key: string;
  size: number;
  lastModified: string;
  category: string;
  filename: string;
};

type StorageStats = {
  totalSize: number;
  totalCount: number;
  byCategory: Record<string, { count: number; size: number }>;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORIES = [
  { value: "all", label: "Semua" },
  { value: "brief-reference", label: "Brief Reference" },
  { value: "progress", label: "Progress" },
  { value: "final", label: "Final" },
  { value: "revision", label: "Revision" },
  { value: "logo", label: "Logo" },
  { value: "other", label: "Lainnya" },
];

const MAX_FREE_GB = 10;

export default function MediaPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [items, setItems] = useState<StorageObject[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  /* eslint-disable react-hooks/set-state-in-effect */
  // This effect fetches data on mount and whenever filters/pagination/refreshKey change.
  // setLoading/setStats/setItems/setPagination are all necessary state updates for this pattern.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({
      page: pagination.page.toString(),
      limit: pagination.limit.toString(),
      ...(category !== "all" ? { category } : {}),
    });
    fetch(`/api/storage?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data.stats);
        setItems(data.items);
        setPagination((p) => ({ ...p, ...data.pagination }));
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Gagal memuat data storage";
        setLoadError(msg);
        toast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [pagination.page, pagination.limit, category, refreshKey]);

  useEffect(() => {
    setImageErrors(new Set());
  }, [items]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Hapus ${selected.size} file yang dipilih?`)) return;

    setDeleting(true);
    try {
      const keys = Array.from(selected).join(",");
      const res = await fetch(`/api/storage/delete?keys=${encodeURIComponent(keys)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast(`${selected.size} file berhasil dihapus`, "success");
      setSelected(new Set());
      setRefreshKey((k) => k + 1);
    } catch {
      toast("Gagal menghapus file", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSingle = async (key: string) => {
    if (!confirm("Hapus file ini?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/storage/delete?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast("File berhasil dihapus", "success");
      setRefreshKey((k) => k + 1);
    } catch {
      toast("Gagal menghapus file", "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.key)));
    }
  };

  const getPublicUrl = (key: string) => `https://assets.yukdesain.com/${key}`;

  const isImageFile = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext || "");
  };

  const usagePct = stats ? (stats.totalSize / (MAX_FREE_GB * 1024 * 1024 * 1024)) * 100 : 0;
  const usageColor =
    usagePct > 90 ? "text-red-500" : usagePct > 70 ? "text-amber-500" : "text-primary";

  const filteredItems = deferredSearch
    ? items.filter((i) => i.filename.toLowerCase().includes(deferredSearch.toLowerCase()))
    : items;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Media</h1>
          <p className="text-muted-foreground text-sm">Kelola file & storage R2</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Storage usage — identity accent: primary color bar at top */}
            <Card className="col-span-1 sm:col-span-2 overflow-hidden transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-primary/50 rounded-lg">
              <div className="h-1 w-full bg-primary" />
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Storage Used</span>
                </div>
                <p className={`text-2xl font-bold ${usageColor}`}>
                  {formatBytes(stats.totalSize)}
                </p>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-amber-500" : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {usagePct.toFixed(1)}% of {MAX_FREE_GB} GB ({formatBytes(stats.totalSize)} / {formatBytes(MAX_FREE_GB * 1024 * 1024 * 1024)})
                </p>
              </CardContent>
            </Card>

            {/* Total files */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileImage className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Total Files</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalCount.toLocaleString()}</p>
              </CardContent>
            </Card>

            {/* Categories breakdown */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Categories</span>
                </div>
                <div className="space-y-0.5">
                  {CATEGORIES.filter((c) => c.value !== "all").map((c) => {
                    const cat = stats.byCategory[c.value];
                    if (!cat || cat.count === 0) return null;
                    return (
                      <div key={c.value} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="font-medium">{cat.count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters & actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cari filename"
              placeholder="Cari filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={(v) => { if (!v) return; setSelected(new Set()); setCategory(v); setPagination((p) => ({ ...p, page: 1 })); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Hapus {selected.size} file
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48" aria-live="polite" aria-label="Memuat data">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-destructive" role="alert">
            <AlertTriangle className="h-10 w-10 opacity-60" />
            <p className="text-sm font-medium">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Coba lagi
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground" aria-live="polite">
            <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
            <p>{search ? "Tidak ada file yang cocok" : "Belum ada file"}</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* R-32: keyboard-accessible checkbox button */}
                    <TableHead className="w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        aria-label={selected.size === items.length && items.length > 0 ? "Batalkan semua" : "Pilih semua"}
                      >
                        {selected.size === items.length && items.length > 0 ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>File</TableHead>
                    {/* R-03: hidden on mobile */}
                    <TableHead className="hidden sm:table-cell">Kategori</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    {/* R-03: hidden on mobile */}
                    <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                    <TableHead className="w-20 sm:w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const isImg = isImageFile(item.filename);
                    return (
                      <TableRow
                        key={item.key}
                        className={selected.has(item.key) ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          {/* R-32: keyboard-accessible checkbox */}
                          <button
                            onClick={() => toggleSelect(item.key)}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                toggleSelect(item.key);
                              }
                            }}
                            className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            aria-label={selected.has(item.key) ? "Batalkan pilihan" : "Pilih file"}
                            role="checkbox"
                            aria-checked={selected.has(item.key)}
                            tabIndex={0}
                          >
                            {selected.has(item.key) ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={`relative w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                                isImg ? "bg-muted cursor-pointer hover:bg-muted/80" : "bg-muted"
                              }`}
                              onClick={() => isImg && setPreviewUrl(getPublicUrl(item.key))}
                              role={isImg ? "button" : undefined}
                              tabIndex={isImg ? 0 : undefined}
                              onKeyDown={isImg ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setPreviewUrl(getPublicUrl(item.key));
                                }
                              } : undefined}
                            >
                              {isImg && !imageErrors.has(item.key) ? (
                                <Image
                                  src={getPublicUrl(item.key)}
                                  alt={item.filename}
                                  fill
                                  className="object-cover rounded-lg"
                                  sizes="40px"
                                  onError={() => setImageErrors((prev) => new Set(prev).add(item.key))}
                                />
                              ) : (
                                <File className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate max-w-30 sm:max-w-xs">{item.filename}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-30 sm:max-w-xs hidden sm:block">{item.key}</p>
                            </div>
                          </div>
                        </TableCell>
                        {/* R-03: hidden on mobile */}
                        <TableCell className="hidden sm:table-cell">
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize">
                            {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBytes(item.size)}
                        </TableCell>
                        {/* R-03: hidden on mobile */}
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {formatDate(item.lastModified)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isImg && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() => setPreviewUrl(getPublicUrl(item.key))}
                                aria-label="Preview"
                              >
                                <ImageIcon className="h-4 w-4" />
                              </Button>
                            )}
                            <a
                              href={getPublicUrl(item.key)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Buka file"
                              className="inline-flex items-center justify-center rounded-lg border border-transparent hover:bg-muted h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteSingle(item.key)}
                              disabled={deleting}
                              aria-label="Hapus file"
                            >
                              {deleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && !loading && !loadError && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} file)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelected(new Set()); setPagination((p) => ({ ...p, page: p.page - 1 })); }}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelected(new Set()); setPagination((p) => ({ ...p, page: p.page + 1 })); }}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Image preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="truncate text-sm">{previewUrl?.split("/").pop()}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="overflow-auto max-h-[calc(80vh-60px)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={previewUrl?.split("/").pop() ?? "Preview"}
                className="w-full h-auto"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
