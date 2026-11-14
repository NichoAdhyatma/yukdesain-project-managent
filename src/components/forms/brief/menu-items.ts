// Tampilan daftar menu brief (BriefReader internal dan portal klien).
// Produksi 14 Nov: harga dari WhatsApp sering ditulis "15K"/"3K"; parseInt membuatnya tampil "Rp15". Item tanpa harga
// (mis. catatan "hanya nasi goreng…") membuat seluruh daftar jatuh ke tampilan JSON mentah.

const WHOLE_RUPIAH = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/;
/** Di bawah ini angka hampir pasti singkatan ("15" = 15 ribu), jadi ditampilkan apa adanya. */
const MIN_RUPIAH = 1000;

/** Harga untuk ditampilkan: angka rupiah utuh diformat "Rp15.000"; tulisan lain (15K, Rp 12.000/cup) apa adanya. */
export function menuPriceLabel(price: string | number | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const text = String(price).trim();
  if (!text) return null;
  if (WHOLE_RUPIAH.test(text)) {
    const amount = Number(text.replace(/\./g, ""));
    if (amount >= MIN_RUPIAH) return `Rp${amount.toLocaleString("id-ID")}`;
  }
  return text;
}

/** Daftar menu: item pertama punya nama (harga boleh kosong). */
export function isMenuItemList(data: unknown): data is { id?: string; name: string; price?: string | number; image?: string; caption?: string }[] {
  return Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null && "name" in data[0];
}
