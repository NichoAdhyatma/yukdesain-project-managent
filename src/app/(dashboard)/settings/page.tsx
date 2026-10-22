"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { toast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { STUDIO_DEFAULTS } from "@/lib/constants";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Bell,
  Palette,
  Shield,
  Key,
  Save,
  Upload,
  Menu,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  CreditCard,
  Building,
  Smartphone,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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

type Menu2Role = { role: string };
type MenuItem = {
  id: string;
  name: string;
  href: string;
  icon: string;
  group: string;
  order: number;
  isActive: boolean;
  menu2Roles?: Menu2Role[];
};
type PaymentAccount = {
  id: string;
  type: string;
  name: string;
  accountNumber: string;
  accountHolder: string;
  logoUrl: string;
  qrisImageUrl: string;
  isActive: boolean;
  order: number;
};

type MenusResponse = { menus: MenuItem[] };
type StudioSettings = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
};
type PaymentAccountsResponse = { accounts: PaymentAccount[] };

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // Studio settings form state (pre-populated from defaults, updated from query)
  const [studioName, setStudioName] = useState<string>(STUDIO_DEFAULTS.name);
  const [studioEmail, setStudioEmail] = useState<string>(STUDIO_DEFAULTS.email);
  const [studioPhone, setStudioPhone] = useState<string>(STUDIO_DEFAULTS.phone);
  const [studioAddress, setStudioAddress] = useState<string>(STUDIO_DEFAULTS.address);

  // Notification settings
  const [notifyNewOrder, setNotifyNewOrder] = useState(true);
  const [notifyNewBrief, setNotifyNewBrief] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [notifyDeadline, setNotifyDeadline] = useState(true);

  // System settings
  const [darkMode, setDarkMode] = useState(false);
  const [autoArchive, setAutoArchive] = useState(true);
  const [revisionQuota, setRevisionQuota] = useState("3");

  // Menu management state
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [menuForm, setMenuForm] = useState({ name: "", href: "", icon: "LayoutDashboard", group: "Overview", roles: [] as string[] });
  const [menuError, setMenuError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<MenuItem | null>(null);

  // Payment accounts state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [paymentForm, setPaymentForm] = useState({ type: "BANK", name: "", accountNumber: "", accountHolder: "", logoUrl: "", qrisImageUrl: "" });
  const [paymentError, setPaymentError] = useState("");
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [paymentConfirmTarget, setPaymentConfirmTarget] = useState<PaymentAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Queries
  const { data: menusData, isLoading: menusLoading } = useQuery<MenusResponse>({
    queryKey: ["menus"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/menus?all=true");
      return res.json();
    },
  });
  const menuItems = menusData?.menus ?? [];

  const { data: studioData } = useQuery<StudioSettings>({
    queryKey: ["studio-settings"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/settings/studio");
      return res.json();
    },
  });

  // Sync studio form fields from query data
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (studioData) {
      if (studioData.name) setStudioName(studioData.name);
      if (studioData.email) setStudioEmail(studioData.email);
      if (studioData.phone !== undefined) setStudioPhone(studioData.phone || "");
      if (studioData.address) setStudioAddress(studioData.address);
    }
  }, [studioData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: paymentData, isLoading: paymentLoading } = useQuery<PaymentAccountsResponse>({
    queryKey: ["payment-accounts"],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/settings/payment-accounts");
      return res.json();
    },
  });
  const paymentAccounts = paymentData?.accounts ?? [];

  // Mutations
  const saveStudioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: studioName,
          email: studioEmail,
          phone: studioPhone,
          address: studioAddress,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
    },
    onSuccess: () => {
      toast("Pengaturan berhasil disimpan", "success");
      queryClient.invalidateQueries({ queryKey: ["studio-settings"] });
    },
    onError: () => {
      toast("Gagal menyimpan pengaturan", "error");
    },
  });

  const saveMenuMutation = useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: typeof menuForm }) => {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/menus/${id}` : "/api/menus";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      return data;
    },
    onSuccess: () => {
      setMenuDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
    onError: (err: Error) => {
      setMenuError(err.message || "Gagal menyimpan");
    },
  });

  const toggleMenuMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await fetch(`/api/menus/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
  });

  const deleteMenuMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/menus/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      setConfirmOpen(false);
      setConfirmTarget(null);
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
  });

  const saveAccountMutation = useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: typeof paymentForm }) => {
      const method = id ? "PUT" : "POST";
      const url = "/api/settings/payment-accounts";
      const reqBody: Record<string, unknown> = { ...body };
      if (id) reqBody.id = id;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      return data;
    },
    onSuccess: () => {
      setPaymentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
    },
    onError: (err: Error) => {
      setPaymentError(err.message || "Gagal menyimpan");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/settings/payment-accounts?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      setPaymentConfirmOpen(false);
      setPaymentConfirmTarget(null);
      queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
    },
  });

  const openCreateMenu = () => {
    setEditingMenu(null);
    setMenuForm({ name: "", href: "", icon: "LayoutDashboard", group: "Overview", roles: [] });
    setMenuError("");
    setMenuDialogOpen(true);
  };

  const openEditMenu = (menu: MenuItem) => {
    setEditingMenu(menu);
    setMenuForm({ name: menu.name, href: menu.href, icon: menu.icon, group: menu.group, roles: menu.menu2Roles?.map((m) => m.role) || [] });
    setMenuError("");
    setMenuDialogOpen(true);
  };

  const handleSaveMenu = () => {
    if (!menuForm.name || !menuForm.href) { setMenuError("Nama dan path harus diisi"); return; }
    if (menuForm.roles.length === 0) { setMenuError("Minimal pilih satu role"); return; }
    setMenuError("");
    saveMenuMutation.mutate({
      id: editingMenu?.id,
      body: menuForm,
    });
  };

  const handleToggleActive = (menu: MenuItem) => {
    toggleMenuMutation.mutate({ id: menu.id, isActive: !menu.isActive });
  };

  const openDeleteConfirm = (menu: MenuItem) => {
    setConfirmTarget(menu);
    setConfirmOpen(true);
  };

  const handleDeleteMenu = () => {
    if (!confirmTarget) return;
    deleteMenuMutation.mutate(confirmTarget.id);
  };

  const openCreateAccount = () => {
    setEditingAccount(null);
    setPaymentForm({ type: "BANK", name: "", accountNumber: "", accountHolder: "", logoUrl: "", qrisImageUrl: "" });
    setPaymentError("");
    setPaymentDialogOpen(true);
  };

  const openEditAccount = (acc: PaymentAccount) => {
    setEditingAccount(acc);
    setPaymentForm({
      type: acc.type,
      name: acc.name,
      accountNumber: acc.accountNumber,
      accountHolder: acc.accountHolder,
      logoUrl: acc.logoUrl || "",
      qrisImageUrl: acc.qrisImageUrl || "",
    });
    setPaymentError("");
    setPaymentDialogOpen(true);
  };

  const handleSaveAccount = () => {
    if (!paymentForm.name || !paymentForm.accountNumber || !paymentForm.accountHolder) {
      setPaymentError("Semua field harus diisi");
      return;
    }
    setPaymentError("");
    saveAccountMutation.mutate({
      id: editingAccount?.id,
      body: paymentForm,
    });
  };

  const openDeleteAccount = (acc: PaymentAccount) => {
    setPaymentConfirmTarget(acc);
    setPaymentConfirmOpen(true);
  };

  const handleDeleteAccount = () => {
    if (!paymentConfirmTarget) return;
    deleteAccountMutation.mutate(paymentConfirmTarget.id);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  async function uploadPaymentLogo(file: File, type: "logo" | "qris") {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch("/api/settings/payment-accounts/upload", { method: "POST", body: fd });
    if (!res.ok) return null;
    const { publicUrl } = await res.json();
    return publicUrl as string;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Konfigurasi studio dan sistem
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="general" className="w-full max-w-3xl">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general" className="gap-2">
              <User className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="h-4 w-4" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2">
              <Shield className="h-4 w-4" />
              System
            </TabsTrigger>
            <TabsTrigger value="menus" className="gap-2">
              <Menu className="h-4 w-4" />
              Menus
            </TabsTrigger>
            <TabsTrigger value="payment" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Payment
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Studio Information</CardTitle>
                <CardDescription>
                  Informasi dasar studio Anda
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="studioName">Nama Studio</Label>
                  <Input
                    id="studioName"
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studioEmail">Email</Label>
                  <Input
                    id="studioEmail"
                    type="email"
                    value={studioEmail}
                    onChange={(e) => setStudioEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studioPhone">Phone</Label>
                  <Input
                    id="studioPhone"
                    value={studioPhone}
                    onChange={(e) => setStudioPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studioAddress">Address</Label>
                  <Input
                    id="studioAddress"
                    value={studioAddress}
                    onChange={(e) => setStudioAddress(e.target.value)}
                  />
                </div>
                <div className="pt-4">
                  <Button onClick={() => saveStudioMutation.mutate()} disabled={saveStudioMutation.isPending}>
                    {saveStudioMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    {saveStudioMutation.isPending ? "Menyimpan..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Logo Studio</CardTitle>
                <CardDescription>
                  Upload logo untuk invoice dan dokumen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <Button variant="outline">Upload Logo</Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      PNG, JPG up to 2MB
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Atur notifikasi yang ingin Anda terima
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Order Baru</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi saat ada order baru
                    </p>
                  </div>
                  <Switch
                    checked={notifyNewOrder}
                    onCheckedChange={setNotifyNewOrder}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Brief Submitted</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi saat client submit brief
                    </p>
                  </div>
                  <Switch
                    checked={notifyNewBrief}
                    onCheckedChange={setNotifyNewBrief}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Pembayaran</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi untuk update pembayaran
                    </p>
                  </div>
                  <Switch
                    checked={notifyPayment}
                    onCheckedChange={setNotifyPayment}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Deadline Reminder</Label>
                    <p className="text-sm text-muted-foreground">
                      Reminder H-3 sebelum deadline
                    </p>
                  </div>
                  <Switch
                    checked={notifyDeadline}
                    onCheckedChange={setNotifyDeadline}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tampilan</CardTitle>
                <CardDescription>
                  Atur tampilan portal sesuai preferensi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktifkan mode gelap
                    </p>
                  </div>
                  <Switch
                    checked={darkMode}
                    onCheckedChange={setDarkMode}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Rules</CardTitle>
                <CardDescription>
                  Konfigurasi aturan bisnis studio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="revisionQuota">Revision Quota</Label>
                  <Input
                    id="revisionQuota"
                    type="number"
                    value={revisionQuota}
                    onChange={(e) => setRevisionQuota(e.target.value)}
                    className="w-32"
                  />
                  <p className="text-sm text-muted-foreground">
                    Jumlah revision gratis yang diberikan ke client
                  </p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto Archive</Label>
                    <p className="text-sm text-muted-foreground">
                      Archive project selesai secara otomatis setelah 30 hari
                    </p>
                  </div>
                  <Switch
                    checked={autoArchive}
                    onCheckedChange={setAutoArchive}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>
                  Pengaturan keamanan akun
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Change Password</p>
                    <p className="text-sm text-muted-foreground">
                      Update password secara berkala
                    </p>
                  </div>
                  <Button variant="outline">Update</Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Two-Factor Authentication</p>
                    <p className="text-sm text-muted-foreground">
                      Tambah lapisan keamanan tambahan
                    </p>
                  </div>
                  <Badge variant="secondary">Recommended</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Menu Management */}
          <TabsContent value="menus" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Navigation Menu</CardTitle>
                  <CardDescription>
                    Kelola menu sidebar. Nonaktifkan menu tanpa menghapus dari database.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={openCreateMenu}>
                    <Plus className="h-4 w-4 mr-1" />
                    Tambah Menu
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {menusLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Memuat...</p>
                ) : menuItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Belum ada menu</p>
                ) : (
                  <div className="space-y-2">
                    {["Overview", "Work Management", "Finance", "Designer", "Settings"].map((group) => {
                      const groupItems = menuItems.filter((m) => m.group === group);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">{group}</p>
                          <div className="border rounded-lg divide-y">
                            {groupItems.map((menu) => (
                              <div key={menu.id} className="flex items-center gap-3 p-3">
                                <span className="text-sm font-medium flex-1">{menu.name}</span>
                                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{menu.href}</code>
                                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{menu.icon}</code>
                                <div className="flex gap-1">
                                  {menu.menu2Roles?.map((m2r) => (
                                    <Badge key={m2r.role} variant={m2r.role === "OWNER" ? "default" : "secondary"} className="text-xs">
                                      {m2r.role === "OWNER" ? "Admin" : "Designer"}
                                    </Badge>
                                  ))}
                                </div>
                                <Switch
                                  checked={menu.isActive}
                                  onCheckedChange={() => handleToggleActive(menu)}
                                />
                                <Button variant="ghost" size="sm" onClick={() => openEditMenu(menu)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openDeleteConfirm(menu)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Accounts */}
          <TabsContent value="payment" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Rekening & E-Wallet</CardTitle>
                  <CardDescription>
                    Akun pembayaran yang ditampilkan ke client di portal
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={openCreateAccount}>
                    <Plus className="h-4 w-4 mr-1" />
                    Tambah Akun
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {paymentLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Memuat...</p>
                ) : paymentAccounts.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">Belum ada akun pembayaran</p>
                    <p className="text-xs text-muted-foreground mt-1">Tambahkan rekening bank atau e-wallet untuk ditampilkan ke client</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Bank Accounts */}
                    {paymentAccounts.filter((a) => a.type === "BANK").length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5" />
                          Transfer Bank
                        </p>
                        <div className="space-y-2">
                          {paymentAccounts.filter((a) => a.type === "BANK").map((acc) => (
                            <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                              {acc.logoUrl ? (
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white shrink-0">
                                  <Image src={acc.logoUrl} alt={acc.name} fill className="object-contain" unoptimized />
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                                  <Building className="h-5 w-5 text-blue-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">{acc.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{acc.accountNumber}</p>
                                <p className="text-xs text-muted-foreground">a/n {acc.accountHolder}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(acc.accountNumber, acc.id)}>
                                {copiedId === acc.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEditAccount(acc)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openDeleteAccount(acc)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* E-Wallet Accounts */}
                    {paymentAccounts.filter((a) => a.type === "EWALLET").length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5" />
                          E-Wallet
                        </p>
                        <div className="space-y-2">
                          {paymentAccounts.filter((a) => a.type === "EWALLET").map((acc) => (
                            <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                              <div className="flex items-center gap-2 shrink-0">
                                {acc.logoUrl ? (
                                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white">
                                    <Image src={acc.logoUrl} alt={acc.name} fill className="object-contain" unoptimized />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                                    <Smartphone className="h-4 w-4 text-green-600" />
                                  </div>
                                )}
                                {acc.qrisImageUrl && (
                                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white border" title="QRIS tersedia">
                                    <Image src={acc.qrisImageUrl} alt="QRIS" fill className="object-contain" unoptimized />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">{acc.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{acc.accountNumber}</p>
                                <p className="text-xs text-muted-foreground">a/n {acc.accountHolder}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(acc.accountNumber, acc.id)}>
                                {copiedId === acc.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEditAccount(acc)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openDeleteAccount(acc)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Menu Dialog */}
      <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMenu ? "Edit Menu" : "Tambah Menu"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {menuError && <p className="text-sm text-destructive">{menuError}</p>}
            <div className="space-y-2">
              <Label htmlFor="menuName">Nama Menu</Label>
              <Input
                id="menuName"
                placeholder="Dashboard"
                value={menuForm.name}
                onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuHref">Path</Label>
              <Input
                id="menuHref"
                placeholder="/dashboard"
                value={menuForm.href}
                onChange={(e) => setMenuForm((f) => ({ ...f, href: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Group</Label>
              <Select
                value={menuForm.group}
                onValueChange={(v) => v && setMenuForm((f) => ({ ...f, group: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Overview", "Work Management", "Finance", "Designer", "Settings"].map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="menuIcon">Icon (Lucide name)</Label>
              <Input
                id="menuIcon"
                placeholder="LayoutDashboard"
                value={menuForm.icon}
                onChange={(e) => setMenuForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Role Akses</Label>
              <div className="flex gap-4">
                {["OWNER", "DESIGNER"].map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={menuForm.roles.includes(r)}
                      onChange={(e) => {
                        setMenuForm((f) => ({
                          ...f,
                          roles: e.target.checked
                            ? [...f.roles, r]
                            : f.roles.filter((role) => role !== r),
                        }));
                      }}
                    />
                    {r === "OWNER" ? "Admin" : "Designer"}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMenuDialogOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              Batal
            </Button>
            <Button onClick={handleSaveMenu} disabled={saveMenuMutation.isPending}>
              {saveMenuMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Menu
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Yakin ingin menghapus menu <strong>&quot;{confirmTarget?.name}&quot;</strong>?
            Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteMenu} disabled={deleteMenuMutation.isPending}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Payment Account Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Akun Pembayaran" : "Tambah Akun Pembayaran"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
            <div className="space-y-2">
              <Label>Tipe Akun</Label>
              <Select
                value={paymentForm.type}
                onValueChange={(v) => v && setPaymentForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Transfer Bank</SelectItem>
                  <SelectItem value="EWALLET">E-Wallet / QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accName">Nama Bank / E-Wallet</Label>
              <Input
                id="accName"
                placeholder={paymentForm.type === "BANK" ? "BCA, Mandiri, BRI, ..." : "GoPay, OVO, Dana, DANA ..."}
                value={paymentForm.name}
                onChange={(e) => setPaymentForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accNumber">Nomor Rekening / E-Wallet</Label>
              <Input
                id="accNumber"
                placeholder="1234567890"
                value={paymentForm.accountNumber}
                onChange={(e) => setPaymentForm((f) => ({ ...f, accountNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accHolder">Nama Pemilik</Label>
              <Input
                id="accHolder"
                placeholder="John Doe"
                value={paymentForm.accountHolder}
                onChange={(e) => setPaymentForm((f) => ({ ...f, accountHolder: e.target.value }))}
              />
            </div>

            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Logo {paymentForm.type === "BANK" ? "Bank" : "E-Wallet"}</Label>
              <div className="flex items-center gap-3">
                {paymentForm.logoUrl ? (
                  <div className="relative w-16 h-16 rounded-lg border overflow-hidden shrink-0">
                    <Image src={paymentForm.logoUrl} alt="Logo" fill className="object-contain" unoptimized />
                    <button
                      type="button"
                      onClick={() => setPaymentForm((f) => ({ ...f, logoUrl: "" }))}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                      aria-label="Hapus logo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadPaymentLogo(file, "logo");
                        if (url) setPaymentForm((f) => ({ ...f, logoUrl: url }));
                      }}
                    />
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  {paymentForm.logoUrl ? "Klik X untuk hapus logo" : "Upload logo bank atau e-wallet"}
                </p>
              </div>
            </div>

            {/* QRIS Image Upload — only for E-Wallet */}
            {paymentForm.type === "EWALLET" && (
              <div className="space-y-2">
                <Label>Gambar QRIS</Label>
                <div className="flex items-center gap-3">
                  {paymentForm.qrisImageUrl ? (
                    <div className="relative w-24 h-24 rounded-lg border overflow-hidden shrink-0 bg-white">
                      <Image src={paymentForm.qrisImageUrl} alt="QRIS" fill className="object-contain" unoptimized />
                      <button
                        type="button"
                        onClick={() => setPaymentForm((f) => ({ ...f, qrisImageUrl: "" }))}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                        aria-label="Hapus QRIS"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-24 h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-muted-foreground/50 transition-colors shrink-0">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadPaymentLogo(file, "qris");
                          if (url) setPaymentForm((f) => ({ ...f, qrisImageUrl: url }));
                        }}
                      />
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground text-center px-1">Upload QRIS</span>
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {paymentForm.qrisImageUrl ? "Klik X untuk hapus QRIS" : "Upload gambar QRIS untuk e-wallet ini"}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              Batal
            </Button>
            <Button onClick={handleSaveAccount} disabled={saveAccountMutation.isPending}>
              {saveAccountMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Account Dialog */}
      <Dialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Akun Pembayaran
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Yakin ingin menghapus <strong>&quot;{paymentConfirmTarget?.name} - {paymentConfirmTarget?.accountNumber}&quot;</strong>?
            Akun ini tidak akan lagi ditampilkan ke client.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentConfirmOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteAccountMutation.isPending}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
