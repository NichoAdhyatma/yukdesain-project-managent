# Adapter AI Multi-Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner menambah provider AI (format Anthropic atau OpenAI) dari portal dengan base URL + API key, mengetes model, dan memilih model untuk Chat, Bukti transfer, dan Cadangan; bot memakai pilihan itu tanpa deploy.

**Architecture:**
- Format internal tetap Anthropic Messages. `AiClient.create(params)` menerima dan mengembalikan tipe SDK Anthropic.
- Ada dua implementasi `AiClient`:
  - ANTHROPIC: SDK langsung.
  - OPENAI: penerjemah murni + `fetch` ke `/chat/completions`.
- Provider bawaan dari env (`env:ANTHROPIC`, `env:GATEWAY`) dan provider dari DB disatukan oleh satu resolver.
- Pemakaian Chat / Bukti / Cadangan disimpan di `StudioSettings`. Kolom `null` berarti jalur lama.

**Tech Stack:** Next.js 16 App Router, Prisma (`db push`, aditif), Zod, `@anthropic-ai/sdk`, Node `crypto` (AES-256-GCM), TanStack Query, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-11-ai-provider-adapter-design.md`

## Global Constraints

- **Schema hanya aditif:** tabel baru, kolom baru nullable, tanpa `@unique` di tabel lama, tanpa menghapus kolom lama (`waAiProvider`, `waAiModel`, …).
- **Tanpa dependency baru.** OpenAI dipanggil dengan `fetch`.
- **API key:**
  - tidak pernah ada di respons API, log, `AiModelTest.details`, atau pesan error;
  - di UI hanya tampil `••••` + 4 karakter terakhir.
- **`AI_KEYS_SECRET`:**
  - 32 byte acak, base64, di env server;
  - kalau tidak ada: provider DB tidak bisa dibuat atau dipakai, dengan pesan "Kunci enkripsi AI_KEYS_SECRET belum diatur di server"; provider env tetap jalan.
- **Format provider:** `ANTHROPIC` | `OPENAI`.
  - `baseUrl` wajib `https://`, kecuali `http://localhost` dan `http://127.0.0.1`;
  - garis miring di akhir dibuang, begitu juga akhiran `/chat/completions` (OPENAI) atau `/v1/messages` (ANTHROPIC).
- **ID model:** `^[A-Za-z0-9][A-Za-z0-9._:/@-]{1,119}$`.
- **Syarat pakai:**
  - Chat dan Cadangan: tes koneksi + tool lulus;
  - Bukti transfer: koneksi + tool + gambar lulus;
  - hasil tes hanya sah kalau `credentialVersion`-nya sama dengan provider sekarang.
- **Cadangan:**
  - hanya untuk Chat (bot klien dan perintah owner);
  - dipicu oleh kegagalan teknis saja: jaringan/timeout, HTTP 5xx, 429, 401, 403, atau key gagal didekripsi;
  - notifikasi `NEEDS_ADMIN` berjudul "Provider utama gagal, memakai cadangan", paling banyak sekali per jam.
- **Provider env:**
  - key dan base URL tetap dari env dan tidak bisa diedit atau dihapus di portal;
  - `providerKey` provider env adalah `env:ANTHROPIC` / `env:GATEWAY`, provider DB adalah `db:<id>`.
- **Akses:** API di bawah `/api/settings/whatsapp/` (sudah `OWNER_ONLY_API`), dan route tetap mengecek `user.activeRole === "OWNER"`.
- **UI:**
  - teks bahasa Indonesia, tanpa em dash;
  - UI/UX Pro Max sebelum, `/antislop` sesudah (CLAUDE.md).

## Review Focus

1. **Owner mengganti key atau base URL provider yang sedang dipakai Chat.**
   - Yang diharapkan: bot tetap jalan dengan kredensial baru.
   - Pilihan pemakaian di UI menandai "perlu dites ulang".
   - Hasil tes lama tidak lagi dianggap sah untuk memilih ulang.
   - Tes di Task 5.
2. **`AI_KEYS_SECRET` hilang atau berganti setelah provider DB dipakai Chat.**
   - Yang diharapkan: dekripsi gagal dihitung sebagai kegagalan teknis, sehingga bot pindah ke cadangan, bukan crash.
   - Tes di Task 6.
3. **Base URL ditempel lengkap** (`https://openrouter.ai/api/v1/chat/completions/`).
   - Yang diharapkan: dinormalkan ke `https://openrouter.ai/api/v1`, dan request ke `…/v1/chat/completions` (bukan dobel).
   - Tes di Task 2.
4. **Riwayat percakapan berisi pesan user yang memuat hasil tool sekaligus teks/gambar,** serta assistant dengan teks + beberapa tool_use.
   - Yang diharapkan: urutan pesan OpenAI tetap sah. Pesan `tool` muncul tepat setelah assistant `tool_calls`, lalu sisa konten user menjadi pesan user terpisah.
   - Tes di Task 3.
5. **Owner menghapus provider yang sedang dipakai** (Chat / Bukti / Cadangan).
   - Yang diharapkan: ditolak 409 dengan pesan yang menyebut pemakaiannya.
   - Tes di Task 7.

---

### Task 1: Enkripsi API key + penyamaran rahasia

**Files:**
- Create: `src/lib/ai/key-crypto.ts`
- Test: `src/lib/ai/key-crypto.test.ts`

**Interfaces:**
- Produces:
  - `class KeyCryptoUnavailableError extends Error`
  - `isKeyCryptoReady(): boolean`
  - `encryptApiKey(plain: string): { ciphertext: string; last4: string }`: format `ciphertext` adalah `base64(iv).base64(tag).base64(data)`, dengan IV 12 byte.
  - `decryptApiKey(ciphertext: string): string`: melempar `KeyCryptoUnavailableError` bila secret tidak ada atau salah.
  - `maskSecrets(text: string, extraSecrets?: string[]): string`: menyamarkan `sk-…`, `Bearer …`, dan setiap string di `extraSecrets` (panjang minimal 6) menjadi `***`.

- [ ] **Step 1: Tulis tes yang gagal**
  - Bolak-balik: `decryptApiKey(encryptApiKey("sk-or-v1-abcdef123456").ciphertext)` mengembalikan string yang sama, dan `last4 === "3456"`.
  - Dua kali enkripsi menghasilkan ciphertext berbeda (IV acak).
  - Mengganti `process.env.AI_KEYS_SECRET` setelah enkripsi membuat `decryptApiKey` melempar `KeyCryptoUnavailableError`.
  - Tanpa secret: `isKeyCryptoReady() === false`, dan `encryptApiKey` melempar.
  - `maskSecrets("401: invalid key sk-or-v1-abc Bearer xyz123", ["mykey123"])` tidak memuat `sk-or-v1-abc` maupun `xyz123`.
- [ ] **Step 2: Jalankan tes, pastikan gagal.** Run: `npx vitest run src/lib/ai/key-crypto.test.ts`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan**
  - Pakai `node:crypto` `aes-256-gcm`.
  - Secret: `Buffer.from(process.env.AI_KEYS_SECRET, "base64")`; harus 32 byte, kalau tidak dianggap tidak siap.
- [ ] **Step 4: Jalankan tes, pastikan lulus.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: enkripsi API key provider AI`

### Task 2: Schema + resolver provider

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/ai/providers.ts`
- Test: `src/lib/ai/providers.test.ts`

**Interfaces:**
- Consumes: `encryptApiKey`, `decryptApiKey` (Task 1); `getProviderEnv(provider)` dan `getAiEnv()` dari `src/lib/whatsapp/env.ts`.
- Produces:
  - `type ProviderFormat = "ANTHROPIC" | "OPENAI"`
  - `type ProviderSummary = { key: string; name: string; format: ProviderFormat; baseUrl: string; keyHint: string | null; builtIn: boolean; credentialVersion: string; configured: boolean }`. `keyHint` adalah `"••••abcd"`.
  - `type ResolvedProvider = Omit<ProviderSummary, "keyHint" | "configured"> & { apiKey: string }`
  - `normalizeBaseUrl(url: string, format: ProviderFormat): string`
  - `providerInputSchema`: Zod `{ name: string 1..60, format: enum, baseUrl: string, apiKey?: string 8..400 }`. `apiKey` wajib saat membuat; saat edit, kosong berarti tidak diubah.
  - `aiModelIdSchema`: regex dari Global Constraints.
  - `listProviders(): Promise<ProviderSummary[]>`: provider env dulu, lalu DB urut `createdAt`.
  - `resolveProvider(key: string): Promise<ResolvedProvider>`: melempar `AiProviderUnavailableError` kalau tidak ditemukan, key env kosong, atau dekripsi gagal.
  - `class AiProviderUnavailableError extends Error { providerKey: string }`
  - `credentialVersionOf(p: { baseUrl: string; updatedAt: Date | null; key: string }): string`: 12 karakter pertama dari sha256 `key|baseUrl|updatedAt`. Provider env memakai `updatedAt = null` dan memasukkan `last4` key env ke hash, supaya mengganti key env juga membatalkan tes.

- [ ] **Step 1: Tambah schema**
  - Model `AiProvider` dan `AiModelTest` persis sesuai spec §4.1 (`@@map("ai_providers")`, `@@map("ai_model_tests")`, `@@index([providerKey, model])`).
  - Kolom baru di `StudioSettings`: `aiChatProviderKey String?`, `aiChatModel String?`, `aiProofProviderKey String?`, `aiProofModel String?`, `aiFallbackProviderKey String?`, `aiFallbackModel String?`.
  - Run: `npx prisma generate && npx prisma db push`. Expected: in sync.
- [ ] **Step 2: Tulis tes yang gagal** (mock `@/lib/db`, env)
  - `normalizeBaseUrl("https://openrouter.ai/api/v1/chat/completions/", "OPENAI") === "https://openrouter.ai/api/v1"`.
  - `normalizeBaseUrl("https://api.anthropic.com/v1/messages", "ANTHROPIC") === "https://api.anthropic.com"`.
  - `http://example.com` ditolak oleh `providerInputSchema`; `http://localhost:11434/v1` diterima.
  - `listProviders()` memuat `env:ANTHROPIC` dan `env:GATEWAY` dengan `builtIn: true`, lalu `db:p1` dengan `keyHint "••••3456"`, dan **tidak ada properti** `apiKey` / `apiKeyCiphertext` di hasil mana pun.
  - `resolveProvider("db:p1")` mengembalikan `apiKey` hasil dekripsi.
  - `resolveProvider("db:missing")` melempar `AiProviderUnavailableError`.
  - `credentialVersionOf` berubah bila `baseUrl` atau `updatedAt` berubah.
  - `aiModelIdSchema` menerima `claude-haiku-5-5`, `openai/gpt-4.1-mini`, `deepseek-chat`, `llama3.1:8b`, dan menolak `""` serta `"a b"`.
- [ ] **Step 3: Jalankan tes, pastikan gagal.** Run: `npx vitest run src/lib/ai/providers.test.ts`.
- [ ] **Step 4: Implementasikan `src/lib/ai/providers.ts`.**
- [ ] **Step 5: Jalankan tes, pastikan lulus,** lalu `npx tsc --noEmit -p .`.
- [ ] **Step 6: Commit.** `feat: tabel provider AI dan resolver provider env + portal`

### Task 3: Penerjemah format OpenAI

**Files:**
- Create: `src/lib/ai/openai-format.ts`
- Test: `src/lib/ai/openai-format.test.ts`

**Interfaces:**
- Produces:
  - `toOpenAiRequest(params: Anthropic.MessageCreateParamsNonStreaming): OpenAiChatRequest`
  - `fromOpenAiResponse(body: unknown, model: string): Anthropic.Message`: melempar `Error("OPENAI_BAD_RESPONSE")` bila `choices[0].message` tidak ada.
  - `type OpenAiChatRequest = { model: string; messages: unknown[]; max_tokens: number; tools?: unknown[]; tool_choice?: "auto" | "none" }`

- [ ] **Step 1: Tulis tes yang gagal.** Pemetaan mengikuti tabel spec §5.3.
  - `system` berupa array blok teks (dengan `cache_control`) menjadi satu pesan `system` gabungan tanpa `cache_control`.
  - `tools` menjadi `{ type: "function", function: { name, description, parameters: input_schema } }`.
  - `tool_choice: { type: "none" }` menjadi `"none"`.
  - Riwayat assistant `[text "Sebentar", tool_use(id t1, name list_services, input {}), tool_use(id t2, …)]` menjadi satu pesan assistant `content: "Sebentar"` dengan 2 `tool_calls` yang `arguments`-nya string JSON.
  - User `[tool_result t1, tool_result t2 (is_error true, "gagal"), text "lanjut", image png base64]` menjadi:
    - `tool` t1;
    - `tool` t2 dengan konten diawali `"Error: gagal"`;
    - pesan user dengan bagian `text` + `image_url` `data:image/png;base64,…`.
    - Urutannya persis begitu (Review Focus 4).
  - `output_config` tidak ikut di request.
  - Respons `{ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "save_color", arguments: "{\"color\":\"coklat\"}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }` menjadi `content [{ type: "tool_use", id: "c1", name: "save_color", input: { color: "coklat" } }]`, `stop_reason "tool_use"`, `usage { input_tokens: 10, output_tokens: 5 }`.
  - `arguments: "{rusak"` menjadi `input {}`.
  - `finish_reason` `length` / `stop` / `content_filter` menjadi `max_tokens` / `end_turn` / `refusal`.
- [ ] **Step 2: Jalankan tes, pastikan gagal.** Run: `npx vitest run src/lib/ai/openai-format.test.ts`.
- [ ] **Step 3: Implementasikan** sebagai fungsi murni tanpa I/O.
- [ ] **Step 4: Jalankan tes, pastikan lulus.**
- [ ] **Step 5: Commit.** `feat: penerjemah format Anthropic <-> OpenAI Chat Completions`

### Task 4: `AiClient` + adapter + kegagalan teknis

**Files:**
- Create: `src/lib/ai/client.ts`
- Test: `src/lib/ai/client.test.ts`

**Interfaces:**
- Consumes: `ResolvedProvider` (Task 2), `toOpenAiRequest` / `fromOpenAiResponse` (Task 3), `maskSecrets` (Task 1).
- Produces:
  - `interface AiClient { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> }`
  - `getAiClient(provider: ResolvedProvider): AiClient`
    - ANTHROPIC: cache SDK per `key|baseUrl|credentialVersion`, `timeout 30_000`, `maxRetries 2`.
    - OPENAI: `fetch(`${baseUrl}/chat/completions`)`, header `Authorization: Bearer`, `AbortSignal.timeout(30_000)`.
  - `class AiProviderError extends Error { status: number | null; retriable: boolean }`: pesannya sudah disamarkan.
  - `isTechnicalFailure(error: unknown): boolean`. True untuk:
    - `AiProviderError` dengan status `null` (jaringan/timeout), ≥500, 429, 401, atau 403;
    - `APIError` SDK Anthropic dengan status yang sama;
    - `APIConnectionError`;
    - `AiProviderUnavailableError`;
    - `KeyCryptoUnavailableError`.

- [ ] **Step 1: Tulis tes yang gagal** (mock `global.fetch`)
  - OPENAI memanggil `https://x.test/v1/chat/completions` dengan Bearer key, lalu jawaban diterjemahkan.
  - HTTP 500 menghasilkan `AiProviderError status 500` dan `isTechnicalFailure === true`.
  - HTTP 400 menghasilkan `isTechnicalFailure === false`.
  - `fetch` melempar `TypeError` (jaringan) menghasilkan status `null` dan `isTechnicalFailure === true`.
  - Pesan error dari body `"invalid key sk-or-v1-abc"` tidak memuat `sk-or-v1-abc`.
- [ ] **Step 2: Jalankan tes, pastikan gagal.**
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4: Jalankan tes, pastikan lulus.**
- [ ] **Step 5: Commit.** `feat: AiClient dengan adapter Anthropic dan OpenAI`

### Task 5: Tes model + syarat pakai

**Files:**
- Modify: `src/lib/whatsapp/ai/connection-test.ts`
- Create: `src/lib/ai/model-tests.ts`
- Test: `src/lib/ai/model-tests.test.ts`, sesuaikan `src/lib/whatsapp/ai/connection-test.test.ts`

**Interfaces:**
- Consumes: `getAiClient`, `resolveProvider`, `credentialVersionOf`.
- Produces:
  - `testAiConnection(client: AiClient, model: string, opts: { claudeOptions: boolean }): Promise<ConnectionCheck[]>`. Signature berubah dari `(config)`. Tetap ada langkah "Tool use" dan "Gambar", ditambah "Koneksi" di awal (teks pendek).
  - `type AiUsage = "chat" | "proof" | "fallback"`
  - `USAGE_REQUIREMENTS: Record<AiUsage, ("connection" | "tools" | "image")[]>`: chat dan fallback = `["connection","tools"]`, proof = `["connection","tools","image"]`.
  - `runModelTest(providerKey: string, model: string): Promise<{ checks: ConnectionCheck[]; test: { connectionOk; toolsOk; imageOk; testedAt } }>`: menyimpan `AiModelTest` dengan `details` yang sudah disamarkan.
  - `passedTestsFor(providerKey: string, credentialVersion: string): Promise<{ model: string; usages: AiUsage[]; testedAt: Date }[]>`: hanya tes terbaru per model dengan `credentialVersion` yang sama.
  - `assertUsable(usage: AiUsage, providerKey: string, model: string): Promise<void>`: melempar `ModelNotTestedError { usage; missing: string[] }`.

- [ ] **Step 1: Tulis tes yang gagal**
  - Tes dengan tool lulus tapi gambar gagal: `assertUsable("chat")` lolos, `assertUsable("proof")` melempar dengan `missing: ["image"]`.
  - Setelah `credentialVersion` provider berubah, `assertUsable("chat")` melempar (Review Focus 1).
  - Model yang belum pernah dites melempar `ModelNotTestedError`.
  - `runModelTest` menyimpan `details` tanpa key provider, walaupun error dari provider memuatnya.
- [ ] **Step 2: Jalankan tes, pastikan gagal.**
- [ ] **Step 3: Implementasikan.**
  - `claudeOptions` meneruskan `modelRequestOptions(model)` hanya bila format ANTHROPIC dan model `claude-…` (lihat Task 6).
- [ ] **Step 4: Jalankan tes, pastikan lulus** (`connection-test.test.ts` disesuaikan dengan signature baru).
- [ ] **Step 5: Commit.** `feat: tes model per provider dan syarat pakai`

### Task 6: Pemakaian, cadangan, dan tiga titik panggilan AI

**Files:**
- Modify: `src/lib/whatsapp/ai/ai-config.ts`, `src/lib/whatsapp/ai/model-profile.ts`, `src/lib/whatsapp/ai/conversation.ts`, `src/lib/whatsapp/ai/owner-conversation.ts`, `src/lib/whatsapp/ai/extract-payment-proof.ts`, `src/lib/whatsapp/ai/tools.ts`
- Create: `src/lib/ai/fallback.ts`
- Test: `src/lib/ai/fallback.test.ts`, sesuaikan tes `conversation`, `owner-conversation`, `extract-payment-proof`, `ai-config`

**Interfaces:**
- Consumes: Task 2, 4, 5; `notifyOwnersPush` (`src/lib/notifications/push.ts`).
- Produces:
  - `type AiTarget = { provider: ResolvedProvider; model: string; label: string; claudeOptions: boolean }`
  - `getAiTargets(): Promise<{ chat: AiTarget; proof: AiTarget; fallback: AiTarget | null; maxTokens: number }>`.
    - Kolom `aiChat*` / `aiProof*` yang `null` memakai jalur lama: `providerOf(row)` + `modelOverrides`, ke provider `env:<…>`.
    - Kolom `aiFallback*` `null` berarti tanpa cadangan.
  - `createChatWithFallback(targets, params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">): Promise<{ message: Anthropic.Message; usedFallback: boolean }>`
  - `modelRequestOptions(model: string, format: ProviderFormat = "ANTHROPIC")`: mengembalikan `{}` kalau format bukan ANTHROPIC atau model bukan `claude-…`.
  - `aiModelSchema` di `ai-config.ts` diganti `aiModelIdSchema` (Task 2). Nama ekspor lama tetap ada sebagai alias, supaya route yang sudah ada tetap kompil.

- [ ] **Step 1: Tulis tes yang gagal** (`fallback.test.ts`, mock `getAiClient`, `notifyOwnersPush`)
  - Utama mengembalikan pesan, jadi cadangan tidak dipanggil dan `usedFallback: false`.
  - Utama melempar `AiProviderError(503)`, jadi cadangan dipanggil dengan `params` yang sama dan `model` cadangan, `usedFallback: true`, dan notifikasi dikirim sekali dengan judul "Provider utama gagal, memakai cadangan".
  - Utama melempar `AiProviderError(400)` (bukan teknis): error diteruskan, cadangan tidak dipanggil.
  - `resolveProvider` utama melempar `KeyCryptoUnavailableError` (Review Focus 2): cadangan dipakai.
  - Dua kegagalan dalam 59 menit menghasilkan 1 notifikasi; setelah 60 menit, 2 notifikasi.
  - Cadangan `null` dan utama gagal: error utama diteruskan.
  - Target dengan format OPENAI: `params` tidak memuat `output_config`.
- [ ] **Step 2: Jalankan tes, pastikan gagal.**
- [ ] **Step 3: Implementasikan `getAiTargets` dan `createChatWithFallback`,** lalu ganti tiga titik panggilan:
  - `conversation.ts` (`runAiTurn`) dan `owner-conversation.ts` memakai `createChatWithFallback(targets, {...})` di setiap putaran tool, tanpa `model`.
  - `extract-payment-proof.ts`: signature menjadi `extractPaymentProof(image, target: AiTarget)`, memakai `getAiClient(target.provider).create({ model: target.model, … })`, tanpa cadangan.
  - `tools.ts` memanggilnya dengan `(await getAiTargets()).proof`.
- [ ] **Step 4: Jalankan tes.** Run: `npx vitest run src/lib/ai src/lib/whatsapp`. Expected: PASS. Tes lama disesuaikan hanya pada cara mock client/config, bukan perilakunya.
- [ ] **Step 5: Commit.** `feat: bot memakai provider pilihan owner dengan cadangan`

### Task 7: API provider, tes, daftar model, dan pemakaian

**Files:**
- Create: `src/app/api/settings/whatsapp/ai-providers/route.ts` (GET daftar, POST tambah)
- Create: `src/app/api/settings/whatsapp/ai-providers/[id]/route.ts` (PUT, DELETE)
- Create: `src/app/api/settings/whatsapp/ai-providers/test/route.ts` (POST `{ providerKey, model }`)
- Modify: `src/app/api/settings/whatsapp/models/route.ts` (query `providerKey`; fallback `provider` lama tetap diterima)
- Modify: `src/app/api/settings/whatsapp/route.ts` (PUT menerima `aiUsage: { chat?, proof?, fallback? }`, masing-masing `{ providerKey, model } | null`)
- Modify: `src/lib/whatsapp/ai/model-list.ts` (`listModels(provider: ResolvedProvider)`: OPENAI `GET {baseUrl}/models`, ANTHROPIC seperti sekarang)
- Test: `route.test.ts` di masing-masing folder

**Interfaces:**
- Consumes: Task 1, 2, 5.
- Produces (JSON):
  - GET `ai-providers` mengembalikan `{ providers: ProviderSummary[]; tests: Record<providerKey, { model; usages; testedAt; stale: boolean }[]>; usage: { chat; proof; fallback }; cryptoReady: boolean }`
  - Error validasi: 400 `{ error, fields }`.
  - Provider bawaan: 403 untuk PUT dan DELETE.
  - DELETE provider yang sedang dipakai: 409 `{ error: "Provider sedang dipakai untuk Chat" }` (sebut pemakaiannya; Review Focus 5).
  - PUT pemakaian dengan model yang belum lulus: 400 `{ fields: { chat: "Model belum lulus tes: tool" } }`.

- [ ] **Step 1: Tulis tes yang gagal**
  - Non-owner (`activeRole !== "OWNER"`) mendapat 403 di semua route baru.
  - POST tanpa `AI_KEYS_SECRET` mendapat 400 dengan pesan "Kunci enkripsi AI_KEYS_SECRET belum diatur di server".
  - Respons GET dan POST tidak memuat string key yang dikirim.
  - DELETE provider dipakai mendapat 409; DELETE `env:GATEWAY` mendapat 403.
  - PUT pemakaian dengan model belum dites mendapat 400 dengan `fields.chat`.
- [ ] **Step 2: Jalankan tes, pastikan gagal.**
- [ ] **Step 3: Implementasikan.** Setiap perubahan provider dicatat di `ActivityLog`, tanpa key.
- [ ] **Step 4: Jalankan tes, pastikan lulus.**
- [ ] **Step 5: Commit.** `feat: API provider AI, tes model, dan pemakaian`

### Task 8: UI Bot AI › Model

**Files:**
- Create: `src/components/settings/ai/ProviderList.tsx`, `ProviderFormDialog.tsx`, `ModelTester.tsx`, `AiUsageCard.tsx`
- Modify: `src/app/(dashboard)/bot/page.tsx` (tab model memakai komponen baru; `AiProviderCard.tsx` dihapus bila tidak lagi dirujuk)

**Interfaces:**
- Consumes: API Task 7.

- [ ] **Step 1: UI/UX Pro Max** untuk form provider dan hasil tes per langkah.
- [ ] **Step 2: Implementasikan**
  - **Daftar provider:** nama, format, base URL, `keyHint`, label "Bawaan server" untuk provider env.
  - **Dialog tambah/edit:**
    - field key bertipe password, dengan helper "Kosongkan untuk tidak mengubah key";
    - error per field;
    - kalau `cryptoReady === false`, tombol tambah nonaktif dengan penjelasan.
  - **ModelTester:**
    - tombol "Ambil daftar model", isian model, tombol "Tes model";
    - hasil per langkah Koneksi / Tool / Gambar (✓/✗ + detail) dan waktu tes;
    - tes yang `stale` ditandai "Perlu dites ulang".
  - **AiUsageCard:**
    - tiga pilihan (Chat, Baca bukti transfer, Cadangan), opsi hanya model yang lulus untuk pemakaian itu;
    - pilihan aktif yang `stale` diberi tanda peringatan;
    - "Tanpa cadangan" adalah opsi Cadangan.
  - State memuat, kosong, dan galat; tampilan mobile 375px.
- [ ] **Step 3: Verifikasi.** Run: `npx tsc --noEmit -p . && npx eslint src --quiet`. Lalu cek di browser sebagai owner (dev): tambah provider, tes model, pilih Chat, buka ulang halaman.
- [ ] **Step 4: `/antislop`,** perbaiki temuan yang valid.
- [ ] **Step 5: Commit.** `feat: UI provider AI, tes model, dan pemakaian`

### Task 9: Dokumen, validasi menyeluruh, uji nyata

**Files:**
- Create: `docs/AI_PROVIDERS.md`
- Modify: `docs/WHATSAPP_AI_CHATBOT.md`, `docs/yukdesain_studio_portal_BRD_FINAL_v2.md` (keputusan "AI = Claude saja" diganti "semua model yang lulus tes", 2026-11-11), `docs/DEPLOY.md` (`AI_KEYS_SECRET` di `shared/.env`)

- [ ] **Step 1: Tulis dokumen** sesuai spec §6.4.
- [ ] **Step 2: Validasi.** Run: `npx tsc --noEmit -p . && npx eslint src --quiet && npx vitest run && npm run build`. Expected: semua lulus.
- [ ] **Step 3: Uji nyata (dev, dengan izin owner)**
  - Owner memasukkan key lewat form portal di dev, untuk satu provider ANTHROPIC dan satu OPENAI (mis. OpenRouter).
  - Tes model keduanya, lalu satu percakapan Uji bot dengan masing-masing sebagai Chat.
  - Matikan sementara provider utama (base URL salah), lalu pastikan cadangan dipakai dan notifikasi masuk.
- [ ] **Step 4: Commit dan buka PR.** `docs: provider AI multi-format`. Di deskripsi PR, sebutkan langkah deploy: buat `AI_KEYS_SECRET` acak di `shared/.env` sebelum deploy.
