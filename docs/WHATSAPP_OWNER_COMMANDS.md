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
  skrip deploy tidak memakai flag itu (deploy akan gagal). Keunikan dicek di `PUT /api/settings/whatsapp/owner-number`
  (juga menolak nomor yang pernah order sebagai klien).
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
