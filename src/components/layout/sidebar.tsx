"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Link as LinkIcon,
  Kanban,
  Briefcase,
  Users,
  UserCircle,
  Receipt,
  Settings,
  Wallet,
  ChevronLeft,
  PanelLeft,
  LogOut,
  ChevronDown,
  Package,
  MonitorPlay,
  History,
  Check,
  Shield,
  Wrench,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { STUDIO_DEFAULTS } from "@/lib/constants";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Link: LinkIcon,
  Kanban,
  Briefcase,
  Users,
  UserCircle,
  Receipt,
  Settings,
  Wallet,
  ChevronLeft,
  ChevronDown,
  Package,
  MonitorPlay,
  History,
};

interface MenuItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  group: string;
  order: number;
  isActive: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  user?: {
    name: string;
    email: string;
    roles: string[];
    activeRole: string | null;
  } | null;
  menus: MenuItem[];
}

function groupMenus(menus: MenuItem[]): NavGroup[] {
  const groupMap = new Map<string, NavGroup>();

  for (const menu of menus) {
    if (!groupMap.has(menu.group)) {
      groupMap.set(menu.group, { label: menu.group, items: [] });
    }
    groupMap.get(menu.group)!.items.push({
      name: menu.name,
      href: menu.href,
      icon: menu.icon,
    });
  }

  // Sort groups and items by their original order (already sorted from API)
  return Array.from(groupMap.values());
}

export function Sidebar({ collapsed = false, onToggle, user, menus }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navigationGroups = groupMenus(menus);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navigationGroups.forEach((group) => {
      initial[group.label] = true; // all groups expanded by default
    });
    return initial;
  });
  const [savingRole, setSavingRole] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [studioName, setStudioName] = useState(STUDIO_DEFAULTS.name);

  useEffect(() => {
    fetch("/api/settings/studio")
      .then((r) => r.json())
      .then((s) => { if (s.name) setStudioName(s.name); })
      .catch(() => {});
  }, []);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleToggleRole = async (role: string) => {
    setSavingRole(true);
    try {
      const res = await fetch("/api/users/me/role", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeRole: role }),
      });
      const data = await res.json();

      if (res.ok) {
        // Redirect based on new active role
        window.location.href = role === "DESIGNER" ? "/designer" : "/dashboard";
      } else {
        setAlertMessage(data.error || "Gagal switch role");
        setAlertOpen(true);
      }
    } catch (error) {
      console.error("Role switch error:", error);
      setAlertMessage("Terjadi kesalahan");
      setAlertOpen(true);
    } finally {
      setSavingRole(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border">
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">
                YD
              </span>
            </div>
            <div>
              <span className="font-semibold text-sidebar-foreground text-sm">
                {studioName}
              </span>
              <span className="block text-[10px] text-muted-foreground -mt-0.5">
                Studio Portal
              </span>
            </div>
          </Link>
        ) : (
          <Link href="/dashboard" className="mx-auto">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">
                YD
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {navigationGroups.map((group) => {
          const hasActiveChild = group.items.some((item) => isActive(item.href));
          const isOpen = collapsed ? true : (openGroups[group.label] ?? group.defaultOpen);

          return (
            <div key={group.label} className="mb-1">
              {/* Group Header */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                    hasActiveChild
                      ? "text-sidebar-primary"
                      : "text-muted-foreground hover:text-sidebar-foreground"
                  )}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      isOpen ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>
              )}

              {/* Group Items */}
              {(!collapsed ? isOpen : true) && (
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => {
                    const Icon = ICON_MAP[item.icon] || LayoutDashboard;
                    const active = isActive(item.href);

                    const linkContent = (
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 shrink-0", collapsed && "mx-auto")} />
                        {!collapsed && <span>{item.name}</span>}
                        {!collapsed && active && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
                        )}
                      </Link>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.name}>
                          <TooltipTrigger>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={10}>
                            <div>
                              <div className="font-medium">{group.label}</div>
                              <div className="text-muted-foreground">{item.name}</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return <div key={item.name}>{linkContent}</div>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse button */}
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className={cn("w-4 h-4", collapsed && "rotate-180")} />
          {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
        </Button>
      </div>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("flex items-center gap-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors w-full", collapsed ? "justify-center" : "")}>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                    {user ? getInitials(user.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {user?.name || "Guest"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.activeRole === "OWNER" ? "Admin" : user?.activeRole === "DESIGNER" ? "Designer" : "-"}
                    </p>
                  </div>
                )}
              </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-1">
                <p className="text-xs text-muted-foreground mb-1">Switch role:</p>
                <div className="space-y-1">
                  <RoleToggle
                    role="OWNER"
                    label="Admin"
                    icon={Shield}
                    active={user?.activeRole === "OWNER"}
                    onToggle={() => handleToggleRole("OWNER")}
                    disabled={savingRole}
                  />
                  <RoleToggle
                    role="DESIGNER"
                    label="Designer"
                    icon={Wrench}
                    active={user?.activeRole === "DESIGNER"}
                    onToggle={() => handleToggleRole("DESIGNER")}
                    disabled={savingRole}
                  />
                </div>
                {savingRole && <p className="text-xs text-muted-foreground mt-1">Saving...</p>}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Alert Dialog */}
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
    </aside>
  );
}

function RoleToggle({
  label,
  icon: Icon,
  active,
  onToggle,
  disabled,
}: {
  role?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onToggle: (active: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onToggle(!active)}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}
