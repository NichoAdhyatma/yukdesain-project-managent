# Desain: Adapter AI multi-provider (semua model, provider dari portal)

Tanggal: 2026-11-11. Status: **menunggu review owner**. Disusun dari diskusi dengan owner (sesi 2026-11-11).

## 1. Tujuan

Owner bisa menambah provider AI dari portal cukup dengan **base URL + API key**, memakai model **apa saja** (format
Anthropic Messages atau OpenAI Chat Completions), dan memastikan model layak dipakai lewat tombol **Tes model**.

Berhasil kalau:

1. Mengganti provider/model bot cukup dari portal, tanpa deploy dan tanpa mengubah env.
2. Model yang belum lulus tes yang relevan tidak bisa dipakai bot.
3. Kalau provider utama gagal secara teknis, klien tetap dibalas lewat provider cadangan.
4. Tidak ada perilaku yang berubah sampai owner memilih provider baru (provider env yang sekarang tetap jadi bawaan).

## 2. Keputusan owner (2026-11-11)

| Topik | Keputusan |
|---|---|
| Cakupan model | **Semua model**: format Anthropic Messages dan OpenAI Chat Completions. Mengganti keputusan lama "AI = Claude, format Anthropic Messages" (`ai-config.ts`, `docs/WHATSAPP_AI_CHATBOT.md`). |
| Kegagalan provider | **Provider cadangan**: dipakai otomatis saat provider Chat gagal secara teknis. |
| Syarat pakai | **Wajib lulus tes** yang relevan sebelum model bisa dipilih. |
| Pendekatan | **Adapter di dalam aplikasi**; format internal tetap Anthropic. Bukan library multi-provider, bukan proxy terpisah. |

Tetap: aturan bisnis bot tidak berubah (penjaga harga, batas harian/bulanan, pengalihan ke admin, AI hanya menulis
draft). Model apa pun tunduk pada penjaga yang sama.

## 3. Kondisi sekarang (dari kode)

- AI dipanggil di tiga tempat, semuanya `client.messages.create` (SDK Anthropic):
  - `src/lib/whatsapp/ai/conversation.ts` (bot klien: tools, gambar, `cache_control`);
  - `src/lib/whatsapp/ai/owner-conversation.ts` (perintah owner via WA: tools, `cache_control`);
  - `src/lib/whatsapp/ai/extract-payment-proof.ts` (bukti transfer: gambar + tool, model ekstraksi).
- `ai-config.ts`: provider tetap `ANTHROPIC` | `GATEWAY`, key dan base URL dari env (`ANTHROPIC_*`, `AI_GATEWAY_*`),
  model dipilih owner di `StudioSettings` (`waAiProvider`, `waAiModel`, `waAiExtractionModel`,
  `waAiGatewayModel`, `waAiGatewayExtractionModel`). `aiModelSchema` hanya menerima `claude-…`.
- `connection-test.ts` (`testAiConnection`) sudah mengecek **Tool use** dan **Gambar**; `model-list.ts` mengambil
  daftar model dari provider. UI di Bot AI › tab Model.
- `model-profile.ts`: opsi khusus Claude (`output_config.effort`) per keluarga model.
- Tidak ada utilitas enkripsi di kode.

## 4. Bagian 1: data dan tampilan

### 4.1 Tabel baru (aditif)

`AiProvider`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String cuid | |
| `name` | String ≤60 | Nama tampilan, mis. "OpenRouter" |
| `format` | String `ANTHROPIC` \| `OPENAI` | Format API |
| `baseUrl` | String https | Tanpa garis miring akhir. OPENAI: URL yang `…/chat/completions`-nya dipanggil (mis. `https://openrouter.ai/api/v1`) |
| `apiKeyCiphertext` | String | AES-256-GCM (`iv.tag.ciphertext`, base64) |
| `apiKeyLast4` | String | Untuk tampilan "••••abcd" |
| `createdById` | String | User owner |
| `createdAt` / `updatedAt` | DateTime | |

`AiModelTest`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String cuid | |
| `providerKey` | String | `env:ANTHROPIC`, `env:GATEWAY`, atau id `AiProvider` |
| `model` | String ≤120 | ID model |
| `connectionOk` / `toolsOk` / `imageOk` | Boolean | |
| `details` | Json | Pesan per langkah (sudah disamarkan) |
| `testedAt` | DateTime | |
| `credentialVersion` | String | Hash pendek (base URL + `updatedAt` provider). Tes batal bila berbeda dari provider sekarang |

`StudioSettings` (kolom baru, nullable; `null` = perilaku sekarang dari `waAiProvider` dan kolom lama):
`aiChatProviderKey`, `aiChatModel`, `aiProofProviderKey`, `aiProofModel`, `aiFallbackProviderKey`, `aiFallbackModel`.

### 4.2 Provider bawaan

Provider env tetap ada sebagai `env:ANTHROPIC` dan `env:GATEWAY` (key tetap di env, tidak bisa diedit di portal,
format ANTHROPIC). Selama kolom baru `null`, `getAiConfig` memakai jalur lama, jadi tidak ada yang berubah setelah
deploy.

### 4.3 Syarat pakai (server)

| Pemakaian | Tes yang wajib lulus (pada `credentialVersion` sekarang) |
|---|---|
| Chat (bot klien + perintah owner) | koneksi + tool |
| Baca bukti transfer | koneksi + tool + gambar |
| Cadangan | koneksi + tool |

Ditolak di API simpan pengaturan dengan pesan per field. Mengubah base URL atau key provider membatalkan semua tesnya.
Provider yang sedang dipakai di salah satu pemakaian tidak bisa dihapus.

### 4.4 Tampilan (Bot AI › tab Model, menggantikan pilihan provider sekarang)

- Daftar provider: bawaan (env) + buatan owner. Tambah/edit/hapus; key hanya bisa diganti, tampil "••••abcd".
- Per provider: **Ambil daftar model** (bila tersedia), isian ID model manual, tombol **Tes model** dengan hasil per
  langkah (Koneksi / Tool / Gambar, ✓ / ✗ + alasan singkat) dan waktu tes.
- Tiga pilihan pemakaian; pilihan model hanya dari hasil tes yang lulus untuk pemakaian itu.
- State: memuat, kosong (belum ada provider tambahan), galat; mobile 375px. UI/UX Pro Max sebelum, `/antislop` sesudah.

## 5. Bagian 2: adapter dan cadangan

### 5.1 Antarmuka

```ts
interface AiClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}
getAiClient(target: { providerKey: string; model: string }): Promise<AiClient>
```

Ketiga titik panggilan mengganti `getAnthropicClient(config).messages.create(...)` dengan `AiClient.create(...)`.
Putaran tool, penjaga, dan percobaan ulang yang ada tidak berubah.

### 5.2 Adapter ANTHROPIC

SDK Anthropic dengan `baseURL` dan `apiKey` provider. `cache_control` dan opsi model diteruskan apa adanya.

### 5.3 Adapter OPENAI (`POST {baseUrl}/chat/completions`, `Authorization: Bearer <key>`)

Request:

| Anthropic | OpenAI |
|---|---|
| `system` (string / blok teks) | pesan `{ role: "system" }` (blok digabung) |
| `tools[]` (`name`, `description`, `input_schema`) | `tools[]` `{ type: "function", function: { name, description, parameters } }` |
| `tool_choice` auto / none | `"auto"` / `"none"` |
| blok `tool_use` (assistant) | `tool_calls[]` (`id`, `function.name`, `function.arguments` JSON string) |
| blok `tool_result` (user) | pesan `{ role: "tool", tool_call_id, content }` (satu per hasil, `is_error` diberi awalan "Error: ") |
| blok `image` base64 | `{ type: "image_url", image_url: { url: "data:<mime>;base64,…" } }` |
| `max_tokens` | `max_tokens` |
| `cache_control`, `output_config` | dilewati |

Respons:

| OpenAI | Anthropic |
|---|---|
| `message.content` | blok `text` |
| `message.tool_calls[]` | blok `tool_use` (`input` = JSON hasil parse; parse gagal → `{}` dan dicatat) |
| `finish_reason` `tool_calls` / `length` / `stop` / `content_filter` | `stop_reason` `tool_use` / `max_tokens` / `end_turn` / `refusal` |
| `usage.prompt_tokens` / `completion_tokens` | `usage.input_tokens` / `output_tokens` |

Error HTTP dipetakan ke `AiProviderError { status, retriable }`.

### 5.4 Opsi per model

`modelRequestOptions` hanya mengembalikan opsi Claude untuk format ANTHROPIC dengan ID `claude-…`. `aiModelSchema`
menerima ID model umum (`^[A-Za-z0-9][A-Za-z0-9._:/@-]{1,119}$`).

### 5.5 Cadangan

- Hanya untuk **Chat** (bot klien dan perintah owner). Bukti transfer tidak memakai cadangan (gagal baca = bukti tetap
  tersimpan, admin mengecek manual, seperti sekarang).
- Pindah ke cadangan bila provider Chat gagal **teknis**: koneksi/timeout, HTTP 5xx, 429, 401/403, atau key tidak bisa
  didekripsi. Request yang sama dikirim ulang ke cadangan dalam giliran yang sama.
- **Tidak** pindah untuk jawaban jelek (teks rusak, tool palsu): tetap mekanisme sekarang (`AI_ATTEMPTS`, lalu admin).
- Notifikasi owner "Provider utama gagal, memakai cadangan" (kejadian Chat menunggu admin), paling banyak sekali per
  jam, berisi nama provider dan status singkat.
- Cadangan juga gagal → perilaku sekarang (pesan sibuk + alihkan ke admin).

### 5.6 Keamanan

- Key didekripsi hanya di server saat memanggil provider; tidak pernah ada di respons API, log, atau hasil tes.
- Pesan error provider disamarkan (pola `sk-…`, `Bearer …`, dan key provider itu sendiri) sebelum disimpan/ditampilkan.
- Kunci enkripsi `AI_KEYS_SECRET` (32 byte acak, base64) hanya di env server, dibuat langsung di server.
- API provider dan pengaturan pemakaian khusus owner (`OWNER_ONLY_API` + cek `activeRole === "OWNER"`), validasi Zod.

## 6. Bagian 3: pengujian, migrasi, dokumen

### 6.1 Tes otomatis

- Penerjemah OPENAI: request (sistem, tools, tool_choice none, tool_use + tool_result berurutan, beberapa tool sekaligus,
  gambar) dan respons (teks, tool_calls, argumen JSON rusak, tiap `finish_reason`, usage).
- Enkripsi: bolak-balik; kunci salah → gagal; DTO provider tidak pernah memuat key/ciphertext.
- Syarat pakai: model belum lulus / tes batal (`credentialVersion` beda) ditolak; ganti key membatalkan tes.
- Cadangan: 5xx/timeout/429/401 pindah; jawaban jelek tidak; notifikasi maks 1 per jam.
- Tes bot yang ada tetap lulus tanpa perubahan perilaku.

### 6.2 Uji nyata sebelum merge (dengan izin owner)

Satu provider ANTHROPIC dan satu OPENAI (mis. OpenRouter) dengan key owner yang dimasukkan lewat terminal tersembunyi /
form portal di dev, lalu Tes model dan satu percakapan Uji bot per provider.

### 6.3 Migrasi

Tabel/kolom baru aditif (`db push`). Kolom pemakaian `null` = jalur lama. `AI_KEYS_SECRET` dibuat acak di server dan
ditaruh di `shared/.env` (`docs/DEPLOY.md`). Tanpa `AI_KEYS_SECRET`, fitur provider tambahan nonaktif dengan pesan jelas,
provider env tetap jalan.

### 6.4 Dokumen

- Baru: `docs/AI_PROVIDERS.md` (cara menambah provider, arti tiap tes, cadangan, keamanan key).
- BRD dan `docs/WHATSAPP_AI_CHATBOT.md`: keputusan "AI = Claude saja" diganti "semua model yang lulus tes"
  (2026-11-11).

## 7. Di luar lingkup

- Streaming jawaban.
- Format selain Anthropic Messages dan OpenAI Chat Completions (mis. Gemini native, OpenAI Responses API).
- Cadangan untuk bukti transfer.
- Memilih provider per percakapan / A-B test model.
- Biaya per provider di dashboard.
