# BUSINESS REQUIREMENTS DOCUMENT (BRD)
# YukDesain Studio Portal
## Final Business Process & Product Requirements

**Document Status:** Final  
**Purpose:** Single business-reference document for product, design, development, QA, and AI coding agents.  
**Product:** YukDesain Studio Portal  
**Business Type:** Graphic Design Agency / Creative Studio  
**Target Operational Scale:** Approximately 50–60 clients/orders per month.  
**Approved Change (2026-11-01):** WhatsApp AI Chatbot & Order Intake — see `docs/WHATSAPP_AI_CHATBOT.md` (§5.2, §7.4, §39 below).

---

# 1. Executive Summary

YukDesain Studio Portal is a web-based management system for a small graphic design agency / creative studio.

The system centralizes the complete operational lifecycle of a design project:

- client intake
- order/project creation
- payment and DP recording
- client brief collection
- designer/worker assignment
- production workflow
- progress and deliverable uploads
- client review
- revision management
- final approval
- pelunasan
- invoice
- freelancer payout
- financial recap
- audit/history
- client tracking

## Core Business Principle

> **WhatsApp is for communication. YukDesain Studio Portal is the system of record for project and payment management.**

Important project, payment, brief, production, revision, and financial information must be recorded in YukDesain rather than existing only inside WhatsApp.

---

# 2. Business Objectives

The system must:

1. Reduce manual project administration.
2. Prevent project information from being scattered across WhatsApp.
3. Standardize client briefs according to the purchased service.
4. Give designers complete production context without exposing unnecessary internal data.
5. Allow clients to track project progress without requiring an account.
6. Control revision usage with a maximum of 3 free revisions.
7. Centralize invoice and payment information.
8. Record freelancer costs and studio revenue.
9. Preserve project history and operational accountability.
10. Provide a maintainable foundation for approximately 50–60 orders per month.

---

# 3. Scope

## 3.1 In Scope

- Owner/Admin dashboard
- Designer/Worker workspace
- Tokenized Client Portal
- One-time client brief links
- Service catalog
- Category-specific client brief forms
- File/reference uploads
- Project management
- Designer assignment
- Kanban workflow
- Project progress
- Client review
- Revision tracking
- Invoice
- Manual payment recording
- DP and pelunasan
- Freelancer payout
- Financial recap
- Search/filter
- Audit/history
- Internal/client data separation
- Secure token validation
- Responsive UI
- Required UI states
- Testing of critical workflow
- WhatsApp AI Chatbot & Order Intake via WhatsApp Cloud API (approved 2026-11-01, `docs/WHATSAPP_AI_CHATBOT.md`)

## 3.2 Out of Scope for MVP

Unless explicitly approved later:

- ~~automated WhatsApp messaging~~ — moved to In Scope by the 2026-11-01 approval (WhatsApp AI Order Intake only; broadcast, marketing, and automatic reminders remain out of scope)
- automated payment gateway
- microservices
- Redis
- Kubernetes
- distributed queues
- unnecessary external integrations
- automatic financial reconciliation with a bank

WhatsApp remains a communication channel. The approved WhatsApp bot automates conversation and draft collection only; YukDesain remains the system of record.

---

# 4. Roles & Access

> **Note:** A user account may hold one or more roles simultaneously (e.g., `["OWNER", "DESIGNER"]`). This allows an individual to act as both administrator and designer using a single login.

## 4.1 Owner / Admin

Full administrative access.

Responsibilities:

- create project/order
- record project metadata
- record DP/payment
- generate one-time brief link
- manage service catalog
- manage workers
- classify worker as full-time or freelancer
- assign designer
- set freelancer payout
- manage Kanban
- review project information
- manage payment information
- access invoices
- view financial recap
- access audit/history
- manage operational settings

## 4.2 Designer / Worker

A staff member or contractor who executes assigned projects.

Responsibilities:

- view assigned projects only (cannot see other designers' projects)
- view relevant client brief
- view production attachments
- update workflow status (BELUM_DIKERJAKAN / SEDANG_DIKERJAKAN / SELESAI)
- upload progress/preview/final files
- respond to revisions
- track assigned work

**Access restrictions:**
- Cannot access dashboard, projects, kanban, services, designers, clients, financial, invoices, settings
- Redirected to `/designer` workspace if attempting owner-only routes
- Cannot see project numbers or data outside their assignments

Workers must not receive unrelated administrative data.

**Implementation status: ✅ Implemented**

Designer account management (`/designers` page):
- Create designer: password auto-generated (16-char strong random), shown once in dialog after creation, not stored in plain text
- Edit designer name and classification via dialog
- Change password per designer via dialog (min 8 chars, bcrypt hashed)
- Toggle active/inactive status
- Designer cannot elevate themselves to OWNER role (backend 403 guard + UI hides Admin toggle for non-owners)

## 4.3 Client

External user without an account in the current model.

Client access is tokenized.

Client may:

- open the one-time brief link
- submit the brief
- upload assets/references
- track project
- view client-safe project progress
- submit revision requests
- upload revision references
- view/download invoice

Client must never access:

- internal notes
- freelancer payout
- internal financial calculations
- other clients
- internal worker information beyond what is intentionally exposed
- administrative controls

## 4.4 Demo Credentials

The system is seeded with the following demo accounts for development:

| Role | Email | Password | Classification |
|------|-------|----------|----------------|
| Owner + Designer | owner@yukdesain.com | admin123 | - |
| Designer | rina@yukdesain.com | admin123 | Full-time |
| Designer | budi@yukdesain.com | admin123 | Freelancer |

> **Note:** A user can hold multiple roles. The `owner@yukdesain.com` account currently has only the OWNER role. To create a combined owner+designer user, assign both `["OWNER", "DESIGNER"]` roles to the user.

## 4.5 Navigation Menu (Admin-configurable)

Sidebar menu items are stored in the database (`menu_items` table), not hardcoded. This allows the owner to add, remove, or hide menu items without code changes.

**Menu visibility is controlled by the `page_roles` table** (path → roles mapping), separate from `menu_items`. Server layout filters menus server-side based on `user.roles`.

**MenuItem fields:**
- `name` — Display label (e.g., "Dashboard", "Projects")
- `href` — Route path (e.g., "/dashboard", "/projects")
- `icon` — Lucide icon component name (e.g., "LayoutDashboard", "Briefcase")
- `group` — Grouping label (e.g., "Overview", "Work Management", "Finance")
- `order` — Sort order within group
- `isActive` — Toggle visibility

**PageRole fields:**
- `path` — Route path (e.g., "/dashboard")
- `roles` — Array of roles that can access this path (e.g., `["OWNER"]`, `["DESIGNER"]`)

**Default menus seeded:**
| Name | Group | Visible To |
|------|-------|------------|
| Dashboard | Overview | OWNER |
| Form Link | Work Management | OWNER |
| Projects | Work Management | OWNER |
| Designers | Work Management | OWNER |
| Workspace | Designer | DESIGNER |
| Invoices | Finance | OWNER |
| Settings | Settings | OWNER |

**Role Switching:** Owner can switch to Designer role via avatar dropdown. Menu updates seamlessly without re-login. Designer cannot switch to Admin. Backend guards prevent non-OWNER users from adding OWNER role to themselves.

Owner can manage menus via API: `GET /api/menus`, `POST /api/menus`, `PUT /api/menus/[id]`, `DELETE /api/menus`.

**Implementation status: ✅ Implemented**

API: full CRUD on `/api/menus` and `/api/menus/[id]`. UI: "Menus" tab in `/settings` page with:
- Menu list grouped by group name (Overview, Work Management, Finance, Designer, Settings)
- Toggle isActive inline per menu
- Edit and delete actions per menu
- Create/Edit dialog with name, href, icon, group fields

---

# 5. Core Business Process

## 5.1 End-to-End Flow

```text
CLIENT CONSULTATION / ORDER
        |
        v
WHATSAPP COMMUNICATION
        |
        v
DEAL + PRICE AGREED
        |
        v
DP RECEIVED
        |
        v
ADMIN CREATES PROJECT
        |
        +--> Record client
        +--> Record service
        +--> Record price
        +--> Record deadline
        +--> Record DP
        +--> Record project metadata
        |
        v
GENERATE ONE-TIME BRIEF LINK
        |
        v
CLIENT OPENS BRIEF
        |
        v
CLIENT FILLS CATEGORY-SPECIFIC FORM
        |
        +--> Text information
        +--> Upload assets
        +--> Upload references
        +--> Add URLs
        +--> Repeatable items where applicable
        |
        v
CLIENT SUBMITS BRIEF
        |
        v
PROJECT BECOMES READY FOR PRODUCTION
        |
        v
ADMIN ASSIGNS DESIGNER
        |
        v
DESIGNER WORKS
        |
        +--> Update Kanban/status
        +--> Upload progress
        +--> Upload preview/final
        |
        v
CLIENT REVIEWS
        |
        +-------------------+
        |                   |
        v                   v
     APPROVE             REVISION
        |                   |
        |                   v
        |             Revision count +1
        |                   |
        |                   v
        |              Designer works
        |                   |
        |                   +----> Client review
        |
        v
FINAL APPROVAL
        |
        v
PELUNASAN
        |
        v
PROJECT COMPLETED
        |
        +--> Archive/history
        +--> Freelancer expense
        +--> Studio revenue
        +--> Financial recap
```

## 5.2 Alternative Flow — WhatsApp AI Order Intake (approved 2026-11-01)

The flow in §5.1 remains available and unchanged. An alternative intake path runs through the studio WhatsApp number, served by an AI assistant. Full specification: `docs/WHATSAPP_AI_CHATBOT.md`.

```text
CLIENT CHATS STUDIO WHATSAPP
        |
        v
AI CONSULTATION (service + brief draft + reference images)
        |
        v
CLIENT CONFIRMS BRIEF SUMMARY
        |
        v
ADMIN SETS PRICE + DEADLINE IN PORTAL (DP = 50%)
        |
        v
BOT SENDS OFFER + DP + STUDIO ACCOUNTS
        |
        v
CLIENT SENDS TRANSFER PROOF (AI reads, system flags anomalies)
        |
        v
ADMIN VERIFIES DP VIA CHECKLIST
        |
        +--> Reject (reason required) -> client re-sends proof
        |
        v
SYSTEM CREATES CLIENT + PROJECT + BRIEF + DP PAYMENT + STRUK + TRACKING LINK
        |
        v
BOT SENDS PROJECT CODE + TRACKING LINK
        |
        v
PROJECT READY FOR PRODUCTION (continues at "ADMIN ASSIGNS DESIGNER" in §5.1)
```

Owner decisions for this flow (must not be changed without new approval):

| Topic | Decision |
|---|---|
| Provider | WhatsApp Cloud API (Meta), official |
| Price | Set by admin after the client confirms the brief. The bot never states or estimates a price before admin sets it. |
| DP | 50% of price |
| Deadline | Set by admin, together with the price |
| DP validation | Admin via checklist. AI reading is assistance only, never a decision. |
| Old flow (form link) | Remains available as an alternative |
| Price negotiation | Bot never negotiates; objections are handed off to admin |

The AI never makes business decisions. It only fills drafts (brief draft, transfer-proof reading).

---

# 6. Project and Order Model

## 6.1 Order and Project Are One Entity

The current business model treats an order and its project as one lifecycle.

There is no mandatory separate:

```text
Order -> Project
```

transition.

Once the project is created, it remains the central record throughout the workflow.

## 6.2 Core Project Data

A project may contain:

- project ID
- client name
- client contact where approved/required
- service/category
- agreed price
- project/order date
- deadline
- DP
- pelunasan
- payment status
- invoice number
- one-time token
- token status
- token expiration where configured
- brief/form data
- assigned designer
- worker type
- freelancer payout
- project status
- progress files
- revisions
- final approval
- internal notes
- history/audit data

---

# 7. Payment Business Rules

## 7.1 DP

DP is collected through the existing business communication process before the client brief link is generated.

The system records the DP as part of the project financial state.

Expected flow:

```text
Deal
 -> DP received
 -> Admin records DP
 -> Admin creates/generates project brief link
```

## 7.2 Pelunasan

Pelunasan is recorded when the project is completed/finalized according to the operational process.

## 7.3 Payment Status

Canonical statuses:

```text
UNPAID
PARTIALLY_PAID
PAID
```

The system must distinguish the financial state from the production state.

A project can be:

- still in production while partially paid
- completed while awaiting pelunasan
- paid in full after finalization

The implementation must not assume production status and payment status are the same field.

## 7.4 DP via WhatsApp AI Order Intake (approved 2026-11-01)

For the §5.2 path:

- DP amount = 50% of the admin-set price, rounded up, computed by the system.
- The client sends a transfer-proof image over WhatsApp. The AI reads it; the system flags anomalies (amount below DP, recipient not a studio account, duplicate image/reference, date before offer, unreadable).
- Flags are advisory. The admin is the final decision-maker and must confirm, via checklist, that funds actually arrived in the studio's bank/e-wallet mutation.
- The DP payment is recorded only when the admin approves. The project is created in the same step, so §7.1's "DP recorded before brief" still holds: the brief is collected by chat instead of a link.
- Transfer proofs are private files, visible to the owner only.
- No payment gateway or bank-API reconciliation is introduced.

---

# 8. One-Time Client Brief Link

The brief link is the secure entry point for the client.

## 8.1 Rules

A link must:

- be unique
- be tied to one project
- use a secure unpredictable token
- be server-side validated in the production architecture
- optionally have an expiration time
- become invalid after successful submission
- become invalid after expiration
- not expose sequential database IDs
- be rate-limited where applicable

Recommended token contract:

```text
16-character alphanumeric secure token
```

The production implementation must use cryptographically secure token generation.

## 8.2 Lifecycle

```text
CREATED
  |
  v
ACTIVE
  |
  +--> SUBMITTED / USED
  |
  +--> EXPIRED
```

A used or expired link must not allow another brief submission.

---

# 9. Client Brief Architecture

The client brief is contextual.

The system must not present every possible question to every client.

The selected service determines the form.

## 9.1 Form Design Principles

Each form should:

- explain why information is needed
- use clear labels
- provide helper text/examples when useful
- validate required information
- support relevant uploads
- support multiple references where required
- support repeatable data where required
- preserve structured data for production use

---

# 10. Service Catalog

The canonical service catalog contains 11 services:

1. Logo Minimalis
2. Logo Ilustrasi
3. Poster Menu
4. Banner UMKM
5. Baliho / Spanduk Ads
6. Packaging Pouch
7. Packaging Box
8. Sticker Label
9. Frame Photobooth
10. Paket Sosial Media
11. Paket Brand Kopi Keliling

---

# 11. Service Brief Requirements

## 11.1 Logo Minimalis

Required:

- `brand_name` — Nama Brand / Usaha
- `business_desc` — Bidang Usaha & Deskripsi Singkat
- `colors` — Warna Utama & Yang Dihindari

Optional:

- `tagline` — Slogan / Tagline
- common references

Common reference storage:

```text
reference_items_json
```

---

## 11.2 Logo Ilustrasi

Required:

- `brand_name`
- `business_desc`
- `colors`

Optional:

- `tagline`
- common references

Storage:

```text
reference_items_json
```

---

## 11.3 Poster Menu

Required:

- `main_text` — Informasi Teks & Daftar Menu / Promosi
- `size` — Ukuran Desain / Media Cetak
- `style` — Nuansa / Gaya Desain

Optional:

- `brand_logo_url`

Repeatable product items:

```text
menu_items[]
  - id
  - image
  - caption
```

Storage:

```text
menu_items_json
```

Common references may use:

```text
reference_items_json
```

---

## 11.4 Banner UMKM

Required:

- `main_text`
- `size`
- `style`

Optional:

- `brand_logo_url`

Repeatable:

```text
menu_items_json
```

Common references:

```text
reference_items_json
```

---

## 11.5 Baliho / Spanduk Ads

Required:

- `main_text`
- `size`
- `style`

Optional:

- `brand_logo_url`

Repeatable:

```text
menu_items_json
```

Common references:

```text
reference_items_json
```

---

## 11.6 Packaging Pouch

Required:

- `dimensions` — Ukuran Detail Kemasan (P x L x T)
- `mandatory_info` — Informasi Wajib pada Kemasan
- `color_concept` — Konsep Warna Kemasan

Common references:

```text
reference_items_json
```

---

## 11.7 Packaging Box

Required:

- `dimensions`
- `mandatory_info`

Special requirement:

Multiple box reference uploads.

Storage:

```text
box_references_json
```

The box reference module is the primary specialized reference module for this service.

Do not silently replace it with the generic common reference module.

---

## 11.8 Sticker Label

Required:

- `sticker_shape` — Bentuk & Ukuran Sticker
- `sticker_media` — Penggunaan Pada Media Apa
- `sticker_text` — Teks / Informasi pada Label

Optional:

```text
reference_items_json
```

### Important Requirement Boundary

The approved detailed client-brief specification defines Sticker Label using the fields above.

A separate AGENTS requirement also mentions a specialized multi-side Sticker Builder with:

- width
- height
- dimensions in cm
- material notes
- positional photo references

This document does **not silently replace** the approved Sticker Label fields with that specialized builder.

If the specialized multi-side Sticker Builder is required as an implementation change, it must be explicitly confirmed and its final data contract defined before replacing the existing Sticker Label contract.

---

## 11.9 Frame Photobooth

Required:

- `photobooth_size`
- `vendor_name`
- `event_theme`

`photobooth_size` options:

```text
4R — Standar Strip / Grid Photo
Newspaper A3 — Tema Koran Unik & Aesthetic
```

Optional:

- `vendor_logo_url`
- common references

The builder must support the relevant event and vendor information needed by production.

---

## 11.10 Paket Sosial Media

Required:

- `sosmed_platform` — Platform & Kebutuhan Konten
- `sosmed_vibe` — Gaya Visual & Tone of Voice
- `main_text` — Informasi Teks & Daftar Menu / Promosi

Common references:

```text
reference_items_json
```

---

## 11.11 Paket Brand Kopi Keliling

Required:

- `brand_name`
- `main_text`

Optional:

- `brand_logo_url`

Specialized reference:

```text
cart_references_json
```

### Cart Side Builder

Default sides:

```text
Sisi Depan Gerobak — 100 × 80 cm
Sisi Kanan Gerobak — 60 × 80 cm
Sisi Kiri Gerobak — 60 × 80 cm
```

Each side contains:

```text
sideName
dimensions
textBrief
imageBrief
```

Client can add/remove sides where the UI allows dynamic configuration.

Storage:

```text
cart_sides_json
```

### Coffee Menu Builder

Main menu brief:

```text
main_text
```

Repeatable products:

```text
kopi_menu_items[]
  - id
  - image
  - caption
```

Storage:

```text
kopi_menu_items_json
```

The generic `reference_items_json` module is not the primary reference module for this service.

---

# 12. Common Reference Module

The common reference module is available for:

- Logo Minimalis
- Logo Ilustrasi
- Poster Menu
- Banner UMKM
- Baliho / Spanduk Ads
- Packaging Pouch
- Sticker Label
- Frame Photobooth
- Paket Sosial Media

It is not the primary reference module for:

- Packaging Box
- Paket Brand Kopi Keliling

## 12.1 Capabilities

### Multiple Image References

Clients can upload multiple visual references.

### URL References

Clients may provide reference URLs, such as:

- website
- Pinterest
- other visual reference URLs

Storage:

```text
reference_items_json
```

---

# 13. Field Behavior Matrix

| Service | Required Core Fields | Repeatable Data | Special Upload |
|---|---|---|---|
| Logo Minimalis | `brand_name`, `business_desc`, `colors` | No | Moodboard |
| Logo Ilustrasi | `brand_name`, `business_desc`, `colors` | No | Moodboard |
| Poster Menu | `main_text`, `size`, `style` | Products | Brand logo |
| Banner UMKM | `main_text`, `size`, `style` | Products | Brand logo |
| Baliho / Spanduk Ads | `main_text`, `size`, `style` | Products | Brand logo |
| Packaging Pouch | `dimensions`, `mandatory_info`, `color_concept` | No | Moodboard |
| Packaging Box | `dimensions`, `mandatory_info` | Box references | Box references |
| Sticker Label | `sticker_shape`, `sticker_media`, `sticker_text` | No | Moodboard |
| Frame Photobooth | `photobooth_size`, `vendor_name`, `event_theme` | No | Vendor logo |
| Paket Sosial Media | `sosmed_platform`, `sosmed_vibe`, `main_text` | No | Moodboard |
| Paket Brand Kopi Keliling | `brand_name`, `main_text` | Cart sides + products | Cart/logo/reference |

---

# 14. Canonical Data Keys

The approved canonical form keys are:

```text
brand_name
tagline
business_desc
colors
main_text
size
style
dimensions
mandatory_info
color_concept
sticker_shape
sticker_media
sticker_text
photobooth_size
vendor_name
event_theme
sosmed_platform
sosmed_vibe
brand_logo_url
vendor_logo_url
reference_items_json
menu_items_json
box_references_json
cart_references_json
cart_sides_json
kopi_menu_items_json
```

Do not silently rename these keys when implementing against an existing data contract.

---

# 15. Brief Submission Contract

When a client submits a brief:

1. Find the project/order using the token.
2. Validate the token.
3. Confirm the link is active.
4. Validate all required fields.
5. Confirm required uploads/assets have been registered.
6. Serialize dynamic repeatable data into the correct JSON fields.
7. Save the complete brief as project form data.
8. Mark the one-time link as used.
9. Persist the project.
10. Refresh the administrative project state.
11. Make invoice/tracking information available.
12. Notify the client that the brief has been successfully submitted.

The exact persistence mechanism may differ between the current prototype and production architecture, but the business result must remain equivalent.

---

# 16. Project Workflow / Kanban

The business process uses project production statuses.

Core simplified statuses:

```text
BELUM_DIKERJAKAN
SEDANG_DIKERJAKAN
SELESAI
```

A richer internal lifecycle may be used where useful:

```text
NEW
ASSIGNED
IN_PROGRESS
IN_REVIEW
REVISION
COMPLETED
CANCELLED
```

The implementation must clearly distinguish internal workflow state from client-facing status if both are used.

**Implementation status: ✅ Implemented**

Kanban board at `src/components/kanban/kanban-board.tsx`:
- 4 columns: **Draft**, **Belum Dikerjakan**, **Sedang Dikerjakan**, **Selesai** (DRAFT + 3 core statuses)
- Native HTML5 drag-and-drop — draggable project cards, drop targets on columns
- `onDrop` fires `onProjectMove(projectId, newStatus)` callback
- Designer assignment button inline in each card
- Status badges, priority badges, deadline with overdue indicator
- Freelancer indicator (FL badge) on assigned designer avatar

Projects page (`/projects`) uses KanbanBoard with `onProjectMove` wired to `PUT /api/projects/[id]/status`.

---

# 17. Designer Assignment

After the client brief is available:

```text
Project Ready
    |
    v
Admin reviews project
    |
    v
Assign Designer
    |
    v
Designer receives project
```

Assignment must retain:

- assigned worker
- worker type
- assignment history where required
- freelancer payout where applicable

**Implementation status: ✅ Implemented**

Designer assignment via dialog in projects page (`/projects`):
- `POST /api/projects/[id]/assignments` — assigns designer to project
- Stores: designerId, workerType (FULL_TIME/FREELANCER), freelancerPayout (number), assignedAt
- `ProjectAssignment` model retains assignment history
- Designer can be reassigned; each assignment is timestamped
- Designer receives project in their `/designer` workspace

---

# 18. Production Workspace

Designer needs access to:

- project identity
- client-safe brief information required for production
- uploaded client assets
- references
- deadline
- project status
- revision history
- progress upload
- deliverable upload

Designer can:

- change production status
- upload progress
- upload preview/final files
- respond to client revisions

Internal financial information should remain restricted.

**Implementation status: ✅ Implemented**

BriefReader component (`src/components/forms/brief/BriefReader.tsx`) provides structured brief display for designer workspace:
- Parses brief responses and categorizes by type: logo/image fields, JSON table fields (menu items, cart sides, references), image galleries, regular text fields
- Logo fields rendered as clickable image previews with "open in new tab" link
- Menu items and cart sides rendered as formatted tables with IDR currency formatting
- Reference images rendered as responsive grid galleries
- Regular fields show with human-readable labels (not underscored keys)
- Service info card at bottom shows service name/code and field requirements

---

# 19. Client Progress Tracking

The client portal is tokenized and must show only client-safe information.

Client can see, as appropriate:

- project/service
- invoice
- payment state
- project status
- progress files intended for client
- revision quota/usage
- revision history
- final deliverable when approved

Client must not see internal:

- freelancer payout
- internal notes
- internal margin calculations
- unrelated projects
- administrative controls

**Implementation status: ✅ Implemented**

Client portal (`src/app/client/[token]/page.tsx`) shows only client-safe information:
- Project/service name and number
- Invoice (latest invoice card with number, date, total)
- Payment state (status badge + paid/agreed amount)
- Project status (badge)
- Progress files intended for client (unified chronological timeline)
- Revision quota/usage (Sisa Revisi: `{n}x / 3x`)
- Revision history (unified chronological timeline — combined with progress updates)
- Final deliverable when approved (finalSubmittedAt/finalApprovedAt + "Approve Final Work" button)

Internal information (freelancer payout, internal notes, margin calculations, admin controls) is never exposed to the client tokenized portal.

---

# 20. Revision Management

## 20.1 Maximum

Maximum free revisions:

```text
3
```

## 20.2 Revision Submission

A revision request must contain meaningful notes.

Client may also upload revision reference images.

## 20.3 Revision Count

Each accepted revision submission increments the revision count.

Example:

```text
0/3
1/3
2/3
3/3
```

When the quota reaches 3:

```text
Free revision quota exhausted
```

The system must prevent an additional free revision request.

## 20.4 Required Notice

The client-facing revision notice must preserve this wording:

> **Mohon diisi revisi sebaik mungkin karena akan terhitung 1x jika kamu hanya input tidak lengkap**

**Implementation status: ✅ Implemented**

- `MAX_REVISION_QUOTA = 3` — hardcoded in client portal
- Revision submission: textarea for description (BRD 20.2 — meaningful notes required) + multi-file image upload
- **BRD 20.2** — "Client may also upload revision reference images" — implemented via file input in revision form, files uploaded to R2 bucket with `category: REVISION`, attachmentIds passed to revision API, attachments linked to revision record
- Revision count display: `remainingQuota` shown as `{n}x / 3x` in tracking card
- Quota enforcement: "Request Revision" button disabled when quota exhausted (BRD 20.3)
- Required notice: exact BRD 20.4 wording preserved in yellow warning box before revision form
- Client-side quota tracking via `MAX_REVISION_QUOTA - revisions.length`

---

# 21. Final Approval

The project reaches final approval after the client accepts the final work.

Expected flow:

```text
Designer final submission
        |
        v
Client review
        |
        v
Client approves
        |
        v
Final approved
```

Final approval is distinct from payment status.

**Implementation status: ✅ Implemented**

Implementation details:
- `Project.finalSubmittedAt` — set when designer submits final work
- `Project.finalApprovedAt` — set when client approves
- `Project.status` changes to `SELESAI` on final approval
- Designer submits via "Submit Final Work" in Workspace (Progress tab)
- Client approves via "Approve Final Work" in tokenized portal
- Designer can attach final deliverable files (category: FINAL)
- Revision quota (3x) remains available after final submission
- `POST /api/designer/projects/[id]/submit-final` — designer final submission endpoint
- `POST /api/client-links/[token]/approve-final` — client approval endpoint

---

# 22. Invoice

Each project has invoice information.

Invoice should include client-safe financial/project information such as:

- invoice number
- client
- service
- agreed project price
- payment status
- DP
- remaining balance
- project/deadline information where appropriate

Client can view/download the invoice through the tokenized portal.

Internal payout calculations must not be exposed in the client invoice.

**Implementation status: ✅ Implemented**

PDF invoice generation and Create Invoice UI (admin-side):
- `@react-pdf/renderer` — client-side PDF generation
- `InvoicePDF` component — styled A4 invoice with YukDesain branding
- `handleDownloadPDF()` — generates and downloads PDF via `file-saver`
- Download button in invoice table row + detail dialog
- Invoice includes: invoice number, client, project, date, items table, subtotal, tax, total, payment status
- Create Invoice Dialog — "Buat Invoice" button in `/invoices` page header; supports selecting project, adding multiple line items (description/qty/unit price), tax amount input, due date selection, and live total calculation via `CurrencyInput`

---

# 23. Financial Management

The system must record:

- gross project income
- DP
- pelunasan
- freelancer payout
- payment status
- net studio revenue

Core formulas:

```text
Gross Income
= SUM(Order Prices)
```

```text
Total Freelancer Expenses
= SUM(Freelancer Payout Fees)
```

```text
Net Studio Revenue
= Gross Income - Total Freelancer Expenses
```

These are business calculations and should be based on recorded project/payment data.

**Implementation status: ✅ Implemented**

Financial metrics are computed in `src/app/api/dashboard/route.ts`:
- **Gross Income** = `SUM(agreedPrice)` from projects created this month
- **Total Freelancer Expenses** = `SUM(freelancerPayout)` from `ProjectAssignment` records this month
- **Net Studio Revenue** = Gross Income − Freelancer Expenses
- **Outstanding Payments** = SUM(agreedPrice − paidAmount) for `UNPAID` / `PARTIALLY_PAID` projects
- Dashboard displays all four metrics in the Financial Summary card (BRD Appendix D)

---

# 24. Freelancer / Workforce Management

Workers can be:

```text
FULL_TIME
FREELANCER
```

For freelancer projects, the system must support recording the agreed freelancer payout.

The payout is an internal financial value.

It contributes to:

```text
Total Freelancer Expenses
```

and therefore affects:

```text
Net Studio Revenue
```

**Implementation status: ✅ Implemented**

- `ProjectAssignment.freelancerPayout` (number) — recorded by admin when assigning freelancer
- Shown as editable `CurrencyInput` field in designer assignment dialog (`src/app/(dashboard)/projects/page.tsx`)
- Fed into monthly financial calculation in dashboard API (`src/app/api/dashboard/route.ts`)

---

# 25. Audit & History

The system should preserve important operational history, including where applicable:

- project creation
- brief submission
- designer assignment
- status changes
- progress uploads
- revision submissions
- final approval
- payment changes
- freelancer allocation
- completion

History must make it possible for the Owner/Admin to understand what happened to a project.

**Implementation status: ✅ Implemented**

- `src/app/(dashboard)/activity-history/page.tsx` — chronological activity log for all projects
- Tracks: brief submission, designer assignment, status changes, progress uploads, revision submissions, final approval, payment changes, freelancer allocation, completion
- Admin-accessible activity history page

---

# 26. Attachments & Storage

Production architecture should use:

```text
Cloudflare R2 / S3-compatible object storage
```

**Free tier (sufficient for 50–60 clients/month):**

- 500 GB storage/month (free)
- 1,000,000 Class A requests/month (free)
- 10,000,000 Class B requests/month (free)
- **Zero egress charges** — critical advantage over AWS S3

Files should have metadata.

Private files must not be publicly exposed without authorization.

**Implementation status: ✅ Implemented**

Upload flow uses server-side upload (browser → Next.js API → R2 via AWS SDK) to avoid CORS issues:

- `src/lib/storage.ts` — R2/S3 client helpers
- `src/app/api/upload/route.ts` — Authenticated upload endpoint
- `src/app/api/client-links/[token]/upload/route.ts` — Public upload via client link token (server-side, no CORS)
- `src/components/forms/brief/ReferenceUploader.tsx` — drag-drop image upload + URL reference
- Attachment model stores: filename, mimeType, size, storageKey, uploaderId, category (enum), polymorphic links (briefId/projectId/updateId/revisionId)
- Public URL format: `https://pub-<account-id>.r2.dev/<storageKey>` (uses R2 public subdomain)

Attachment categories (enum):

- `CLIENT_ASSET` — uploaded by client (assets, logos)
- `BRIEF_REFERENCE` — reference images from brief form
- `LOGO` — logo uploads
- `PROGRESS` — progress update files
- `FINAL` — final deliverables
- `REVISION` — revision reference files
- `INVOICE` — invoice-related documents

The implementation must distinguish client-uploaded references from internal production files where required.

---

# 27. Search & Filtering

Admin needs practical search/filter capabilities for approximately 50–60 orders per month.

Useful filters include:

- client
- service
- project status
- payment status
- designer
- deadline
- worker type
- completion state

Search should prioritize operational usefulness over complex analytics.

**Implementation status: ✅ Implemented**

Enhanced filter bar on `/projects` page with 6 dropdown filters (all AND-combined):
- **Layanan** — filter by service type
- **Status** — filter by project status (Draft, Menunggu Brief, Dikerjakan, Selesai)
- **Pembayaran** — filter by payment status (Belum Bayar, DP, Lunas)
- **Designer** — filter by assigned designer
- **Tipe Worker** — filter by Full Time or Freelancer
- **Deadline** — filter by overdue / today / 7 days / 30 days

Reset button clears all active filters; result count shows "X dari Y project".

---

# 28. Dashboard Requirements

Owner/Admin dashboard should provide an operational overview such as:

- active projects
- projects by status
- upcoming deadlines
- payment status
- assigned designers
- pending client reviews
- revision activity
- financial summary

Designer dashboard should focus on:

- assigned projects
- deadlines
- current status
- client brief
- pending revisions
- upload actions

Client portal should focus on:

- project status
- invoice/payment information
- progress
- revision actions
- final deliverables

**Implementation status: ✅ Implemented**

Enhanced dashboard (`/dashboard`) with all required sections:
- **active projects** — Active Projects stat card
- **projects by status** — Projects by Status card with horizontal bar chart (count + percentage per status)
- **upcoming deadlines** — Deadline Mendatang card showing projects due within 3 days (urgent badge for ≤2 days)
- **payment status** — Outstanding Payments card with total amount and order count
- **assigned designers** — Assigned Designers card listing designers with active project count
- **pending client reviews** — Pending Review card showing pending revision requests
- **revision activity** — Revision count in Outstanding Payments card
- **financial summary** — Gross Income, Freelancer Expense, Net Revenue (monthly)

API endpoint (`/api/dashboard`) returns: projectsByStatus, assignedDesigners, pendingRevisions, recentRevisions alongside existing metrics.

---

# 29. UI / UX Requirements

The interface must be:

- responsive
- accessible
- consistent
- production-oriented
- clear for non-technical clients
- efficient for admins
- focused for designers

Required system states include:

```text
Default
Loading
Empty
Error
Success
Disabled
Submitting
Saving
Unauthorized
Forbidden
Not Found
Expired
Locked
Quota Exhausted
```

Avoid:

- generic AI SaaS appearance
- unnecessary gradients
- excessive cards
- excessive shadows
- decorative UI that does not support workflow
- inconsistent spacing
- arbitrary visual patterns
- unnecessary complexity

Existing approved design system should be reused.

---

# 30. Technical Architecture Requirements

Production stack defined by the approved development contract:

```text
Next.js 16
TypeScript
Tailwind CSS
shadcn/ui
Poppins
React Hook Form
Zod
TanStack Query where needed
Prisma
PostgreSQL
Auth.js or Better Auth
Cloudflare R2 / S3-compatible storage
Resend
Vitest
Playwright
Vercel
```

Architecture preference:

```text
Modular Monolith
```

Do not introduce distributed architecture without explicit approval.

---

# 31. Security Requirements

## 31.1 Token Security

Tokens must be:

- cryptographically unpredictable
- unique
- non-sequential
- server validated
- expiration-aware
- rate-limited where applicable

Do not log full sensitive tokens unnecessarily.

## 31.2 Authorization

Every protected action must validate authorization server-side.

Client token access must only expose the associated client-safe project.

## 31.3 Data Separation

Internal and external data must have an explicit boundary.

A client must never obtain internal project data simply by manipulating frontend state or URLs.

---

# 32. Validation Requirements

Required client brief fields must be validated before submission.

Validation must cover:

- required text
- valid selected options
- file type where relevant
- upload metadata
- repeatable item integrity
- revision note requirements
- token validity
- link status

Validation should be implemented using typed schemas where applicable.

---

# 33. Accessibility & Responsive Requirements

The application must support:

- keyboard navigation
- readable labels
- sufficient interaction targets
- accessible form controls
- clear validation errors
- mobile-friendly client brief
- responsive admin dashboard
- responsive designer workspace
- accessible upload interactions

The client brief is especially important on mobile because clients may open the tokenized link from WhatsApp.

---

# 34. Current Prototype Compatibility

The existing prototype uses a client-side state model and local persistence.

Existing important fields include:

```text
token
clientName
category
price
orderDate
deadline
status
formData
assignedDesignerId
freelancerFee
projectStatus
progressFiles
revisions
invoiceNo
```

Existing category-specific JSON fields include:

```text
menu_items_json
box_references_json
cart_references_json
cart_sides_json
kopi_menu_items_json
reference_items_json
```

When extending the existing prototype, preserve compatible behavior unless a newer approved requirement explicitly changes it.

---

# 35. Business Rules That Must Not Be Silently Changed

The following are explicit business rules:

1. Order and project are one entity in the current model.
2. DP is recorded before the brief link is generated (Path §5.1). In the WhatsApp AI path (§5.2), the DP is verified by admin and recorded at the moment the project is created.
3. Client does not require a login in the current model.
4. Client access is tokenized.
5. One-time links cannot be reused after successful submission.
6. Brief forms depend on service category.
7. Repeatable service data must be preserved structurally.
8. Maximum free revisions are 3.
9. Revision notes are required.
10. The required revision warning text must be preserved.
11. Freelancer payout is an internal financial value.
12. Client must not see internal financial data.
13. Payment status and production status are separate concerns.
14. WhatsApp remains communication; YukDesain remains the system of record. The WhatsApp AI bot never sets price, deadline, DP validity, or creates a project on its own.
15. Do not silently replace the existing Sticker Label contract with the specialized Sticker Builder requirement.

---

# 36. Critical End-to-End Acceptance Scenario

A complete implementation must support this business scenario:

```text
1. Owner receives client order through WhatsApp.
2. Client and Owner agree on service and price.
3. Client pays DP.
4. Owner records the project and DP.
5. Owner generates a one-time brief link.
6. Client opens the link.
7. Client sees the form for the selected service.
8. Client fills required fields.
9. Client uploads required/relevant assets.
10. Client submits the brief.
11. Link becomes used and cannot be resubmitted.
12. Project becomes ready for production.
13. Owner assigns a designer.
14. Designer sees the project and brief.
15. Designer moves project into production.
16. Designer uploads progress/preview.
17. Client opens the tracking portal.
18. Client reviews the progress.
19. Client either approves or submits a revision.
20. If revision is submitted, the revision count increases.
21. Designer handles the revision.
22. Client reviews again.
23. The system blocks free revision after the third revision.
24. Client approves the final design.
25. Project reaches completed/final state.
26. Pelunasan is recorded.
27. Payment status becomes PAID.
28. Project is available in history/archive.
29. Freelancer payout is included in expense calculation where applicable.
30. Financial recap reflects gross income, freelancer expense, and net studio revenue.
```

---

# 37. Acceptance Criteria by Module

## Client Brief

- Correct service form is shown.
- Required fields are enforced.
- Dynamic builders work.
- Uploads are associated with the project.
- References are preserved.
- Submission consumes the one-time link.

## Admin

- Can create project.
- Can record payment.
- Can generate brief link.
- Can assign designer.
- Can manage project status.
- Can access invoice.
- Can see financial data.
- Can see history.

## Designer

- Can see assigned work.
- Can see required brief data.
- Can update production status.
- Can upload progress.
- Can handle revisions.

## Client Portal

- Token access works.
- Project status is visible.
- Invoice is visible.
- Progress is visible.
- Revision can be submitted.
- Revision quota is enforced.
- Internal data is hidden.

## Finance

- Project price is recorded.
- DP is recorded.
- Pelunasan is recorded.
- Payment status is correct.
- Freelancer payout is recorded.
- Gross income is calculated.
- Freelancer expenses are calculated.
- Net studio revenue is calculated.

---

# 38. Testing Requirements

Applicable validation should include:

```text
Typecheck
Lint
Unit tests
Integration tests
E2E tests
Build
```

Critical E2E flow:

```text
Owner creates one-time link
→ Client submits brief
→ Project becomes active
→ Invoice available
→ Owner assigns designer
→ Designer updates Kanban
→ Designer uploads deliverable
→ Client tracks
→ Client submits revision
→ Revision quota increments
→ Final approval
→ Pelunasan
→ Project completed
```

---

# 39. Requirement Conflict Register

## Sticker Builder

There are two documented requirements:

### Existing detailed client-brief contract

Sticker Label uses:

```text
sticker_shape
sticker_media
sticker_text
reference_items_json
```

### Separate development contract requirement

A specialized Sticker Builder is described with:

- multi-side cart sticker configuration
- width
- height
- dimensions in cm
- material notes
- positional photo references

### Final BRD decision

The existing detailed Sticker Label contract remains the source of truth for the current BRD.

The specialized Sticker Builder must not silently replace it.

If the business intends to introduce the specialized builder as a change, define and approve its final fields, UI behavior, storage schema, and migration impact first.

## WhatsApp Automation

### Previous requirement

Automated WhatsApp messaging was out of scope for MVP (§3.2). DP was collected manually before an admin-generated brief link.

### Approved change (owner, 2026-11-01, v2)

WhatsApp AI Chatbot & Order Intake is in scope, specified in `docs/WHATSAPP_AI_CHATBOT.md`. It adds an alternative intake path (§5.2) and DP verification flow (§7.4).

### Final decision

- Both intake paths coexist. The one-time link flow must keep its current behavior.
- The decisions table in §5.2 is binding.
- Open questions listed in `docs/WHATSAPP_AI_CHATBOT.md` §21 must be answered by the owner, not assumed.

---

# 40. Requirement Priority

When implementing the system, use this order:

1. Latest approved BRD / explicit user requirement
2. Existing approved project documentation
3. Existing repository behavior that does not conflict
4. Technical development rules
5. Reasonable implementation inference

When requirements conflict, do not silently invent a resolution.

Ask for clarification when the conflict changes:

- business behavior
- permissions
- financial rules
- data structure
- client/private boundaries
- destructive migration
- architecture

---

# 41. Product Success Definition

YukDesain Studio Portal is successful when the Owner can manage a design project from:

```text
DEAL
→ DP
→ PROJECT
→ BRIEF
→ ASSIGNMENT
→ PRODUCTION
→ REVIEW
→ REVISION
→ APPROVAL
→ PELUNASAN
→ COMPLETION
→ FINANCIAL RECAP
```

without needing the critical project state to remain only inside WhatsApp.

The system should make it clear:

- who the client is
- what was ordered
- how much it costs
- what has been paid
- what the client requested
- who is working on it
- what the current status is
- what files have been produced
- how many revisions remain
- whether the project is approved
- whether it has been paid
- what freelancer cost was incurred
- what the resulting studio revenue is

---

# 42. Final Business Principle

> **YukDesain Studio Portal is the operational source of truth that connects client intake, design production, revision, payment, and financial control into one project lifecycle.**

The system should prioritize:

**clarity → reliability → traceability → security → maintainability**

over unnecessary features or complexity.

---

# Appendix A — Canonical Business Vocabulary

| Term | Meaning |
|---|---|
| Project | The central record representing an order and its production lifecycle |
| Client | External customer using tokenized access |
| Owner/Admin | Person controlling operations and finances |
| Designer/Worker | Person executing assigned design work |
| DP | Down payment received before brief link generation |
| Pelunasan | Remaining payment after/following final completion process |
| Brief | Structured client requirements |
| One-Time Link | Secure tokenized link used to submit a brief |
| Revision | Client-requested change after review |
| Freelancer Fee | Internal payout allocated to a freelancer |
| Gross Income | Sum of project prices |
| Freelancer Expense | Sum of freelancer payouts |
| Net Studio Revenue | Gross income minus freelancer expenses |
| Invoice | Client-facing project/payment document |
| Client Portal | Tokenized external project tracking interface |

---

# Appendix B — Canonical Service List

```text
Logo Minimalis
Logo Ilustrasi
Poster Menu
Banner UMKM
Baliho / Spanduk Ads
Packaging Pouch
Packaging Box
Sticker Label
Frame Photobooth
Paket Sosial Media
Paket Brand Kopi Keliling
```

---

# Appendix C — Canonical Statuses

Production:

```text
BELUM_DIKERJAKAN
SEDANG_DIKERJAKAN
SELESAI
```

Optional richer internal workflow:

```text
NEW
ASSIGNED
IN_PROGRESS
IN_REVIEW
REVISION
COMPLETED
CANCELLED
```

Payment:

```text
UNPAID
PARTIALLY_PAID
PAID
```

Token:

```text
CREATED
ACTIVE
USED
EXPIRED
```

---

# Appendix D — Canonical Financial Formulas

```text
Gross Income
= SUM(Order Prices)
```

```text
Total Freelancer Expenses
= SUM(Freelancer Payout Fees)
```

```text
Net Studio Revenue
= Gross Income - Total Freelancer Expenses
```

---

# Appendix E — AI Agent Implementation Principle

Before adding functionality:

> **Does this make YukDesain easier to use, easier to maintain, safer, or more reliable?**

If not, do not add it.

Prefer:

```text
Small coherent change
>
large rewrite
```

The implementation goal is not maximum code.

> **The goal is the smallest amount of high-quality code that correctly implements the approved business requirement.**

---

# 43. Deployment & Go-Live Process

## 43.1 Deployment Objective

Deployment must move the YukDesain Studio Portal from development into a production environment in a controlled, reversible, and auditable manner.

The production deployment must preserve the approved business rules, database integrity, client brief flow, project workflow, payment records, file attachments, revision history, and access boundaries.

The deployment process must not introduce breaking changes to existing project data.

---

## 43.2 Target Production Architecture

The initial production architecture is a modular monolith and should remain operationally simple.

Recommended baseline:

```text
Internet
   │
   ▼
Cloudflare / DNS / CDN
   │
   ▼
HTTPS
   │
   ▼
Next.js Application Server
   │
   ├── PostgreSQL Database
   │
   ├── Cloudflare R2 / S3-Compatible Storage
   │
   └── Transactional Email Provider
```

### Initial server baseline

For approximately 50–60 orders/clients per month:

- 2 vCPU
- 4 GB RAM
- 40–60 GB SSD
- Ubuntu 24.04 LTS or equivalent supported Linux distribution
- HTTPS enabled
- automated database backup
- object storage for uploaded files

A production setup that keeps application and PostgreSQL on the same server may use:

- 4 vCPU
- 8 GB RAM
- 80–100 GB SSD

The server disk must not be treated as the primary long-term storage for client design assets.

---

## 43.3 Environments

The project should have at least these environments:

### Development

Purpose:

- local development
- feature implementation
- debugging
- unit/component testing

Development data must not contain real client production data unless explicitly authorized and appropriately sanitized.

### Staging

Purpose:

- production-like validation
- database migration testing
- end-to-end testing
- upload/storage testing
- authentication and authorization testing
- final release candidate verification

Staging should use separate credentials, database, storage bucket/prefix, and transactional email configuration from production.

### Storage Credentials

Cloudflare R2 uses S3-compatible API. Required environment variables:

```env
STORAGE_BUCKET=yukdesain-assets          # R2 bucket name
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com  # S3-compatible API endpoint
STORAGE_ACCESS_KEY=<R2 API Token key_id>
STORAGE_SECRET_KEY=<R2 API Token secret>
STORAGE_PUBLIC_URL_BASE=https://pub-<hash>.r2.dev  # from R2 bucket Settings → Public access
```

**Important:** `STORAGE_ENDPOINT` must be the account-level URL without the bucket name (e.g. `https://455d...r2.cloudflarestorage.com`). The AWS SDK appends the bucket name automatically to the endpoint URL. Including the bucket name in the endpoint results in a double-bucket path.

**Note:** The `STORAGE_PUBLIC_URL_BASE` (public subdomain hash) may differ from the account ID in `STORAGE_ENDPOINT`. Find the correct public URL in **Cloudflare → R2 → bucket → Settings → Public access**. This URL is used to serve files publicly.

R2 API tokens are created in the Cloudflare dashboard under **R2 → Manage API Tokens**. Use "Edit Token" template or create a custom token with only Object Read & Write permissions on the specific bucket.

**Public file access in development:** R2 provides a public `*.r2.dev` subdomain per bucket automatically. For development without a custom domain, use the `pub-<account-id>.r2.dev` URL format:

```env
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
# publicUrl = https://pub-<account-id>.r2.dev/<storageKey>
```

> Note: `*.r2.dev` is rate-limited and not recommended for production. Connect a custom domain to the bucket for production workloads.

For public file access, either:
- Enable **public bucket** access on the bucket, or
- Use a Cloudflare Worker + Custom Domain to serve files with authorization checks

### Production

Purpose:

- live YukDesain operations
- real client projects
- real payment records
- real project files
- official client portal links

Production credentials and secrets must never be committed to source control.

---

## 43.4 Domain and DNS

Before go-live:

1. Register or confirm the production domain.
2. Configure DNS through the selected DNS provider.
3. Point the application domain to the production server/platform.
4. Configure HTTPS/TLS.
5. Verify HTTP redirects to HTTPS.
6. Verify the canonical production hostname.
7. Verify client tokenized URLs work under the production domain.
8. Verify uploaded-file URLs/access controls use the intended production storage configuration.

Recommended production separation:

```text
app.yukdesain.<tld>
```

or the approved production domain defined by the business.

The final hostname is a deployment decision and must not be hard-coded throughout the application.

---

## 43.5 Server Provisioning

The production server must be provisioned with:

- supported Linux OS
- non-root deployment user
- SSH key authentication
- firewall
- automatic security updates where appropriate
- Node.js version compatible with the approved Next.js version
- package manager used by the repository
- process manager or managed hosting runtime
- reverse proxy where required
- PostgreSQL if self-hosted
- required system dependencies
- log rotation
- monitoring/health-check mechanism

Root access should be restricted to infrastructure administration.

---

## 43.6 Application Configuration

Production environment variables must be configured through the hosting platform or server secret manager.

Examples of configuration categories:

```text
DATABASE_URL
AUTH_SECRET
APP_URL
NEXT_PUBLIC_APP_URL

OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY

EMAIL_PROVIDER_API_KEY
EMAIL_FROM

PAYMENT_PROVIDER_*          # only if later integrated
```

Exact variable names must follow the implementation.

Secrets must:

- never be committed to Git
- never be placed in client-side JavaScript
- never be embedded in public environment variables unless intentionally public
- be rotated if exposed
- be different between development, staging, and production

---

## 43.7 Database Deployment

Before the first production release:

1. Create the production PostgreSQL database.
2. Apply the approved Prisma schema.
3. Run migrations using the repository's migration process.
4. Verify indexes and constraints.
5. Verify required seed/reference data.
6. Verify database connection pooling/configuration.
7. Create the initial administrative account through the approved authentication flow.
8. Confirm database backup works.

Production schema changes must use versioned migrations.

Do not manually modify production tables as a substitute for repository migrations.

---

## 43.8 Database Migration Safety

Every production migration must be evaluated for:

- data loss
- nullable/non-nullable changes
- default values
- index creation
- foreign-key constraints
- enum/status changes
- existing-record compatibility
- rollback implications
- migration duration

For destructive migrations:

1. create a verified backup;
2. test the migration against a production-like database;
3. confirm the application version is compatible;
4. perform the migration during an appropriate maintenance window if required;
5. verify the data afterward.

The deployment process must never assume that a database rollback is equivalent to an application rollback.

---

## 43.9 Object Storage Deployment

Client and production design files should be stored in Cloudflare R2 or another S3-compatible object storage service.

**Cloudflare R2 free tier — confirmed sufficient for current scale:**

- 500 GB storage/month (free)
- 1M Class A + 10M Class B requests/month (free)
- **Zero egress fees** (unlike AWS S3 which charges ~$0.09/GB)

For 50–60 orders/month with brief references, progress files, and final deliverables, the free tier is expected to cover operations with headroom. Storage cost is effectively **Rp0/month** at this scale.

Storage must support:

- client reference images
- logos
- product images
- progress files
- revision files
- final design files
- invoice-related attachments where applicable

The application database should store file metadata and references rather than large binary files.

Minimum metadata should include, where applicable:

- project ID
- original filename
- storage key
- MIME type
- file size
- upload timestamp
- uploader/source
- visibility/access classification

Private files must not be exposed through unrestricted public buckets.

---

## 43.10 Email Deployment

Transactional email configuration must be separated by environment.

Production email should be verified before go-live.

Test at minimum:

- sender identity
- client brief invitation
- project/revision notification if implemented
- payment-related notification if implemented
- error handling for failed email delivery

Email failure must not silently mark a business process as completed if the email is a required part of that process.

---

## 43.11 Build and Release Process

The recommended release flow is:

```text
Developer
   │
   ▼
Git branch
   │
   ▼
Pull Request
   │
   ├── TypeScript check
   ├── Lint
   ├── Unit tests
   ├── Build
   └── Playwright / E2E
   │
   ▼
Review / Approval
   │
   ▼
Staging deployment
   │
   ▼
Smoke test
   │
   ▼
Production deployment
   │
   ▼
Post-deployment verification
```

Production deployment should use a known Git commit/tag rather than an untracked local working directory.

---

## 43.12 CI/CD Requirements

CI/CD should automatically validate:

- dependency installation
- TypeScript compilation
- linting
- unit tests
- production build
- relevant integration tests
- relevant Playwright/E2E tests

A production deployment must be blocked when required validation fails.

The exact CI/CD provider is an implementation decision and may use GitHub Actions, Vercel deployment workflows, or another approved platform.

---

## 43.13 Pre-Go-Live Business Checklist

Before opening the system for real clients, verify:

### Client Intake

- [ ] Admin can create a project.
- [ ] Price is recorded correctly.
- [ ] DP status/value is recorded correctly.
- [ ] Deadline is recorded correctly.
- [ ] One-time brief link is generated.
- [ ] Link cannot be reused after submission.
- [ ] Expired/invalid links are rejected.
- [ ] Correct category-specific form appears.
- [ ] Required fields are validated.
- [ ] File uploads work.
- [ ] Multiple reference items work where required.
- [ ] Brief submission creates/updates the project correctly.

### Project Management

- [ ] Project appears in the admin dashboard.
- [ ] Designer can be assigned.
- [ ] Project status transitions work.
- [ ] Kanban reflects the correct status.
- [ ] Project workspace contains the submitted brief.
- [ ] Internal notes are not exposed to clients.

### Designer Workflow

- [ ] Assigned designer sees the correct project.
- [ ] Designer can upload progress files.
- [ ] Progress is visible to the client where intended.
- [ ] File metadata is recorded.
- [ ] Unauthorized users cannot access another project's files.

### Client Review

- [ ] Client can access the correct project through the tokenized portal.
- [ ] Client can review progress.
- [ ] Client can request revisions.
- [ ] Revision count is enforced.
- [ ] The approved revision notice is displayed:
  `"Mohon diisi revisi sebaik mungkin karena akan terhitung 1x jika kamu hanya input tidak lengkap"`
- [ ] Maximum 3 free revisions are enforced.

### Payment

- [ ] DP can be recorded.
- [ ] Pelunasan can be recorded.
- [ ] Payment status correctly reflects `UNPAID`, `PARTIALLY_PAID`, or `PAID`.
- [ ] Invoice data is consistent with the project.
- [ ] Final approval and payment states do not create contradictory project states.

### Finance

- [ ] Freelancer fee can be recorded.
- [ ] Gross income is calculated correctly.
- [ ] Freelancer expenses are calculated correctly.
- [ ] Net studio revenue is calculated correctly.
- [ ] Financial records are restricted to authorized staff.

---

## 43.14 Security Go-Live Checklist

Before production access:

- [ ] HTTPS is active.
- [ ] Production secrets are configured securely.
- [ ] No secrets exist in Git history or client bundles.
- [ ] Authentication is enabled for internal users.
- [ ] Authorization is enforced server-side.
- [ ] Client token access is server-validated.
- [ ] Tokenized links use unpredictable tokens.
- [ ] Sequential internal IDs are not exposed as authorization credentials.
- [ ] Rate limiting is enabled for sensitive token/auth endpoints where required.
- [ ] File access is authorized server-side.
- [ ] Private object storage is configured correctly.
- [ ] Upload size/type restrictions are active.
- [ ] Database backups are enabled.
- [ ] Backup restoration has been tested.
- [ ] Error responses do not expose secrets or sensitive internals.
- [ ] Production logs do not contain full client tokens or sensitive credentials.

---

## 43.15 Smoke Test After Deployment

Immediately after production deployment, perform a controlled end-to-end smoke test.

Minimum flow:

```text
Create test project
        ↓
Generate client brief link
        ↓
Open link as client
        ↓
Submit category-specific brief
        ↓
Verify project data
        ↓
Assign designer
        ↓
Upload progress file
        ↓
Open client portal
        ↓
Submit test revision
        ↓
Verify revision counter
        ↓
Record test payment
        ↓
Verify invoice/payment state
        ↓
Verify financial calculation
```

The smoke-test project must be clearly identified as test data and removed or archived according to the approved production-data policy.

---

## 43.16 Rollback Strategy

Every production release must have a rollback plan.

Application rollback:

- redeploy the previous known-good commit/version.

Database rollback:

- use a tested migration strategy or restore from backup where necessary.

File storage rollback:

- avoid destructive object-storage operations during deployment;
- preserve existing files unless a deliberate migration requires otherwise.

Rollback must consider application/database compatibility.

Do not deploy a database change that requires an irreversible schema change unless the migration has been explicitly reviewed.

---

## 43.17 Backup and Disaster Recovery

Production backup must cover at minimum:

### Database

- automated daily backup
- retention policy
- backup integrity verification
- periodic restore test

### Object Storage

- versioning or equivalent protection where appropriate
- lifecycle policy
- accidental deletion protection where supported
- documented recovery procedure

### Application

- source code stored in Git
- production configuration documented securely
- infrastructure/deployment instructions stored in project documentation

A backup is not considered reliable until restoration has been tested.

---

## 43.18 Monitoring and Operations

After go-live, monitor at minimum:

- application uptime
- HTTP error rate
- server CPU
- server memory
- disk usage
- database health
- database storage
- object storage usage
- failed uploads
- failed emails
- authentication failures
- token access errors
- application exceptions

The system should provide a health-check endpoint or equivalent mechanism suitable for the chosen hosting environment.

---

## 43.19 Initial Operational Cost Baseline

For the initial scale of approximately 50–60 orders/clients per month, infrastructure should remain intentionally simple.

Indicative monthly infrastructure budget:

| Component | Initial planning range |
|---|---:|
| Application/VPS | Rp150.000–Rp500.000 |
| PostgreSQL | Rp0–Rp300.000 |
| Object storage | Rp0–Rp150.000 |
| Domain | ±Rp15.000–Rp30.000/month equivalent |
| Transactional email | Rp0–Rp300.000 |
| Backup/monitoring | Rp0–Rp300.000 |
| **Indicative total** | **±Rp165.000–Rp1.580.000/month** |

These are planning ranges, not fixed vendor quotations. Actual costs depend on provider, traffic, storage, email volume, backup retention, and usage.

The business should separate infrastructure cost from:

- designer/freelancer payout
- advertising
- WhatsApp/business communication costs
- payment processing fees
- design/production expenses
- other operational business expenses

---

## 43.20 Go-Live Approval Gate

Production launch is approved only when all critical items are complete:

```text
[ ] Application build passes
[ ] Database migration passes
[ ] Backup verified
[ ] Storage verified
[ ] Email verified
[ ] Authentication verified
[ ] Authorization verified
[ ] Client token security verified
[ ] File access security verified
[ ] Critical E2E flow passes
[ ] Payment flow verified
[ ] Financial calculation verified
[ ] Production domain/HTTPS verified
[ ] Monitoring enabled
[ ] Rollback procedure documented
[ ] Owner/Admin accepts production release
```

The go-live decision should be recorded as a release milestone in the project history.

---

## 43.21 Post-Go-Live Period

For the first 7–14 days after launch:

- monitor application errors daily;
- monitor server and database resources;
- monitor failed uploads and emails;
- review client brief submissions;
- verify project status transitions;
- review payment records;
- verify financial summaries;
- collect operational issues;
- prioritize production bugs separately from new feature requests.

Critical production issues should be handled before non-critical feature expansion.

---

# 44. Deployment Definition of Done

Deployment is considered complete when:

1. The approved production build is running.
2. Production database migrations are applied successfully.
3. Production storage is connected.
4. Domain and HTTPS are active.
5. Authentication and authorization are verified.
6. Client tokenized brief flow works.
7. File upload and retrieval work securely.
8. Core project workflow works end-to-end.
9. Payment and financial calculations are verified.
10. Backup and restore procedures are verified.
11. Monitoring is active.
12. Rollback instructions are documented.
13. Smoke tests pass.
14. Owner/Admin approves the release.

The system is then considered **GO-LIVE READY**.

