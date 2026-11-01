// YukDesain Studio Portal - Domain Constants

import type { Service, ProjectStatus } from "@/types";

// ===== SERVICE CATALOG =====

export const SERVICES: Service[] = [
  {
    id: "svc-01",
    code: "SVC-01",
    name: "Logo Minimalis",
    description: "Desain logo minimalis modern untuk brand",
    outputFormat: "AI, PNG, SVG, PDF",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-02",
    code: "SVC-02",
    name: "Logo Ilustrasi",
    description: "Desain logo dengan ilustrasi custom",
    outputFormat: "AI, PNG, SVG, PDF",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-03",
    code: "SVC-03",
    name: "Poster Menu",
    description: "Desain poster menu untuk restoran/cafe",
    outputFormat: "AI, PDF, PNG",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-04",
    code: "SVC-04",
    name: "Banner UMKM",
    description: "Desain banner untuk usaha kecil menengah",
    outputFormat: "AI, PDF, PNG",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-05",
    code: "SVC-05",
    name: "Baliho / Spanduk Ads",
    description: "Desain baliho dan spanduk untuk advertising",
    outputFormat: "AI, PDF, PNG",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-06",
    code: "SVC-06",
    name: "Packaging Pouch",
    description: "Desain packaging pouch untuk produk",
    outputFormat: "AI, PDF, PNG (diecut)",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-07",
    code: "SVC-07",
    name: "Packaging Box",
    description: "Desain packaging box untuk produk",
    outputFormat: "AI, PDF, PNG (diecut)",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-08",
    code: "SVC-08",
    name: "Sticker Label",
    description: "Desain sticker label untuk produk",
    outputFormat: "AI, PDF, PNG (diecut)",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-09",
    code: "SVC-09",
    name: "Frame Photobooth 4R / A3",
    description: "Frame photobooth untuk acara",
    outputFormat: "PNG, PDF (print-ready)",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-10",
    code: "SVC-10",
    name: "Paket Social Media",
    description: "Paket desain untuk social media (feed, story, dll)",
    outputFormat: "PNG, JPG (optimized web)",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "svc-11",
    code: "SVC-11",
    name: "Paket Brand Kopi Keliling",
    description: "Paket lengkap branding untuk usaha kopi keliling",
    outputFormat: "Multiple formats sesuai kebutuhan",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ===== KANBAN STATUS =====

export const KANBAN_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: "BELUM_DIKERJAKAN", label: "Belum Dikerjakan", color: "var(--status-color)" },
  { status: "SEDANG_DIKERJAKAN", label: "Sedang Dikerjakan", color: "var(--status-color)" },
  { status: "SELESAI", label: "Selesai", color: "var(--status-color)" },
];

// ===== PRIORITY =====

export const PRIORITIES = [
  { value: "LOW", label: "Rendah", color: "text-blue-600" },
  { value: "NORMAL", label: "Normal", color: "text-gray-600" },
  { value: "HIGH", label: "Tinggi", color: "text-orange-600" },
  { value: "URGENT", label: "Urgent", color: "text-red-600" },
] as const;

// ===== REVISION =====

export const MAX_REVISION_QUOTA = 3;

export const REVISION_NOTICE =
  "Mohon diisi revisi sebaik mungkin karena akan terhitung 1x jika kamu hanya input tidak lengkap";

// ===== TOKEN =====

export const TOKEN_LENGTH = 16;
export const TOKEN_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// ===== PAGINATION =====

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ===== FILE UPLOAD =====

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf"];
export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// ===== STUDIO DEFAULTS =====
export const STUDIO_DEFAULTS = {
  name: "YukDesain Studio",
  tagline: "Creative Design Agency",
  email: "hello@yukdesain.com",
  phone: "",
  address: "Jakarta, Indonesia",
} as const;

// ===== CURRENCY =====

export const CURRENCY_SYMBOL = "Rp";
export const CURRENCY_LOCALE = "id-ID";

// ===== WHATSAPP ORDER INTAKE (docs/WHATSAPP_AI_CHATBOT.md §2) =====

// DP untuk order via WhatsApp: persentase dari harga yang diisi admin.
export const DP_PERCENT = 50;

// Batas bukti transfer per order WA; lewat dari ini percakapan dialihkan ke admin (§17).
export const WA_MAX_PAYMENT_PROOFS_PER_INTAKE = 5;

// Message template WhatsApp (kategori Utility, bahasa id) untuk pesan di luar
// jendela 24 jam. Isi template: docs/WHATSAPP_TEMPLATES.md. Urutan parameter wajib sama.
export const WA_TEMPLATES = {
  OFFER: "yd_penawaran_order", // nama, layanan, harga, DP, deadline
  DP_VERIFIED: "yd_dp_terverifikasi", // nama, kode project, link tracking
  DP_REJECTED: "yd_dp_ditolak", // nama, alasan
  CANCELLED: "yd_order_dibatalkan", // nama, alasan
} as const;
