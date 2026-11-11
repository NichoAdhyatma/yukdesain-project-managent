# Provider AI dari portal (semua model)

Diputuskan owner 2026-11-11 (spec: `docs/superpowers/specs/2026-11-11-ai-provider-adapter-design.md`). Menggantikan
keputusan lama "AI = Claude, format Anthropic Messages". Halaman: **Bot AI › Model**.

## 1. Ringkasnya

- Owner menambah provider cukup dengan **nama, format API, base URL, API key**.
- Model **apa pun** boleh dipakai bila **lulus tes** yang relevan.
- Bot memakai tiga pilihan: **Chat**, **Baca bukti transfer**, **Cadangan**.
- Aturan bisnis bot (penjaga harga, batas harian/bulanan, pengalihan ke admin, AI hanya menulis draft) berlaku untuk
  model apa pun.

## 2. Format API

| Format | Contoh provider | Catatan |
|---|---|---|
| Anthropic Messages | Anthropic resmi, gateway yang meneruskan ke Claude | Diteruskan apa adanya; **prompt cache tetap jalan** (paling hemat) |
| OpenAI Chat Completions | OpenRouter, LiteLLM, DeepSeek, Groq, Gemini (mode OpenAI), Ollama | Diterjemahkan (`src/lib/ai/openai-format.ts`): tool → function, gambar → `image_url`; penanda cache dan opsi Claude dilewati |

Base URL boleh ditempel lengkap; akhiran `/chat/completions` (OpenAI) atau `/v1/messages` (Anthropic) dan garis
miring akhir dirapikan otomatis. Wajib `https://`, kecuali `http://localhost` / `http://127.0.0.1`.

## 3. Tes model

Tombol **Tes model** menjalankan tiga langkah kecil (tanpa data klien):

| Langkah | Arti | Wajib untuk |
|---|---|---|
| Koneksi | Base URL, key, dan ID model bisa dipakai | Semua |
| Tool use | Model memanggil tool (bot menyimpan brief, menandai pembayaran, dll. lewat tool) | Chat, Cadangan, Bukti transfer |
| Gambar | Model membaca gambar | Bukti transfer |

- Hasil tes disimpan per provider + model (`AiModelTest`) dan hanya sah untuk kredensial saat dites.
- **Mengganti base URL atau key provider membatalkan hasil tesnya** (tampil "Perlu dites ulang"). Bot tetap memakai
  pilihan yang sudah tersimpan, tapi model itu harus dites ulang sebelum bisa dipilih lagi.
- Pilihan pemakaian hanya menampilkan model yang lulus tes yang relevan; server menolak pilihan lain.

## 4. Pemakaian dan cadangan

- **Chat**: bot klien dan perintah owner lewat WhatsApp.
- **Baca bukti transfer**: tanpa cadangan. Kalau gagal dibaca, bukti tetap tersimpan dan admin mengecek manual.
- **Cadangan**: dipakai otomatis untuk Chat bila provider utama gagal secara teknis:
  - koneksi atau timeout;
  - HTTP 5xx, 429 (kuota), 401/403 (key ditolak);
  - key tidak bisa dibuka.

  Jawaban model yang jelek **tidak** memicu cadangan; itu tetap ditangani mekanisme lama (coba ulang, lalu alihkan
  ke admin). Owner menerima notifikasi "Provider utama gagal, memakai cadangan" paling banyak sekali per jam.
- Pilihan kosong = bawaan server: provider env lama (`waAiProvider`) dengan model pilihan / default env. Provider
  bawaan (Anthropic resmi, gateway Olagon) tetap tampil, key-nya tetap di env dan tidak bisa diubah dari portal.

## 5. Keamanan API key

- Disimpan terenkripsi AES-256-GCM (`src/lib/ai/key-crypto.ts`) dengan `AI_KEYS_SECRET` (32 byte base64) yang hanya
  ada di `shared/.env` server (`docs/DEPLOY.md` §5).
- Tidak pernah dikirim ke browser (hanya "••••abcd"), tidak ditulis ke log, hasil tes, atau pesan error; error
  provider disamarkan sebelum dicatat.
- Tanpa `AI_KEYS_SECRET`, provider tambahan tidak bisa disimpan atau dipakai; provider bawaan tetap jalan.
- Mengganti `AI_KEYS_SECRET` membuat key tersimpan tidak bisa dibuka (Chat pindah ke cadangan); isi ulang key di
  portal.
- Hanya owner yang bisa mengakses API provider (`/api/settings/whatsapp/ai-providers*`).

## 6. Kode

| Bagian | File |
|---|---|
| Enkripsi key, penyamaran | `src/lib/ai/key-crypto.ts` |
| Provider env + portal, normalisasi URL | `src/lib/ai/providers.ts` |
| Penerjemah OpenAI | `src/lib/ai/openai-format.ts` |
| `AiClient`, kegagalan teknis | `src/lib/ai/client.ts` |
| Tes model, syarat pakai | `src/lib/ai/model-tests.ts`, `src/lib/whatsapp/ai/connection-test.ts` |
| Pemakaian + cadangan | `src/lib/whatsapp/ai/ai-config.ts` (`getAiTargets`), `src/lib/ai/fallback.ts` |
| API | `src/app/api/settings/whatsapp/ai-providers/**`, `src/app/api/settings/whatsapp/models` |
| UI | `src/components/settings/ai/*` |

## 7. Langkah setelah deploy

1. Buat `AI_KEYS_SECRET` di server: `openssl rand -base64 32` ke `shared/.env`, lalu restart.
2. Bot AI › Model → **Tambah provider** (mis. OpenRouter, format OpenAI) → **Tes model** untuk model yang diinginkan.
3. Pilih model di **Pemakaian** (Chat, Bukti transfer, Cadangan) → Simpan.
4. Coba di **Uji bot**.
