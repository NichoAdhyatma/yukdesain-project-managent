"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
        menus={menus}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
