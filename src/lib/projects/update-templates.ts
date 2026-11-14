// Template pesan update progres untuk desainer (teks dari owner, 2026-11-14). Tombol pintas di form update progres
// mengisi kolom catatan; desainer tetap bisa menyunting sebelum mengirim. Catatan ini tampil di portal klien dan ikut
// kabar WhatsApp ke klien.

export type UpdateTemplate = {
  id: "process" | "draft" | "revision-1" | "revision-2" | "revision-3" | "final";
  label: string;
  text: string;
  /** Template hasil akhir: form beralih ke kirim hasil akhir (progres 100%). */
  final?: boolean;
};

export const UPDATE_TEMPLATES: UpdateTemplate[] = [
  {
    id: "process",
    label: "Proses Pengerjaan",
    text: "Halo Kak! Pesanan desain Kakak saat ini sedang kami proses untuk tahap layouting dan pengerjaan ya. Mohon ditunggu untuk update selanjutnya. Terima kasih atas kesabarannya! 😊",
  },
  {
    id: "draft",
    label: "Draft Awal Siap Direview",
    text: [
      "Halo Kak! Berikut kami kirimkan progress draft awal desain sesuai dengan konsep dan brief yang telah Kakak berikan.",
      "",
      "Silakan dicek terlebih dahulu ya, Kak. Apabila ada bagian yang ingin diperbaiki, Kakak bisa klik tombol Minta Revisi yang sudah tersedia di portal.",
      "",
      "Sebagai informasi, Kakak mendapatkan free 3x revisi. 😊",
    ].join("\n"),
  },
  {
    id: "revision-1",
    label: "Hasil Revisi Pertama",
    text: [
      "Halo Kak! Berikut kami kirimkan hasil revisi pertama dari desain Kakak ya. Silakan dicek kembali apakah sudah sesuai dengan yang diharapkan.",
      "",
      "Apabila masih ada bagian yang ingin disesuaikan, Kakak masih memiliki 2x kesempatan revisi gratis lagi. Terima kasih! 😊",
    ].join("\n"),
  },
  {
    id: "revision-2",
    label: "Hasil Revisi Kedua",
    text: [
      "Halo Kak! Berikut kami kirimkan hasil revisi kedua sesuai dengan masukan yang telah diberikan sebelumnya.",
      "",
      "Silakan dicek kembali ya, Kak. Apabila masih ada penyesuaian, Kakak masih memiliki 1x kesempatan revisi gratis lagi.",
      "",
      "Terima kasih! 😊",
    ].join("\n"),
  },
  {
    id: "revision-3",
    label: "Hasil Revisi Ketiga – Final",
    text: [
      "Halo Kak! Berikut kami kirimkan hasil revisi ketiga sekaligus hasil revisi terakhir dari jatah revisi gratis pesanan Kakak.",
      "",
      "Mohon diperiksa kembali dengan teliti ya, Kak. Sebagai informasi, jatah 3x revisi gratis telah digunakan seluruhnya.",
      "",
      "Terima kasih sudah mempercayakan kebutuhan desain Kakak kepada Yukdesain! Semoga hasilnya sesuai harapan. 😊",
    ].join("\n"),
  },
  {
    id: "final",
    label: "Desain Selesai – File Final",
    final: true,
    text: [
      "Halo Kak! Berikut kami kirimkan file final dari pesanan desain Kakak.",
      "",
      "Terima kasih sudah mempercayakan kebutuhan desainnya kepada Yukdesain! Mohon maaf apabila selama proses pengerjaan terdapat kekurangan atau hal yang kurang berkenan.",
      "",
      "Semoga hasil desainnya sesuai dengan harapan Kakak. Sampai bertemu di project selanjutnya! 😊",
    ].join("\n"),
  },
];

/**
 * Isi catatan setelah memilih template: kosong atau berisi template lain → diganti; ketikan desainer sendiri tidak
 * dihapus, template ditambahkan di bawahnya.
 */
export function applyTemplate(current: string, templateText: string): string {
  const trimmed = current.trim();
  if (!trimmed || UPDATE_TEMPLATES.some((t) => t.text === trimmed)) return templateText;
  return `${trimmed}\n\n${templateText}`;
}
