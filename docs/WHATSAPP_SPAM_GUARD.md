# Perlindungan Spam dan Hemat Token Bot WhatsApp

Tambahan untuk `docs/WHATSAPP_AI_CHATBOT.md` §17 (batas bot). Disetujui dan diimplementasikan 2026-11-07
(checkpoint 052).

## 1. Keputusan owner (2026-11-07)

1. Dikerjakan keempatnya: gabung pesan beruntun, rem bulanan, abaikan basa-basi setelah brief, blokir nomor +
   potong teks panjang.
2. **Batas balasan bot per nomor per hari tetap 80**: bot memang disiapkan menggantikan admin.

Yang sudah ada tetap berlaku: banjir 20 pesan/5 menit (naik dari 10 pada 2026-11-12: jawaban brief yang cepat sempat terpotong), 20 gambar tersimpan per order (sejak 2026-11-13 hanya gambar yang benar-benar tersimpan yang dihitung; pesan batas gambar paling banyak sekali per 10 menit per chat dan admin dipanggil lewat notifikasi, setelah kasus Mif: 12 foto sekaligus → 12 pesan batas dalam 8 detik), 5 bukti transfer, 5 salah kode per jam,
banner 800 pesan keluar per bulan.

## 2. Gabung pesan beruntun

- Setelah pesan klien masuk, bot **menunggu 5 detik**. Jika dalam waktu itu klien mengirim pesan lagi, giliran pesan
  lama dibatalkan dan hanya pesan terakhir yang dibalas, dengan membaca semua pesan yang belum dibalas.
- Contoh: "halo" / "kak" / "mau tanya logo" dalam beberapa detik → 1 panggilan AI dan 1 balasan.
- Berlaku untuk chat klien. Chat owner tidak digabung: owner bisa menulis "YA" lalu langsung "makasih", dan
  konfirmasi YA tidak boleh terlewat. Uji bot tidak menunggu (owner sedang mencoba).

## 3. Rem bulanan

- Owner mengatur **batas balasan bot per bulan** di Settings › WhatsApp › Pemakaian. Default **2.000**.
- Jika tercapai: bot berhenti membalas otomatis untuk semua nomor sampai awal bulan berikutnya (WIB). Pesan tetap
  tersimpan dan muncul di Order WA; admin bisa membalas manual seperti biasa (balasan admin tidak dihitung).
- Klien yang menulis saat rem aktif menerima **satu** pesan per percakapan: "Pesan kakak sudah kami terima. Admin
  kami akan membalas secepatnya ya." lalu percakapan pindah ke mode admin.
- Owner diberi tahu sekali saat rem aktif: banner merah di portal, dan pesan WhatsApp ke nomor owner jika terdaftar.
- Perkiraan biaya terburuk dengan batas 2.000: ±Rp357.000 pesan Meta + ±Rp20.000 AI per bulan.

## 4. Abaikan basa-basi setelah brief

- Hanya saat order **sudah dikonfirmasi** (status Perlu harga, Verifikasi DP, atau Jadi project).
- Pesan yang isinya hanya basa-basi tidak dibalas dan tidak memanggil AI: "ok", "oke", "sip", "siap", "baik",
  "noted", "makasih", "terima kasih", "thanks", "mantap", emoji, atau tanda baca saja (maks ±25 karakter).
- Pesan berisi pertanyaan atau permintaan tetap dibalas.
- **Tidak berlaku** saat brief dikumpulkan atau saat menunggu DP, karena di sana "ok" bisa berarti setuju
  (konfirmasi brief, setuju penawaran) dan harus diproses bot.

## 5. Blokir nomor

- Tombol **Blokir nomor** di detail Order WA (owner dan admin). Nomor yang diblokir: pesan tetap tersimpan untuk
  arsip, tetapi bot tidak membalas, tidak ada panggilan AI, dan tidak memunculkan tanda "perlu tindakan".
- Label **Diblokir** dan tombol **Buka blokir**. Tercatat di Activity History.
- Nomor owner tidak bisa diblokir.

## 6. Potong teks panjang

- Pesan klien lebih dari **2.000 karakter** dipotong saat dikirim ke AI, dengan catatan bahwa pesan dipotong.
  Teks lengkap tetap tersimpan dan terlihat admin di Order WA.

## 7. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Schema (additive) | `StudioSettings.waBotMonthlyReplyCap Int @default(2000)`, `waBotCapNotifiedMonth String?`; `WaConversation.blockedAt DateTime?`, `blockedById String?` |
| Bot | `handleInboundMessage`: blokir → berhenti; jeda 5 detik lalu cek pesan lebih baru; rem bulanan; basa-basi setelah brief |
| AI | `buildMessages` memotong teks masuk > 2.000 karakter |
| API | `PUT /api/settings/whatsapp` menerima `monthlyReplyCap` (owner); `POST /api/wa-intakes/[id]/block` blokir / buka blokir |
| UI | Pemakaian: kolom batas bulanan + status rem; Order WA: tombol Blokir / Buka blokir, label Diblokir |
| Konstanta | `WA_RATE_LIMITS`: `debounceMs 5000`, `inboundMaxCharsForAi 2000`, `monthlyReplyCapDefault 2000` |
| Tes | jeda + pesan lebih baru, rem (tepat di batas, satu pesan per percakapan, notifikasi sekali), basa-basi per status, blokir, pemotongan |

## 8. Catatan implementasi

- Modul: `src/lib/whatsapp/spam-guard.ts` (`waitForBurst`, `isSmallTalk`, `trimForAi`, `getMonthlyBrake`,
  `notifyOwnersBrakeOnce`). Urutan di `handleInboundMessage`: blokir → owner → saklar bot → mode admin → rem bulanan →
  banjir pesan → kata kunci admin → gambar (tetap disimpan) → pesan lebih baru → basa-basi → batas harian → AI.
- Jeda 5 detik ada di webhook (Meta: sekali per batch pesan; Fonnte: per pesan), sebelum bot dipanggil. Pengecekan
  "ada pesan lebih baru" yang sudah ada lalu menghentikan giliran lama; gambar tetap disimpan dulu karena giliran
  berikutnya membutuhkannya.
- Rem bulanan memakai hitungan yang sama dengan kartu Pemakaian (`botReplies`): balasan bot ke percakapan non-uji yang
  tidak gagal. Pesan pemberitahuan ke owner hanya teks biasa (tanpa template berbayar); di Meta hanya terkirim jika
  owner masih dalam jendela 24 jam, banner di portal selalu tampil (`UsageWarning`, juga di Order WA).
- Blokir hanya bisa dari detail Order WA (nomor yang sudah punya order). Nomor spam tanpa order tetap dibatasi
  banjir pesan, batas harian, dan rem bulanan. Hitungan "perlu tindakan" tidak diubah (berdasarkan status order).
- Batas bulanan: 50 sampai 100.000 (`WA_RATE_LIMITS.monthlyReplyCapMax`).
