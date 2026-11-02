import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seed is IDEMPOTENT: uses upsert for users/menus/services, safe to re-run
async function main() {
  console.log("🌱 Seeding database...");

  // Delete project-related data (safe to recreate — it's test data)
  await prisma.activityLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.revision.deleteMany();
  await prisma.projectUpdate.deleteMany();
  await prisma.projectAssignment.deleteMany();
  await prisma.clientLink.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.service.deleteMany();

  // Reference data: upsert (preserve existing changes)
  await upsertStatusLabels();
  await upsertPaymentStatusLabels();

  // Menu items & Menu2Role: upsert
  await upsertMenuItems();

  // Users
  await upsertUsers();

  // Seed project data
  await seedProjectData();

  console.log("");
  console.log("🎉 Seed completed!");
  console.log("");
  console.log("Owner: rizal@yukdesain.com / portalowner123");
  console.log("Full-time: ivan@yukdesain.com / fulltimeivan001, daffa@yukdesain.com / interndaffa002");
  console.log("Freelance: farih@fukdesain.com / freelancefarih001, fia@fukdesain.com / freelancefia002, fahmi@fukdesain.com / freelancefahmi003, yasmin@fukdesain.com / freelanceyasmin004");
}

// Status labels
async function upsertStatusLabels() {
  const labels = [
    { value: "DRAFT", label: "Draft", variant: "secondary", type: "PROJECT", order: 1 },
    { value: "BELUM_DIKERJAKAN", label: "Menunggu Brief", variant: "secondary", type: "PROJECT", order: 2 },
    { value: "SEDANG_DIKERJAKAN", label: "Dikerjakan", variant: "default", type: "PROJECT", order: 3 },
    { value: "SELESAI", label: "Selesai", variant: "outline", type: "PROJECT", order: 4 },
  ];

  for (const label of labels) {
    await prisma.statusLabel.upsert({
      where: { value: label.value },
      create: label,
      update: { label: label.label, variant: label.variant, order: label.order },
    });
  }
  console.log("✅ Seeded status labels (idempotent)");
}

// Payment status labels
async function upsertPaymentStatusLabels() {
  const labels = [
    { value: "UNPAID", label: "Belum Bayar", variant: "destructive" },
    { value: "PARTIALLY_PAID", label: "DP", variant: "secondary" },
    { value: "PAID", label: "Lunas", variant: "outline" },
  ];

  for (const label of labels) {
    await prisma.paymentStatusLabel.upsert({
      where: { value: label.value },
      create: label,
      update: { label: label.label, variant: label.variant },
    });
  }
  console.log("✅ Seeded payment status labels (idempotent)");
}

// Menu items and Menu2Role
async function upsertMenuItems() {
  const menuDefs = [
    // Overview
    { name: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", group: "Overview", order: 1 },

    // Work
    { name: "Form Link", href: "/form-link", icon: "Link", group: "Work", order: 10 },
    { name: "Projects", href: "/projects", icon: "Briefcase", group: "Work", order: 11 },
    { name: "Order WA", href: "/wa-orders", icon: "MessageCircle", group: "Work", order: 12 },

    // Team
    { name: "Designers", href: "/designers", icon: "Users", group: "Team", order: 20 },
    { name: "Services", href: "/services", icon: "LayoutGrid", group: "Team", order: 21 },

    // Assets
    { name: "Media", href: "/media", icon: "ImageIcon", group: "Assets", order: 30 },

    // Finance
    { name: "Invoices", href: "/invoices", icon: "Receipt", group: "Finance", order: 40 },
    { name: "Financial", href: "/financial", icon: "Wallet", group: "Finance", order: 41 },

    // Settings
    { name: "Settings", href: "/settings", icon: "Settings", group: "Settings", order: 50 },
    { name: "Activity History", href: "/activity-history", icon: "History", group: "Settings", order: 51 },

    // Workspace (designer role)
    { name: "Workspace", href: "/designer", icon: "MonitorPlay", group: "Workspace", order: 60 },
  ];

  const menu2RoleDefs: Record<string, string[]> = {
    "/dashboard": ["OWNER"],
    "/form-link": ["OWNER"],
    "/projects": ["OWNER"],
    "/wa-orders": ["OWNER"],
    "/designers": ["OWNER"],
    "/services": ["OWNER"],
    "/designer": ["OWNER", "DESIGNER"],
    "/invoices": ["OWNER"],
    "/financial": ["OWNER"],
    "/media": ["OWNER"],
    "/settings": ["OWNER"],
    "/activity-history": ["OWNER"],
  };

  const menuMap: Record<string, string> = {};

  for (const def of menuDefs) {
    const existing = await prisma.menuItem.findFirst({ where: { href: def.href } });
    const menu = existing
      ? await prisma.menuItem.update({ where: { id: existing.id }, data: { name: def.name, icon: def.icon, group: def.group, order: def.order } })
      : await prisma.menuItem.create({ data: { id: def.href, ...def } });
    menuMap[def.href] = menu.id;
  }
  console.log(`✅ Seeded ${menuDefs.length} menu items (idempotent)`);

  for (const [href, roles] of Object.entries(menu2RoleDefs)) {
    const menuId = menuMap[href];
    if (!menuId) continue;
    for (const role of roles) {
      await prisma.menu2Role.upsert({
        where: { menuId_role: { menuId, role } },
        create: { menuId, role },
        update: {},
      });
    }
  }
  const totalRoles = Object.values(menu2RoleDefs).reduce((sum, r) => sum + r.length, 0);
  console.log(`✅ Seeded ${totalRoles} menu2role entries (idempotent)`);
}

// Users: upsert by email
async function upsertUsers() {
  // Owner
  const owner = await prisma.user.upsert({
    where: { email: "rizal@yukdesain.com" },
    create: { name: "Rizal", email: "rizal@yukdesain.com", passwordHash: await bcrypt.hash("portalowner123", 10), roles: { set: ["OWNER", "DESIGNER"] } },
    update: { name: "Rizal", passwordHash: await bcrypt.hash("portalowner123", 10) },
  });
  console.log("✅ Seeded owner:", owner.email);

  // Full-time designers
  const ivan = await prisma.user.upsert({
    where: { email: "ivan@yukdesain.com" },
    create: { name: "Ivan", email: "ivan@yukdesain.com", passwordHash: await bcrypt.hash("fulltimeivan001", 10), roles: { set: ["DESIGNER"] }, classification: "FULL_TIME" },
    update: { name: "Ivan", passwordHash: await bcrypt.hash("fulltimeivan001", 10), classification: "FULL_TIME" },
  });
  console.log("✅ Seeded full-time:", ivan.email);

  const daffa = await prisma.user.upsert({
    where: { email: "daffa@yukdesain.com" },
    create: { name: "Daffa", email: "daffa@yukdesain.com", passwordHash: await bcrypt.hash("interndaffa002", 10), roles: { set: ["DESIGNER"] }, classification: "FULL_TIME" },
    update: { name: "Daffa", passwordHash: await bcrypt.hash("interndaffa002", 10), classification: "FULL_TIME" },
  });
  console.log("✅ Seeded full-time:", daffa.email);

  // Freelance designers
  const freelancers = [
    { email: "farih@yukdesain.com", name: "Farih", password: "freelancefarih001" },
    { email: "fia@yukdesain.com", name: "Fia", password: "freelancefia002" },
    { email: "fahmi@yukdesain.com", name: "Fahmi", password: "freelancefahmi003" },
    { email: "yasmin@yukdesain.com", name: "Yasmin", password: "freelanceyasmin004" },
  ];

  for (const f of freelancers) {
    const user = await prisma.user.upsert({
      where: { email: f.email },
      create: { name: f.name, email: f.email, passwordHash: await bcrypt.hash(f.password, 10), roles: { set: ["DESIGNER"] }, classification: "FREELANCER" },
      update: { name: f.name, passwordHash: await bcrypt.hash(f.password, 10), classification: "FREELANCER" },
    });
    console.log("✅ Seeded freelance:", user.email);
  }

  // Remove old demo users
  const oldUsers = ["owner@yukdesain.com", "rina@yukdesain.com", "budi@yukdesain.com"];
  for (const email of oldUsers) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.delete({ where: { id: existing.id } });
      console.log("🗑️ Removed old user:", email);
    }
  }
}

// Services, clients, projects
async function seedProjectData() {
  const serviceDefs = [
    { code: "SVC-01", name: "Logo Minimalis", description: "Desain logo minimalis modern untuk brand", outputFormat: "AI, PNG, SVG, PDF" },
    { code: "SVC-02", name: "Logo Ilustrasi", description: "Desain logo dengan ilustrasi custom", outputFormat: "AI, PNG, SVG, PDF" },
    { code: "SVC-03", name: "Poster Menu", description: "Desain poster menu untuk restoran/cafe", outputFormat: "AI, PDF, PNG" },
    { code: "SVC-04", name: "Banner UMKM", description: "Desain banner untuk usaha kecil menengah", outputFormat: "AI, PDF, PNG" },
    { code: "SVC-05", name: "Baliho / Spanduk Ads", description: "Desain baliho dan spanduk advertising", outputFormat: "AI, PDF, PNG" },
    { code: "SVC-06", name: "Packaging Pouch", description: "Desain packaging pouch untuk produk", outputFormat: "AI, PDF, PNG (diecut)" },
    { code: "SVC-07", name: "Packaging Box", description: "Desain packaging box untuk produk", outputFormat: "AI, PDF, PNG (diecut)" },
    { code: "SVC-08", name: "Sticker Label", description: "Desain sticker label untuk produk", outputFormat: "AI, PDF, PNG (diecut)" },
    { code: "SVC-09", name: "Frame Photobooth 4R / A3", description: "Frame photobooth untuk acara", outputFormat: "PNG, PDF (print-ready)" },
    { code: "SVC-10", name: "Paket Social Media", description: "Paket desain untuk social media (feed, story, dll)", outputFormat: "PNG, JPG (optimized web)" },
    { code: "SVC-11", name: "Paket Brand Kopi Keliling", description: "Paket lengkap branding untuk usaha kopi keliling", outputFormat: "Multiple formats" },
  ];

  const services: Record<string, string> = {};
  for (const s of serviceDefs) {
    const svc = await prisma.service.upsert({
      where: { code: s.code },
      create: s,
      update: { name: s.name, description: s.description, outputFormat: s.outputFormat },
    });
    services[s.code] = svc.id;
  }
  console.log(`✅ Seeded ${serviceDefs.length} services (idempotent)`);

  const clientDefs = [
    { name: "Cafe Nusantara", email: "cafe@nusantara.com", phone: "081234567890" },
    { name: "Toko Sebelah", email: "tokosebelah@mail.com", phone: "082345678901" },
    { name: "Warung Kopi", phone: "083456789012" },
  ];

  const clients: string[] = [];
  for (const c of clientDefs) {
    const existing = c.email
      ? await prisma.client.findFirst({ where: { email: c.email } })
      : await prisma.client.findFirst({ where: { name: c.name } });
    const client = existing
      ? await prisma.client.update({ where: { id: existing.id }, data: { name: c.name, phone: c.phone } })
      : await prisma.client.create({ data: { name: c.name, email: c.email ?? null, phone: c.phone } });
    clients.push(client.id);
  }
  console.log(`✅ Seeded ${clientDefs.length} clients (idempotent)`);

  const owner = await prisma.user.findUnique({ where: { email: "rizal@yukdesain.com" } });
  if (!owner) { console.log("⚠️ Owner not found, skipping project seed"); return; }

  // Project 1
  const existingProject1 = await prisma.project.findUnique({ where: { projectNumber: "PRJ-20261010-K7M4Q2" } });
  if (!existingProject1) {
    await prisma.project.create({
      data: {
        projectNumber: "PRJ-20261010-K7M4Q2",
        clientId: clients[0],
        clientName: clientDefs[0].name,
        serviceId: services["SVC-01"],
        ownerId: owner.id,
        agreedPrice: 2500000,
        paidAmount: 1000000,
        deadline: new Date("2026-09-28"),
        status: "BELUM_DIKERJAKAN",
        paymentStatus: "PARTIALLY_PAID",
        brief: {
          create: {
            submittedAt: new Date("2026-09-20"),
            responses: [
              { questionId: "q1", question: "Nama Brand", answer: "Logo Cafe Nusantara" },
              { questionId: "q2", question: "Deskripsi", answer: "Restoran premium nuansa modern" },
              { questionId: "q3", question: "Warna", answer: "Merah, hitam, emas" },
            ],
          },
        },
      },
    });
    console.log("✅ Created project 1 (brief submitted)");
  } else {
    console.log("✅ Project 1 already exists, skipping");
  }

  // Project 2
  const existingProject2 = await prisma.project.findUnique({ where: { projectNumber: "PRJ-20261010-P8W4X9" } });
  if (!existingProject2) {
    const ivan = await prisma.user.findUnique({ where: { email: "ivan@yukdesain.com" } });
    await prisma.project.create({
      data: {
        projectNumber: "PRJ-20261010-P8W4X9",
        clientId: clients[1],
        clientName: clientDefs[1].name,
        serviceId: services["SVC-04"],
        ownerId: owner.id,
        agreedPrice: 1500000,
        paidAmount: 1500000,
        deadline: new Date("2026-09-30"),
        status: "SEDANG_DIKERJAKAN",
        paymentStatus: "PAID",
        brief: {
          create: {
            submittedAt: new Date("2026-09-18"),
            responses: [
              { questionId: "q1", question: "Nama Brand", answer: "Banner UMKM Toko Sebelah" },
            ],
          },
        },
        ...(ivan ? {
          assignments: {
            create: {
              designerId: ivan.id,
              assignedBy: owner.id,
              assignedAt: new Date("2026-09-19"),
              freelancerPayout: 500000,
            },
          },
          updates: {
            createMany: {
              data: [
                { progress: 30, description: "Mockup awal sudah selesai", authorId: ivan.id, createdAt: new Date("2026-09-22") },
                { progress: 65, description: "Design dalam finalisasi", authorId: ivan.id, createdAt: new Date("2026-09-25") },
              ],
            },
          },
        } : {}),
        revisions: {
          create: {
            number: 1,
            description: "Mohon ubah warna background menjadi biru tua",
            requestedAt: new Date("2026-09-26"),
            status: "PENDING",
          },
        },
      },
    });
    console.log("✅ Created project 2 (sedang dikerjakan, 1 revision)");
  } else {
    console.log("✅ Project 2 already exists, skipping");
  }

  // Project 3
  const existingProject3 = await prisma.project.findUnique({ where: { projectNumber: "PRJ-20261010-T6Y2HN" } });
  if (!existingProject3) {
    const p3 = await prisma.project.create({
      data: {
        projectNumber: "PRJ-20261010-T6Y2HN",
        clientId: clients[2],
        clientName: clientDefs[2].name,
        serviceId: services["SVC-07"],
        ownerId: owner.id,
        agreedPrice: 3500000,
        paidAmount: 1000000,
        deadline: new Date("2026-10-02"),
        status: "DRAFT",
        paymentStatus: "PARTIALLY_PAID",
      },
    });

    await prisma.clientLink.upsert({
      where: { token: "abc123xyz789def0" },
      create: { token: "abc123xyz789def0", projectId: p3.id, status: "ACTIVE", expiresAt: new Date("2026-12-31") },
      update: { projectId: p3.id, status: "ACTIVE", expiresAt: new Date("2026-12-31") },
    });
    console.log("✅ Created project 3 + client link");
  } else {
    console.log("✅ Project 3 already exists, skipping");
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
