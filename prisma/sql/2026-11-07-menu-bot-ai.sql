-- Menu "Bot AI" (/bot), hanya OWNER (docs/BOT_AI_PAGE.md §5). Idempoten: aman dijalankan ulang.
-- Dipakai di production sebagai pengganti prisma/seed.ts (seed juga mereset password user).
INSERT INTO menu_items (id, name, href, icon, "group", "order", "isActive", "createdAt", "updatedAt")
SELECT '/bot', 'Bot AI', '/bot', 'Bot', 'Work', 13, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE href = '/bot');

INSERT INTO menu2roles (id, "menuId", role, "createdAt")
SELECT 'menu-bot-owner', m.id, 'OWNER', now()
FROM menu_items m
WHERE m.href = '/bot'
  AND NOT EXISTS (SELECT 1 FROM menu2roles r WHERE r."menuId" = m.id AND r.role = 'OWNER');
