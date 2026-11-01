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
  ImageIcon,
  LayoutGrid,
  X,
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
  ImageIcon,
  LayoutGrid,
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
  /** "desktop" is the persistent md+ aside; "drawer" fills the mobile Sheet. */
  variant?: "desktop" | "drawer";
  collapsed?: boolean;
  onToggle?: () => void;
  /** Drawer only: called after a nav link is tapped. */
  onNavigate?: () => void;
  /** Drawer only: renders the close button in the header. */
  onClose?: () => void;
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

  // Sort groups by their minimum item order, items within group by their order
  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      items: group.items.sort(
        (a, b) => {
          const menuA = menus.find((m) => m.name === a.name);
          const menuB = menus.find((m) => m.name === b.name);
          return (menuA?.order ?? 0) - (menuB?.order ?? 0);
        }
      ),
    }))
    .sort((a, b) => {
      const firstA = menus.find((m) => m.name === a.items[0]?.name);
      const firstB = menus.find((m) => m.name === b.items[0]?.name);
      return (firstA?.order ?? 0) - (firstB?.order ?? 0);
    });
}

export function Sidebar({
  variant = "desktop",
  collapsed: collapsedProp = false,
  onToggle,
  onNavigate,
  onClose,
  user,
  menus,
}: SidebarProps) {
  const isDrawer = variant === "drawer";
  const collapsed = !isDrawer && collapsedProp;
  const Root = isDrawer ? "div" : "aside";
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

  // Designers land on their workspace, not the owner dashboard
  const homeHref = user?.activeRole === "OWNER" ? "/dashboard" : "/designer";

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
    <Root
      className={cn(
        "flex flex-col bg-sidebar",
        isDrawer
          ? "h-full"
          : cn(
              "hidden md:flex h-screen border-r border-sidebar-border transition-all duration-200",
              collapsed ? "w-16" : "w-64"
            )
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-14 border-b border-sidebar-border", isDrawer ? "pl-4 pr-2" : "px-4")}>
        {!collapsed ? (
          <Link href={homeHref} onClick={onNavigate} className={cn("flex items-center gap-2", isDrawer && "min-h-11")}>
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
          <Link href={homeHref} className="mx-auto">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">
                YD
              </span>
            </div>
          </Link>
        )}
        {isDrawer && onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-auto size-11"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overscroll-contain">
        {navigationGroups.map((group) => {
          const hasActiveChild = group.items.some((item) => isActive(item.href));
          // The drawer shows every group expanded; its headers are plain labels
          const isOpen = collapsed || isDrawer ? true : (openGroups[group.label] ?? group.defaultOpen);

          return (
            <div key={group.label} className="mb-1">
              {/* Group Header */}
              {isDrawer ? (
                <p
                  className={cn(
                    "px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider",
                    hasActiveChild ? "text-sidebar-primary" : "text-muted-foreground"
                  )}
                >
                  {group.label}
                </p>
              ) : !collapsed && (
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
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          isDrawer && "min-h-11",
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

      {/* Collapse button (desktop only) */}
      {!isDrawer && (
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
      )}

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("flex items-center gap-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors w-full", collapsed ? "justify-center" : "", isDrawer && "min-h-11")}>
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
                    touch={isDrawer}
                  />
                  <RoleToggle
                    role="DESIGNER"
                    label="Designer"
                    icon={Wrench}
                    active={user?.activeRole === "DESIGNER"}
                    onToggle={() => handleToggleRole("DESIGNER")}
                    disabled={savingRole}
                    touch={isDrawer}
                  />
                </div>
                {savingRole && <p className="text-xs text-muted-foreground mt-1">Saving...</p>}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className={cn("text-destructive cursor-pointer", isDrawer && "min-h-11")}>
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
    </Root>
  );
}

function RoleToggle({
  label,
  icon: Icon,
  active,
  onToggle,
  disabled,
  touch,
}: {
  role?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onToggle: (active: boolean) => void;
  disabled: boolean;
  /** Raise the row to a 44px tap target (mobile drawer). */
  touch?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onToggle(!active)}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        touch && "min-h-11",
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
