"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalRefreshButton } from "@/components/layout/global-refresh-button";
import { useGlobalFetching } from "@/components/providers/query-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Menu } from "lucide-react";

export function DashboardClientLayout({
  children,
  user,
  menus,
}: {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    roles: string[];
    activeRole: string | null;
  } | null;
  menus: Array<{
    id: string;
    name: string;
    href: string;
    icon: string;
    group: string;
    order: number;
    isActive: boolean;
  }>;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { isGlobalFetching } = useGlobalFetching();
  const pathname = usePathname();

  // Longest matching href wins so nested routes resolve to their own menu item
  const currentPage = menus
    .filter((m) => pathname === m.href || pathname.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.name;

  // The drawer only exists below md; drop it if the viewport grows past that
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background relative">
      {/* Full-screen loading overlay — covers sidebar (menu) area */}
      {isGlobalFetching && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
        menus={menus}
      />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 max-h-none overflow-hidden bg-sidebar data-[side=left]:w-72 data-[side=left]:max-w-[85vw]"
        >
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <Sidebar
            variant="drawer"
            user={user}
            menus={menus}
            onNavigate={() => setMobileNavOpen(false)}
            onClose={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <main className="flex-1 min-w-0 overflow-y-auto flex flex-col">
        {/* Mobile: menu + page name. Global refresh sits top-right on all sizes */}
        <div className="flex items-center gap-2 p-2 md:p-4 md:pb-0 shrink-0 max-md:border-b max-md:border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            className="size-11 md:hidden"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="size-5" />
          </Button>
          {currentPage && (
            <span className="md:hidden min-w-0 truncate text-sm font-medium">
              {currentPage}
            </span>
          )}
          <div className="ml-auto">
            <GlobalRefreshButton />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
