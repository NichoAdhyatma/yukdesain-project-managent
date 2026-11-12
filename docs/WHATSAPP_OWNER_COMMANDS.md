# Instruksi Owner lewat WhatsApp

Lanjutan dari Panduan bot (`docs/WHATSAPP_BOT_GUIDE.md`). Owner memberi instruksi ke bot dengan chat biasa dari
nomor WhatsApp-nya sendiri, dan bot bisa bertanya ke owner saat klien meminta sesuatu di luar katalog.
Disetujui owner 2026-11-02; diimplementasikan (checkpoint 048).

## 1. Keputusan owner (2026-11-02)

| Topik | Keputusan |
|---|---|
| Saluran | WA dari nomor owner yang didaftarkan di Settings |
| Kapan berlaku | Bot merangkum jadi aturan tertulis; terbit setelah owner membalas **YA** |
| Promo & biaya tambahan | Bot boleh menyebut aturan harga owner persis; order ditandai; **harga final tetap diisi admin** |
| Permintaan di luar katalog | Bot bertanya ke owner lewat WA, jawaban owner diteruskan ke klien |

Ini **mengubah keputusan lama** "bot tidak pernah menyebut harga sebelum admin mengisinya"
(`docs/WHATSAPP_AI_CHATBOT.md` §2): sekarang bot boleh menyebut **aturan harga yang diterbitkan owner** (mis.
diskon Rp50.000, biaya express 50%). Bot tetap tidak boleh menyebut harga layanan, kisaran harga, atau total.

## 2. Contoh dari owner → hasilnya

| Owner chat | Jadi aturan |
|---|---|
| "kalo ada chat yang di luar katalog konfirmasi ke aku ya" | Aturan: permintaan di luar katalog → tanya owner (fitur §5) |
| "order lebih dari 5pcs kasih diskon 50rb, kasih teks marketing yang bagus" | Aturan harga: **Diskon Rp50.000**, syarat "jumlah lebih dari 5 pcs", nada promosi |
| "pesan ndadak bilang ada paket express, tambah 50% dari total" | Aturan harga: **Biaya express +50% dari total**, syarat "klien butuh cepat / mendadak" |

## 3. Siapa owner di WhatsApp

- Settings › WhatsApp: field **"Nomor WhatsApp saya"** untuk user OWNER yang sedang login (disimpan di
  `User.waNumber`, format 62…, unik). Bisa lebih dari satu owner, masing-masing nomornya sendiri.
- Pesan masuk dari nomor itu → **alur owner**, bukan alur klien. Identitas dari `wa_id` yang dijamin WhatsApp,
  bukan dari isi pesan: klien yang menulis "saya owner" tetap diperlakukan sebagai klien.
- Nomor owner tidak pernah membuat order, tidak dihitung di statistik klien, dan tidak dibatasi rate limit klien.

## 4. Alur instruksi owner

1. Owner chat bebas ke nomor bot.
2. Bot (prompt khusus owner) merangkum jadi **usulan perubahan**: teks aturan tambahan, FAQ, dan/atau aturan harga
   terstruktur. Bot membalas ringkasan + "Balas *YA* untuk menerapkan, *BATAL* untuk membatalkan."
3. Balasan **YA / BATAL** diperiksa **oleh server**, bukan oleh AI: usulan diterapkan ke panduan dan langsung
   terbit sebagai versi baru (tercatat "via WhatsApp" + nama owner). Usulan kedaluwarsa 24 jam.
4. Owner juga bisa bertanya "aturan apa saja sekarang?" atau "hapus diskon 5pcs" (jadi usulan, konfirmasi YA).
5. Draft yang sedang diedit di portal tidak ditimpa diam-diam: usulan WA diterapkan ke **versi aktif**; jika draft
   portal berbeda, portal menampilkan peringatan.

## 5. Permintaan di luar katalog → tanya owner

1. Klien minta sesuatu yang tidak ada di layanan aktif. Bot memanggil tool `ask_owner` dengan ringkasan
   permintaan, lalu bilang ke klien: "Kami cek dulu ke tim ya kak."
2. Server mengirim pertanyaan ke **semua nomor owner**: "Klien Sari (6281****7890) minta desain kemasan sachet
   kopi, 3 varian. Bisa? Balas pesan ini dengan *BISA* atau *TIDAK* + catatan."
   - Dalam 24 jam sejak owner terakhir chat ke bot → teks biasa. Di luar itu → **template baru**
     `yd_konfirmasi_owner` (harus diajukan ke Meta, kategori Utility).
3. Owner membalas (sebaiknya dengan *reply* ke pesan itu; jika tidak dan ada beberapa pertanyaan terbuka, bot
   menanyakan yang mana). Jawaban owner disimpan, lalu bot melanjutkan chat dengan klien memakai keputusan dan
   catatan owner (catatan internal, tidak dikutip mentah).
4. Selama menunggu, order tampil di Order WA dengan label **"Menunggu konfirmasi owner"**. Tidak dijawab 24 jam →
   chat klien masuk mode HUMAN (admin membalas dari portal).

### 5.1 Hasil kirim jawaban owner (2026-11-12)

Temuan produksi 11 Nov 22:04: jawaban owner tersimpan, tetapi AI gagal saat meneruskannya ke klien; bot sudah
terlanjur bilang "sudah diteruskan", chat klien pindah ke admin, dan owner tidak bisa mengirim ulang.

- Asisten owner hanya bilang jawabannya **dicatat**. Setelah itu server meneruskan ke klien (`relayOwnerAnswer`) dan
  mengirim **laporan hasil yang sebenarnya** ke owner (disusun server, bukan AI): terkirim; gagal karena AI error
  (`WaOwnerQuery.relayFailedAt` diisi, chat ke admin, owner diminta balas *kirim ulang*); tidak dikirim karena chat
  ditangani admin; atau jendela 24 jam tutup.
- **Kirim ulang:** owner membalas *kirim ulang*. Satu jawaban gagal → server langsung mengirim ulang tanpa AI;
  beberapa → asisten menanyakan yang mana (tool `resend_client_answer`, STATE memuat jawaban yang belum terkirim 24
  jam terakhir). Chat yang pindah ke admin karena kiriman gagal dikembalikan ke bot hanya bila admin belum membalas
  sejak itu.
- **Penyebab gagal 11–12 Nov (diperbaiki 2026-11-12):** saat meneruskan, pesan terakhir di chat adalah balasan bot
  sendiri, jadi permintaan ke AI berakhir di giliran assistant (prefill) dan ditolak provider (`provider_400`). Semua
  penerusan sejak 8 Nov gagal karena ini. Sekarang riwayat yang berakhir di pesan bot ditutup catatan "[Belum ada pesan
  baru dari klien. Lanjutkan percakapan sesuai STATE.]".
- Penerusan yang gagal **tidak** mengirim "sistem sedang sibuk" ke klien (klien tidak sedang menunggu balasan; owner
  yang menerima laporan). Chat tetap dialihkan ke admin.
- *kirim ulang* tetap dikenali walau tersalin dengan tanda format WhatsApp (`*kirim ulang*`, `_kirim ulang_`).

### 5.2 Tidak bertanya hal yang sama (2026-11-12)

Temuan produksi 12 Nov: asisten owner menempelkan "Untuk CV WIETAS ..., pertanyaannya masih menunggu" di 6 balasan
berturut-turut; bot klien bertanya dua kali ke owner soal ide konsep Day (jawaban pertama sudah disampaikan, tetapi
hilang dari STATE sehingga bot mengira belum dicek); bot klien menagih "berapa jumlah menu/halaman" 5 kali ke Mif yang
sedang mengirim menu satu per satu.

- Asisten owner tidak mengingatkan pertanyaan lain yang menunggu di setiap balasan; hanya bila owner menanyakannya atau
  untuk memastikan jawaban ini untuk pertanyaan yang mana. Jawaban owner dicocokkan dengan isi permintaan.
- STATE bot klien memuat jawaban tim yang **sudah disampaikan** (7 hari terakhir) dengan catatan "jangan tanyakan ulang
  ke owner". Bot tidak memanggil `ask_owner` untuk permintaan yang menunggu atau sudah dijawab; kabar "sedang dicek tim"
  cukup sekali.
- Bot klien tidak menanyakan ulang pertanyaan yang sama di pesan berturut-turut; data yang dikirim bertahap cukup
  dikonfirmasi singkat.
- Gangguan teknis AI (rate limit, 5xx, jaringan) dicoba sekali lagi setelah 4 detik sebelum chat dialihkan ke admin.
  Log mencatat status provider (`provider_429`, dst.) dan alasan berhenti AI saat balasan kosong (`stop=max_tokens`).
- Balasan asisten yang meminta "balas YA" tanpa usulan tersimpan: ajakannya dibuang, pertanyaan klarifikasinya tetap
  dikirim. Teks usulan palsu tetap diganti "usulannya belum tercatat".
- Harga khusus untuk satu klien bukan perubahan panduan: harga order diisi admin di Order WA (atau catatan pada
  jawaban pertanyaan klien).
- Batas token: chat klien default 2.000 (`WA_AI_MAX_TOKENS`), asisten owner minimal 4.000 (usulan membawa teks
  panduan lengkap).

## 6. Aturan harga di sisi klien

- Bot boleh menyebut aturan harga yang terbit, persis: nama, syarat, dan nilainya ("diskon Rp50.000 untuk order
  lebih dari 5 pcs", "paket express: tambahan 50% dari total").
- Jika syarat terpenuhi, bot memanggil `apply_pricing_rule` → order ditandai (mis. **"Diskon >5pcs: −Rp50.000"**,
  **"Express: +50%"**). Tanda ini tampil di panel harga Order WA agar admin menerapkannya saat mengisi harga.
- Penjaga harga di server tetap aktif: angka yang **bukan** nilai aturan harga terbit tetap dihapus sebelum admin
  mengisi harga. Bot tetap tidak boleh menyebut harga layanan atau total.

## 7. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Schema | `User.waNumber String?` (+ index; unik dicek di API, lihat §9); panduan + `pricingRules` (JSON: id, jenis DISKON/BIAYA_TAMBAHAN, nama, syarat, nilai Rp/%); `WaOwnerProposal` (usulan + status + kedaluwarsa); `WaOwnerQuery` (pertanyaan luar katalog, intake, jawaban, wamid pertanyaan); `WaIntake.pricingRulesApplied Json`; `WaMessage.contextWamid` (reply-to) |
| Webhook | parse `context.id` (pesan yang dibalas) |
| Bot | cabang owner di `handleInboundMessage`; prompt + tools owner (`propose_guide_change`, `get_current_guide`, `answer_client_query`); YA/BATAL di server |
| Bot klien | tools `ask_owner`, `apply_pricing_rule`; panduan berisi aturan harga; `stripPriceMentions` mengizinkan nilai aturan harga terbit |
| Pesan ke owner | `outbound` ke nomor owner (24 jam / template `yd_konfirmasi_owner`) |
| Portal | Settings: nomor WhatsApp owner; Panduan bot: editor aturan harga; Order WA: label menunggu owner + tanda aturan harga di panel harga |
| Uji bot | Bisa mensimulasikan jawaban owner untuk pertanyaan luar katalog dari percakapan uji |

## 8. Yang perlu disiapkan owner

- Ajukan template `yd_konfirmasi_owner` (isi akan ditambahkan ke `docs/WHATSAPP_TEMPLATES.md`).
- Isi nomor WhatsApp owner di Settings. Nomor owner harus **berbeda** dari nomor bot.

## 9. Catatan implementasi

- **`User.waNumber` tanpa `@unique`.** Constraint unik baru membuat `prisma db push` meminta `--accept-data-loss`, dan
  skrip deploy tidak memakai flag itu (deploy akan gagal). Keunikan dicek di `PUT /api/settings/whatsapp/owner-number`.
  Sejak 2026-11-07 nomor yang pernah order sebagai klien boleh didaftarkan (lihat §10).
- **Penjaga usulan palsu.** Model kadang menulis sendiri teks yang meniru format usulan ("Balas *YA*…") tanpa memanggil
  tool, sehingga YA owner tidak menerapkan apa pun. Prompt melarangnya, dan server tidak mengirim balasan AI owner yang
  meminta YA/BATAL jika tidak ada usulan tersimpan (`looksLikeConfirmationRequest` → "usulannya belum tercatat").
- **YA/BATAL** dicocokkan server secara ketat (`parseConfirmKeyword`); balasan (reply) ke pesan pertanyaan klien tidak
  pernah dianggap YA/BATAL.
- **Penjaga harga diperluas**: kalimat berisi diskon/potongan/promo/tambahan dengan nominal atau persen kini terdeteksi;
  yang lolos hanya angka dari aturan harga terbit (nilai + angka di nama/syarat).
- **Kedaluwarsa tanpa cron**: `expireOwnerQueries()` dijalankan saat webhook masuk dan saat daftar Order WA dibuka.
- **Pertanyaan luar katalog yang dijawab "bisa" tetapi tidak ada layanan yang cocok** → bot menyampaikan ke klien lalu
  menyerahkan ke admin (mode HUMAN), karena order WA butuh layanan dari katalog untuk brief.
- **Uji bot punya peran owner**: percakapan `sandbox-owner:<userId>`; YA menyimpan ke **draft**, bukan terbit. Pertanyaan
  luar katalog dari percakapan uji tidak dikirim ke WA; dijawab dari panel Uji bot.
- **Usulan dari WA diterapkan ke versi aktif**; draft portal ikut diperbarui hanya jika sebelumnya sama dengan versi aktif.
  Jika draft portal punya suntingan yang belum terbit, suntingan itu tidak ditimpa (portal menampilkan "Draft berbeda").
- Diuji dengan model gateway (bukan Claude): alur dan penjaga bekerja; kualitas bahasa perlu diuji ulang dengan Claude.

## 10. Owner tes sebagai klien (2026-11-07)

Keputusan owner: owner bebas mencoba order dari nomor owner sendiri.

- Nomor yang pernah order sebagai klien **boleh** didaftarkan sebagai nomor owner. Order lamanya tetap ada di Order WA.
- Dari nomor owner, kirim **#klien** → chat dilayani seperti klien (bisa tes order, termasuk saat Balas otomatis
  nonaktif). Kirim **#owner** → kembali memberi instruksi. Bot membalas konfirmasi di setiap pergantian.
- Masuk mode klien juga mengembalikan chat ke bot jika tes sebelumnya berakhir di admin.
- Order dari nomor owner diberi label **Tes owner** di Order WA (daftar dan detail). Nomor owner tidak bisa diblokir.
- Selama mode klien, balasan ke pertanyaan luar katalog yang dikirim bot ke nomor ini juga diperlakukan sebagai chat
  klien; kirim #owner dulu untuk menjawabnya.
- Teknis: `WaConversation.ownerActsAsClient Boolean @default(false)` (additive); `ownerModeCommand` di `bot.ts`;
  `ownerTest` di DTO Order WA (`ownerNumberSet` di `intake-api.ts`). Uji bot tidak terpengaruh (punya pilihan peran sendiri).
