-- Menu "Operasional" (/operasional), hanya OWNER (docs/STUDIO_OPERATIONS.md). Idempoten: aman dijalankan ulang.
-- Dipakai di production sebagai pengganti prisma/seed.ts (seed juga mereset password user).
INSERT INTO menu_items (id, name, href, icon, "group", "order", "isActive", "createdAt", "updatedAt")
SELECT '/operasional', 'Operasional', '/operasional', 'Clock', 'Work', 14, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE href = '/operasional');

INSERT INTO menu2roles (id, "menuId", role, "createdAt")
SELECT 'menu-operasional-owner', m.id, 'OWNER', now()
FROM menu_items m
WHERE m.href = '/operasional'
  AND NOT EXISTS (SELECT 1 FROM menu2roles r WHERE r."menuId" = m.id AND r.role = 'OWNER');
