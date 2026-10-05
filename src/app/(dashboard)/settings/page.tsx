"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

export default function SettingsPage() {
  const [studioName, setStudioName] = useState("YukDesain Studio");
  const [studioEmail, setStudioEmail] = useState("hello@yukdesain.com");
  const [studioPhone, setStudioPhone] = useState("+62 812 3456 7890");
  const [studioAddress, setStudioAddress] = useState("Jakarta, Indonesia");

  // Notification settings
  const [notifyNewOrder, setNotifyNewOrder] = useState(true);
  const [notifyNewBrief, setNotifyNewBrief] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [notifyDeadline, setNotifyDeadline] = useState(true);

  // System settings
  const [darkMode, setDarkMode] = useState(false);
  const [autoArchive, setAutoArchive] = useState(true);
  const [revisionQuota, setRevisionQuota] = useState("3");

  // Menu management
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [menuForm, setMenuForm] = useState({ name: "", href: "", icon: "LayoutDashboard", group: "Overview", roles: [] as string[] });
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<MenuItem | null>(null);

  const loadMenus = async () => {
    setMenuLoading(true);
    try {
      const res = await fetch("/api/menus?all=true");
      const data = await res.json();
      setMenuItems(data.menus || []);
    } catch {
      setMenuError("Gagal memuat menu");
    } finally {
      setMenuLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern in codebase */
  useEffect(() => { loadMenus(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const handleSaveMenu = async () => {
    if (!menuForm.name || !menuForm.href) { setMenuError("Nama dan path harus diisi"); return; }
    if (menuForm.roles.length === 0) { setMenuError("Minimal pilih satu role"); return; }
    setMenuSaving(true);
    setMenuError("");
    try {
      const method = editingMenu ? "PUT" : "POST";
      const url = editingMenu ? `/api/menus/${editingMenu.id}` : "/api/menus";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(menuForm),
      });
      if (!res.ok) { const d = await res.json(); setMenuError(d.error || "Gagal menyimpan"); return; }
      setMenuDialogOpen(false);
      loadMenus();
    } catch { setMenuError("Gagal menyimpan"); } finally { setMenuSaving(false); }
  };

  const handleToggleActive = async (menu: MenuItem) => {
    try {
      await fetch(`/api/menus/${menu.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !menu.isActive }),
      });
      setMenuItems((items) =>
        items.map((m) => m.id === menu.id ? { ...m, isActive: !m.isActive } : m)
      );
    } catch { /* silent fail */ }
  };

  const handleDeleteMenu = async () => {
    if (!confirmTarget) return;
    try {
      await fetch(`/api/menus/${confirmTarget.id}`, { method: "DELETE" });
      loadMenus();
    } catch { /* silent fail */ } finally {
      setConfirmOpen(false);
      setConfirmTarget(null);
    }
  };

  const openDeleteConfirm = (menu: MenuItem) => {
    setConfirmTarget(menu);
    setConfirmOpen(true);
  };

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
          <TabsList className="grid w-full grid-cols-5">
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
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
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
                <Button size="sm" onClick={openCreateMenu}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Menu
                </Button>
              </CardHeader>
              <CardContent>
                {menuLoading ? (
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
            <Button onClick={handleSaveMenu} disabled={menuSaving}>
              {menuSaving ? "Menyimpan..." : "Simpan"}
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
            <Button variant="destructive" onClick={handleDeleteMenu}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
