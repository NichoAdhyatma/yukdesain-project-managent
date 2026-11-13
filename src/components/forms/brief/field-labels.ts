// Label isian brief untuk BriefReader, editor brief Order WA, dan form brief generik.
export const BRIEF_FIELD_LABELS: Record<string, string> = {
  brand_name: "Nama Brand / Usaha",
  tagline: "Tagline",
  business_desc: "Deskripsi Bisnis",
  colors: "Warna yang Diinginkan",
  client_notes: "Catatan Tambahan Klien",
  main_text: "Teks Utama",
  size: "Ukuran",
  style: "Gaya / Style",
  dimensions: "Dimensi",
  mandatory_info: "Informasi Wajib",
  color_concept: "Konsep Warna",
  sticker_shape: "Bentuk Sticker",
  sticker_media: "Media Cetak",
  sticker_text: "Teks Sticker",
  photobooth_size: "Ukuran Fotobooth",
  vendor_name: "Nama Vendor / Tempat",
  event_theme: "Tema Acara",
  sosmed_platform: "Platform Social Media",
  sosmed_vibe: "Vibe / Gaya",
  package_choice: "Paket yang Dipilih",
  page_count: "Jumlah Halaman",
  variant_count: "Jumlah Varian",
  pose_count: "Jumlah Pose",
};

/**
 * Label tampilan satu isian brief. Label resmi didahulukan: brief dari WhatsApp menyimpan `question` berupa kunci
 * mentah ("client notes"), sehingga desainer sempat melihat "client notes" (Yeni, 2026-11-13). Pertanyaan khusus
 * Form Link yang tidak ada di daftar tetap memakai teks pertanyaannya.
 */
export function briefFieldLabel(questionId: string, question?: string | null): string {
  return BRIEF_FIELD_LABELS[questionId] || question || questionId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
