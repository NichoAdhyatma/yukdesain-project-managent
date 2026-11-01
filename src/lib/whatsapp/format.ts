// Format angka & tanggal untuk pesan WhatsApp dan STATE (rupiah utuh, zona WIB).

export const formatRupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export const formatTanggal = (d: Date) =>
  d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
