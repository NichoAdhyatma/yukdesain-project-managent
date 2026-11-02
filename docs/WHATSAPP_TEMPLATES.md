# Message Template WhatsApp — untuk diajukan di WhatsApp Manager

Dipakai bot saat pesan dari admin (penawaran, DP terverifikasi, DP ditolak, order dibatalkan) harus dikirim
**lebih dari 24 jam** setelah pesan terakhir klien (`docs/WHATSAPP_AI_CHATBOT.md` §5.2, §13). Di dalam 24 jam,
bot mengirim teks bebas dengan isi yang sama.

Ajukan keempatnya sekarang: persetujuan Meta butuh waktu, dan selama template belum disetujui, pesan di luar
24 jam akan gagal (portal menampilkan "Pesan gagal terkirim, hubungi klien manual").

Aturan pengajuan:
- **Kategori:** Utility (bukan Marketing). Isi hanya informasi transaksi, tanpa promosi.
- **Bahasa:** Indonesian (`id`). Jika memakai kode lain, samakan env `WHATSAPP_TEMPLATE_LANG`.
- **Nama template harus persis** seperti di bawah (konstanta `WA_TEMPLATES` di `src/lib/constants/index.ts`).
- **Urutan parameter `{{1}}`, `{{2}}`, … harus persis**, karena kode mengisinya berurutan.
- Header, footer, dan tombol: tidak dipakai (kode hanya mengisi parameter body).

---

## 1. `yd_penawaran_order`

Dikirim saat admin menyimpan harga + deadline.

**Body:**

```text
Halo {{1}}, berikut penawaran untuk order {{2}} di YukDesain Studio:
Harga: {{3}}
DP 50%: {{4}}
Deadline: {{5}}

Balas pesan ini untuk menerima info rekening pembayaran DP.
```

| Parameter | Isi | Contoh untuk Meta |
|---|---|---|
| `{{1}}` | nama klien | Sari |
| `{{2}}` | nama layanan | Logo Minimalis |
| `{{3}}` | harga | Rp1.500.000 |
| `{{4}}` | DP 50% | Rp750.000 |
| `{{5}}` | deadline | 15 November 2026 |

Rekening tidak dimasukkan ke template karena jumlahnya bisa berubah. Begitu klien membalas, jendela 24 jam
terbuka dan bot mengirim rekening dari STATE.

## 2. `yd_dp_terverifikasi`

Dikirim saat admin memvalidasi DP dan project dibuat (Langkah 10).

**Body:**

```text
Halo {{1}}, pembayaran DP untuk order Anda sudah kami verifikasi. Kode project: {{2}}.

Pantau progres project di: {{3}}
```

| Parameter | Isi | Contoh untuk Meta |
|---|---|---|
| `{{1}}` | nama klien | Sari |
| `{{2}}` | kode project | PRJ-20261101-K7M4Q2 |
| `{{3}}` | link tracking | https://portal.yukdesain.com/client/abc123def456ghij |

## 3. `yd_dp_ditolak`

Dikirim saat admin menolak bukti transfer.

**Body:**

```text
Halo {{1}}, bukti transfer DP untuk order Anda belum bisa kami terima.
Alasan: {{2}}

Silakan balas pesan ini dengan bukti transfer yang sesuai.
```

| Parameter | Isi | Contoh untuk Meta |
|---|---|---|
| `{{1}}` | nama klien | Sari |
| `{{2}}` | alasan dari admin | Nominal transfer kurang dari DP |

## 4. `yd_order_dibatalkan`

Dikirim saat admin membatalkan order dari portal.

**Body:**

```text
Halo {{1}}, order Anda di YukDesain Studio dibatalkan.
Alasan: {{2}}

Balas pesan ini jika ada pertanyaan.
```

| Parameter | Isi | Contoh untuk Meta |
|---|---|---|
| `{{1}}` | nama klien | Sari |
| `{{2}}` | alasan dari admin | Klien meminta pembatalan |

---

Catatan teknis: parameter dirapikan otomatis sebelum dikirim (baris baru, tab, dan spasi beruntun diganti satu
spasi; maksimal 500 karakter), karena Meta menolak parameter yang berisi karakter tersebut. Jika nama klien
belum diketahui, `{{1}}` diisi "Kak".
