// Nomor Indonesia dinormalisasi ke format wa_id Meta: "62…" tanpa "+" (§15).
// Hasil null jika bukan nomor Indonesia yang masuk akal — jangan dicocokkan ke Client.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62")) return null;
  // 62 + 8–13 digit nomor pelanggan
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

// Untuk log dan tampilan daftar: "6281****7890".
export function maskPhone(waId: string): string {
  if (waId.length <= 8) return "****";
  return `${waId.slice(0, 4)}****${waId.slice(-4)}`;
}
