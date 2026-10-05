import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DashboardClientLayout } from "./client-layout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Fetch menus with Menu2Role entries, filter server-side
  const menus = await prisma.menuItem.findMany({
    where: { isActive: true },
    orderBy: [{ group: "asc" }, { order: "asc" }],
    include: {
      menu2Roles: true,
    },
  });

  // Filter: only show menus where user's activeRole is in Menu2Role
  const visibleMenus = menus.filter((menu) => {
    if (!menu.menu2Roles || menu.menu2Roles.length === 0) return true;
    return menu.menu2Roles.some((m2r) => m2r.role === user?.activeRole);
  });

  return (
    <DashboardClientLayout
      user={user ? { name: user.name, email: user.email, roles: user.roles, activeRole: user.activeRole } : null}
      menus={visibleMenus}
    >
      {children}
    </DashboardClientLayout>
  );
}
