"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalRefreshButton } from "@/components/layout/global-refresh-button";
import { useGlobalFetching } from "@/components/providers/query-provider";
import { Loader2 } from "lucide-react";

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
  const { isGlobalFetching } = useGlobalFetching();

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
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
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Global refresh — sticky top-right */}
        <div className="flex justify-end p-4 pb-0 ml-auto shrink-0">
          <GlobalRefreshButton />
        </div>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
