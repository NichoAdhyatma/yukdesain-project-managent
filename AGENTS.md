# AGENTS.md — YukDesain Studio Portal
## Final AI Agent Development Contract

> This is the mandatory operating contract for AI coding agents working on YukDesain Studio Portal.
> Business requirements are derived from the latest BRD and previously approved YukDesain requirements.
> When requirements conflict, the latest approved requirement takes precedence; do not silently invent behavior.

---

# 1. PRODUCT PURPOSE

YukDesain Studio Portal is a web-based management system for a small graphic design agency / creative studio.

The system centralizes:

- client intake
- project management (merged order + project)
- designer/worker assignment
- Kanban workflow
- client progress tracking
- revision management
- attachments
- invoices
- payment information (DP + pelunasan)
- freelancer allocation
- financial recap
- audit/history

Core operational principle:

> WhatsApp is for communication. YukDesain Studio Portal is the system of record for project and payment management.

Expected operational scale is approximately 50–60 clients/orders per month. Prefer a maintainable modular monolith over premature distributed architecture.

---

# 2. SOURCE OF TRUTH & REQUIREMENT PRIORITY

Use this priority:

1. Latest approved BRD / explicit user requirement
2. Existing approved project documentation
3. Existing repository behavior that does not conflict with the above
4. This AGENTS.md technical/quality rules
5. Reasonable implementation inference

Never invent business rules when the requirement is ambiguous.

The latest BRD defines:
- Owner/Admin
- Designer Staff/Contractor
- Client without login
- one-time links
- service catalog
- advanced brief/form builder
- specialized Sticker Builder
- specialized Photobooth Frame Builder
- Kanban workflow
- Full-Time/Freelancer workforce classification
- freelancer payout
- financial recap
- digital invoice
- token-based client tracking
- 3x revision quota

Previously established YukDesain requirements also remain relevant where not contradicted:
- Owner → Worker → Client operational flow
- manual DP/payment recording
- order/project history
- internal vs external information separation
- project updates
- attachments
- search/filter
- dashboard
- secure tracking
- one-time order-form lifecycle
- future WhatsApp/payment automation as non-MVP unless explicitly approved

---

# 3. ROLE MODEL

## Owner / Admin

Full administrative access.

Responsibilities:
- generate order links
- configure/order services
- manage service catalog
- manage designers/workers
- assign projects
- set freelancer payout
- manage Kanban
- review projects
- manage payment information
- view financial recap
- access invoice data
- manage operational settings

## Designer / Worker

Staff or contractor who executes assigned work.

Responsibilities:
- view assigned projects
- view briefs
- view attachments
- update project workflow
- upload deliverables
- submit work for review
- handle revisions
- track own assignments

## Client

External user.

Client does NOT require an account in the current model.

Access is tokenized.

Client can:
- submit brief
- upload assets/references
- track project
- submit revision requests
- upload revision references
- view/download invoice

Client must never access internal-only information.

---

# 4. CORE BUSINESS FLOW

## Simplified Project Lifecycle

**Order and Project are ONE entity** - no separate Order → Project transition.

**Payment Flow:** DP (Down Payment) collected via WhatsApp BEFORE generating link. Pelunasan (full payment) when project is completed.

```text
Client Consultation (WhatsApp)
        ↓
DP Payment Received (manual recording)
        ↓
Project Created with service, price, deadline
        ↓
One-time Link Generated
        ↓
Client opens link
        ↓
Client completes brief form
        ↓
Project becomes ACTIVE (auto-transition)
        ↓
Owner assigns Designer
        ↓
Project enters Kanban workflow
        ↓
Designer works (progress updates)
        ↓
Client reviews → Revision if needed (max 3x)
        ↓
Final approval
        ↓
Pelunasan Payment Recorded
        ↓
Completed / Archived
```

## Project Status Flow

```text
DRAFT (brief not submitted)
        ↓
BELUM_DIKERJAKAN (brief received, not started)
        ↓
SEDANG_DIKERJAKAN (in progress)
        ↓
SELESAI (completed - pelunasan required)
```

**Payment Timeline:**
- **DP:** Recorded BEFORE link generation (via WhatsApp)
- **Pelunasan:** Recorded when project is completed

---

# 5. ONE-TIME LINK GENERATION

**Prerequisite:** Project must be created with DP payment recorded first.

Owner creates Project with:
- Client info
- Service
- Agreed Price
- Deadline
- DP Payment Recorded

Then generates a unique link for client onboarding.

The link is:
- unique
- single-use
- tied to a project context
- optionally expiration-controlled
- invalid after brief submission
- invalid after expiration

Lifecycle:

```text
ACTIVE → SUBMITTED → LOCKED
```

or:

```text
ACTIVE → EXPIRED
```

Server-side enforcement is mandatory.

Do not rely on frontend disabling alone.

---

# 6. PROJECT METADATA

The BRD explicitly requires:

- Client Name
- Service Category
- Agreed Price (IDR)
- Project Date
- Deadline
- DP Amount Recorded (before link generation)
- Pelunasan Amount (when completed)

Previously established requirements may additionally require:
- client contact (email/phone)
- requirement summary
- internal notes
- invoice information

Do not expose internal fields to the Client.

---

# 7. SERVICE CATALOG

The current BRD defines:

| ID | Service |
|---|---|
| SVC-01 | Logo Minimalis |
| SVC-02 | Logo Ilustrasi |
| SVC-03 | Poster Menu |
| SVC-04 | Banner UMKM |
| SVC-05 | Baliho / Spanduk Ads |
| SVC-06 | Packaging Pouch |
| SVC-07 | Packaging Box |
| SVC-08 | Sticker Label |
| SVC-09 | Frame Photobooth 4R / A3 |
| SVC-10 | Paket Social Media |
| SVC-11 | Paket Brand Kopi Keliling |

Service records should support at minimum:
- ID/code
- name
- description
- active status
- standard output format
- optional price/default pricing if approved

Do not hardcode service data inside UI components when it belongs in the service catalog.

---

# 8. ADVANCED BRIEF & FORM BUILDER

The client intake form must support contextual guidance.

## Required UX

- helper text
- tooltips
- sample briefs/examples
- clear labels
- validation
- upload guidance
- contextual instructions

## Asset/reference upload

Support multiple files where applicable.

Metadata should support:
- file
- caption/tag
- uploader
- timestamp
- related order/project

Validate:
- file type
- file size
- authorization

---

# 9. SPECIALIZED FORM EXTENSIONS

## Sticker Builder

Support:
- multi-side cart sticker configuration
- width
- height
- dimensions in cm
- material notes
- positional photo references

## Photobooth Frame Builder

Support:
- 4R / A3 layout option
- grid/layout configuration where applicable
- event name
- vendor name
- high-resolution logo upload

Do not force these specialized fields into every service.

Render contextual fields based on the selected service.

---

# 10. KANBAN WORKFLOW

The current BRD defines:

```text
BELUM DIKERJAKAN
        ↓
SEDANG DIKERJAKAN
        ↓
SELESAI
```

Definitions:

### Belum Dikerjakan
Incoming, unassigned, or queued orders awaiting briefing validation.

### Sedang Dikerjakan
Active design, asset rendering, or revision execution.

### Selesai
Final deliverables uploaded, approved, and archived.

The previously established richer lifecycle may be represented internally when approved:

```text
NEW
ASSIGNED
IN_PROGRESS
IN_REVIEW
REVISION
COMPLETED
CANCELLED
```

Important:

- Do not expose internal complexity to Client unnecessarily.
- Client-facing status should be simpler.
- Kanban columns must remain understandable to studio staff.

---

# 11. KANBAN CONTROLS

Owner/Admin should be able to:
- drag-and-drop cards
- change priority
- assign/reassign designer
- inspect project
- access relevant project information

Status transitions must be validated server-side.

Do not allow arbitrary status mutation just because a frontend dropdown exists.

---

# 12. WORKFORCE MANAGEMENT

Designer classifications:

```text
FULL_TIME
FREELANCER
```

## Full-Time

Internal/salaried workforce.

## Freelancer

Per-project payout basis.

Owner can:
- create/manage designers
- classify designer
- activate/deactivate
- assign projects
- view assignment workload

For Freelancer assignments:

```text
Project
   ↓
Freelancer
   ↓
Freelancer Fee
```

The payout fee is project-specific unless a future approved pricing rule says otherwise.

---

# 13. PROJECT ASSIGNMENT

Owner can:
- assign
- reassign
- view current designer
- view assignment history

Every assignment change should be auditable.

A Worker must only access projects they are authorized to access.

---

# 14. PROJECT WORKSPACE

A project detail page should contain, as applicable:

- project/order information
- client-safe information
- internal information
- selected service
- deadline
- current status
- priority
- assigned designer
- brief
- assets
- deliverables
- updates
- revisions
- payment/invoice information
- history

Do not display every field to every role.

---

# 15. PROJECT UPDATE

Designer/Worker can create project updates.

Update may include:
- progress
- description
- status
- attachment
- timestamp
- author

Example:

```text
Progress: 70%
Update: Design masuk tahap finalisasi.
Attachment: preview-final.jpg
```

Client-facing updates must be explicitly marked or transformed into client-safe DTOs.

---

# 16. REVISION MANAGEMENT

The BRD explicitly defines a **3x structured revision quota**.

Lifecycle:

```text
Initial Brief
    ↓
Project Executed
    ↓
Revision #1 → 2 remaining
    ↓
Revision #2 → 1 remaining
    ↓
Revision #3 → 0 remaining
    ↓
Additional revisions locked
    ↓
Paid upgrade required
```

The system must track:
- revision number
- request timestamp
- requester
- revision description
- attachments
- status
- remaining quota

## Revision UX

Client must receive a clear policy notice:

> "Mohon diisi revisi sebaik mungkin karena akan terhitung 1x jika kamu hanya input tidak lengkap"

Preserve the BRD's wording unless the product owner explicitly requests copy changes.

Support multi-image attachments for visual feedback.

When quota reaches zero:
- prevent normal revision submission
- show clear warning
- show paid-upgrade path if that flow has been implemented

Do not silently allow unlimited revisions.

---

# 17. INVOICING

Invoice is generated digitally after brief submission according to the BRD.

Invoice should summarize:
- order parameters
- service
- line items
- price
- payment terms
- relevant client/order information

Support PDF export.

Previously established payment information may include:
- total price
- DP
- remaining amount
- payment status

Current payment model remains manual unless a payment gateway is explicitly approved.

---

# 18. PAYMENT

Initial implementation:

```text
MANUAL PAYMENT
```

Support:
- payment record
- amount
- date
- payment status
- notes/reference
- remaining amount

Possible status:

```text
UNPAID
PARTIALLY_PAID
PAID
```

Do not implement a payment gateway unless explicitly requested.

---

# 19. FINANCIAL RECAP

Owner/Admin financial dashboard must support:

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

Financial reporting should support monthly recap.

Do not invent additional financial KPIs without a requirement.

---

# 20. CLIENT PORTAL

Client access is token-based and no-login.

Current BRD explicitly supports:
- brief submission
- live tracking
- revision management
- invoice access/download (pelunasan after completion)

Client should see:
- project status
- progress
- brief confirmation
- deadline
- revision quota
- revision history
- invoice (after completion)
- client-safe deliverables where applicable

Client must not see:
- internal notes
- freelancer fee
- designer fee/payout
- internal assignment details
- internal audit information
- other clients' data

---

# 21. TOKEN SECURITY

The BRD specifies secure 16-character alphanumeric tokens.

Treat tokens as credentials.

Requirements:
- cryptographically unpredictable generation
- uniqueness
- expiration where applicable
- server-side validation
- rate limiting where appropriate
- never expose internal sequential IDs as secrets
- never log full sensitive tokens unnecessarily

Public tracking endpoints must return explicit DTOs, not database entities.

---

# 22. ATTACHMENTS

Use object storage for files.

Preferred:
- Cloudflare R2
- S3-compatible storage

Database stores metadata such as:
- id
- project/order relation
- filename
- MIME type
- size
- storage key
- caption/tag
- uploader
- created_at

Validate:
- MIME
- extension
- file size
- authorization

Private files must not become public merely because the client knows an object URL.

---

# 23. NAVIGATION & PAGES

## Current Menu Structure

Sidebar navigation is stored in DB (`menu_items` table), filtered by user role via `page_roles` table. Owner sees OWNER pages; Designer sees DESIGNER pages.

```
Sidebar Navigation (Owner):
├── Overview
│   └── Dashboard
├── Work Management
│   ├── Form Link (create project + generate link + recap)
│   ├── Projects (grid view + assign designer)
│   └── Designers (manage designer roster + classify)
├── Finance
│   └── Invoices
└── Settings
    └── Settings

Sidebar Navigation (Designer):
└── Designer
    └── Workspace
```

### Menu Access Control

- Menu items visible per role are controlled by `page_roles` table (path → roles mapping)
- Server layout filters menus server-side based on `user.roles`
- Role switching via avatar dropdown in sidebar (seamless — no re-login needed)

## Page Responsibilities

### Form Link (`/form-link`)
- Create new project with client info, service, price, deadline
- Auto-generate client brief link
- Show recap table with all projects
- Generate/re-generate links for existing projects

### Projects (`/projects`)
- Toggle between Grid (table) and Kanban view
- Assign designer to project
- Change project status via drag & drop (Kanban) or dropdown (Grid)

### Kanban Board
- Drag & drop to change status
- Shows: project number, client, service, deadline, assigned designer

### Grid View (Table)
- Sortable columns
- Quick assign designer action
- Status badges

---

# 24. SEARCH & FILTER

Owner/Admin should have useful search/filter for:

### Projects
- project number
- client
- designer
- status
- deadline
- priority

### Designers
- name
- classification
- status

Do not implement filters that have no operational value.

---

# 24. DASHBOARDS

## Owner/Admin

Useful metrics may include:
- new orders
- unassigned projects
- active projects
- projects in review
- revision projects
- completed projects
- deadlines
- outstanding payments
- gross income
- freelancer expense
- net studio revenue

Every metric must be backed by real data.

## Designer

Show:
- assigned projects
- active work
- pending review
- revisions
- upcoming deadlines

No fake statistics.

---

# 25. HISTORY / AUDIT

Record important actions:

```text
Order Created
Link Generated
Link Submitted
Designer Assigned
Designer Reassigned
Status Changed
Project Updated
Deliverable Uploaded
Revision Requested
Revision Approved/Handled
Payment Recorded
Invoice Generated
Project Completed
```

History should capture, where appropriate:
- actor
- action
- entity
- previous value
- new value
- timestamp

---

# 26. INTERNAL VS EXTERNAL DATA

Strict boundary:

```text
                DATA
                  │
        ┌─────────┴─────────┐
        │                   │
     INTERNAL            CLIENT-SAFE
        │                   │
   Owner/Designer          Client
```

Examples of internal-only data:
- freelancer payout
- internal notes
- internal operational comments
- internal assignment details
- internal audit metadata

Never expose internal data through a public tracking endpoint.

---

# 27. UI/UX PRO MAX — MANDATORY

For every meaningful UI implementation:

1. Consult UI/UX Pro Max first.
2. Adapt its recommendations to YukDesain.
3. Reuse the project's existing design system.
4. Implement all relevant states.
5. Review responsive behavior.
6. Run `/antislop` after implementation.

The UI must not look like generic AI-generated SaaS.

Avoid:
- excessive gradients
- random glassmorphism
- excessive cards
- arbitrary rounded corners
- excessive shadows
- meaningless icons
- emoji decoration
- giant headings inside dashboards
- fake charts
- unnecessary animation
- inconsistent spacing
- inconsistent typography
- random color usage

Prefer:
- strong hierarchy
- restrained visual language
- meaningful whitespace
- clear primary actions
- dense-but-readable operational tables
- purposeful status indicators
- predictable navigation
- useful empty states
- accessible forms
- clear timelines/activity

---

# 28. REQUIRED UI STATES

Where applicable:

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

Specific states are important for:
- one-time forms
- tracking links
- revision quota
- uploads
- Kanban
- invoice generation
- payments

---

# 29. DESIGN SYSTEM RULES

Hierarchy:

```text
Design Tokens
    ↓
UI Primitives
    ↓
Feature Components
    ↓
Pages
```

Use a consistent:
- typography scale
- spacing scale
- radius
- border
- shadow
- color system
- button behavior
- input behavior
- table behavior
- status badge system

Do not create arbitrary one-off styles if an existing token/component can solve the problem.

---

# 30. ACCESSIBILITY

Required:
- semantic HTML
- keyboard access
- visible focus
- labels
- error association
- meaningful buttons
- adequate contrast
- non-color-only status communication
- reduced-motion support where applicable

---

# 31. RESPONSIVE DESIGN

The system must support:
- desktop
- tablet
- mobile

Design intentionally for:
- dashboards
- Kanban
- tables
- forms
- project detail
- client tracking
- invoice view

Do not simply let desktop layouts overflow on mobile.

---

# 32. APPROVED TECHNICAL STACK

Recommended production stack for this scale:

```text
Frontend / Fullstack
Next.js 16
TypeScript
Tailwind CSS
shadcn/ui

Font: Poppins

Primary Color for app: 

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.399 0.180 261.542);
  --primary-foreground: oklch(0.97 0.014 254.604);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.58 0.22 27);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.809 0.105 251.813);
  --chart-2: oklch(0.623 0.214 259.815);
  --chart-3: oklch(0.546 0.245 262.881);
  --chart-4: oklch(0.399 0.180 261.542);;
  --chart-5: oklch(0.424 0.199 265.638);
  --radius: 16px;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.546 0.245 262.881);
  --sidebar-primary-foreground: oklch(0.97 0.014 254.604);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.399 0.180 261.542);
  --primary-foreground: oklch(0.97 0.014 254.604);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.809 0.105 251.813);
  --chart-2: oklch(0.623 0.214 259.815);
  --chart-3: oklch(0.546 0.245 262.881);
  --chart-4: oklch(0.399 0.180 261.542);;
  --chart-5: oklch(0.424 0.199 265.638);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.623 0.214 259.815);
  --sidebar-primary-foreground: oklch(0.97 0.014 254.604);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}


Forms
React Hook Form
Zod

Server State
TanStack Query where needed

ORM
Prisma

Database
PostgreSQL

Authentication
Auth.js or Better Auth

Storage
Cloudflare R2 / S3-compatible

Email
Resend

Testing
Vitest
Playwright

Deployment
Vercel
```

Architecture:

> Modular monolith.

Do not introduce:
- microservices
- Redis
- Kubernetes
- message queues
- separate backend
unless an approved requirement justifies them.

---

# 33. ARCHITECTURE

Recommended:

```text
Next.js
├── UI / Pages
├── Route Handlers / Server Actions
├── Domain / Service Layer
├── Authorization
├── Validation
└── Prisma
       ↓
 PostgreSQL

Object files
       ↓
R2 / S3

Email
       ↓
Resend
```

Keep domain logic out of presentation components.

---

# 34. TYPESCRIPT QUALITY

Strict TypeScript.

Avoid:
- `any`
- lazy `unknown`
- unsafe casts
- duplicated types
- magic strings

Prefer domain types/enums/constants.

Do not weaken TypeScript merely to make an implementation compile.

---

# 35. DATABASE QUALITY

Before schema changes:

1. Search existing entities.
2. Check relationships.
3. Check naming.
4. Check nullability.
5. Check uniqueness.
6. Check indexes.
7. Check migration impact.
8. Check audit implications.

Avoid database entities created only to support one screen.

---

# 36. API QUALITY

Use explicit request/response DTOs.

Do not expose Prisma/database models directly.

Use stable errors:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
UNPROCESSABLE_ENTITY
INTERNAL_SERVER_ERROR
```

Never expose stack traces/secrets.

---

# 37. SERVER AUTHORIZATION

Frontend visibility is not authorization.

Always enforce:

```text
Authentication
    ↓
Authorization
    ↓
Resource access
    ↓
Business rules
    ↓
Mutation
```

Example:
A designer may only mutate a project they are authorized to work on.

---

# 38. ANTI-SLOP REVIEW — `/antislop`

After implementation, run the installed `/antislop`.

Review:

### Code
- duplication
- unnecessary abstraction
- over-engineering
- dead code
- excessive comments
- weak types
- unnecessary state/effects
- poor naming
- hidden side effects

### UI
- generic SaaS look
- inconsistent spacing
- inconsistent radius
- arbitrary colors
- excessive cards
- excessive gradients
- decorative UI
- missing states
- accessibility problems
- responsive problems

### AI fingerprints
- verbose obvious comments
- generic utility dumping grounds
- invented abstractions
- code inconsistent with repository conventions
- suspicious complexity
- unnecessary wrappers

Fix valid findings before completion.

Do not blindly apply a finding if it conflicts with a documented business/architecture decision; document the exception.

---

# 39. TESTING

Run applicable:

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
→ Order created
→ Invoice generated
→ Owner assigns designer
→ Designer updates Kanban
→ Designer uploads deliverable
→ Client tracks
→ Client submits revision
→ Revision quota decrements
→ Final approval
→ Project completed
```

---

# 40. CHANGE DISCIPLINE

Prefer:

```text
Small coherent change > large rewrite
```

Do not refactor unrelated code.

Do not add dependencies without justification.

Do not change architecture merely because another stack is fashionable.

---

# 41. WHEN TO ASK FOR CLARIFICATION

Ask when:
- requirements conflict
- a business rule is missing
- permission is ambiguous
- public/private data boundary is ambiguous
- destructive migration is required
- approved architecture must change

Do not ask about trivial implementation choices.

---

# 42. FINAL RESPONSE FORMAT

After a development task:

```text
## Implemented
- ...

## Files Changed
- ...

## Validation
- Typecheck: PASS/FAIL
- Lint: PASS/FAIL
- Tests: PASS/FAIL
- Build: PASS/FAIL
- Anti-slop: PASS/NOT RUN

## UI/UX
- UI/UX Pro Max: USED/NOT AVAILABLE
- Responsive states checked: ...

## Assumptions
- ...

## Risks / Notes
- ...
```

Keep it concise.

---

# 43. GOLDEN RULE

Before adding anything:

> Does this make YukDesain easier to use, easier to maintain, safer, or more reliable?

If not, do not add it.

The goal is not maximum code.

The goal is:

> **The smallest amount of high-quality code that correctly implements the approved requirement.**

---

# 44. MERGED CLIENT-BRIEF IMPLEMENTATION SPECIFICATION

This section integrates the detailed client-brief BRD into the AI-agent contract above.

## 44.1 Scope

The Client Brief Form is a dynamic, category-driven intake system. Its detailed field definitions, storage keys, repeatable builders, upload behavior, validation rules, and acceptance criteria are normative for the client-brief implementation.

The 11 current categories are:

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

## 44.2 Form Requirement Precedence

For client-brief implementation:

1. Explicit latest user requirement
2. Detailed Client Brief BRD requirements in this document
3. Existing approved repository behavior that does not conflict
4. General technical/quality rules in this AGENTS contract
5. Reasonable implementation inference

Do not silently change existing field keys or business behavior.

## 44.3 Category Router

The form must render fields based on the selected service category.

Do not render unrelated category fields.

Common reference behavior applies to:

- Logo Minimalis
- Logo Ilustrasi
- Poster Menu
- Banner UMKM
- Baliho / Spanduk Ads
- Packaging Pouch
- Sticker Label
- Frame Photobooth
- Paket Sosial Media

Primary reference exceptions:

- Packaging Box → `box_references_json`
- Paket Brand Kopi Keliling → `cart_references_json`, `cart_sides_json`, `kopi_menu_items_json`

## 44.4 Canonical Form Storage Keys

Preserve these keys:

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

Do not introduce generic replacement fields such as `description`, `notes`, `additional_info`, or `brand_description` when an existing field already covers the same requirement.

## 44.5 Category Field Matrix

| Category | Required Fields | Optional / Repeatable |
|---|---|---|
| Logo Minimalis | `brand_name`, `business_desc`, `colors` | `tagline`, `reference_items_json` |
| Logo Ilustrasi | `brand_name`, `business_desc`, `colors` | `tagline`, `reference_items_json` |
| Poster Menu | `main_text`, `size`, `style` | `brand_logo_url`, `menu_items_json`, `reference_items_json` |
| Banner UMKM | `main_text`, `size`, `style` | `brand_logo_url`, `menu_items_json`, `reference_items_json` |
| Baliho / Spanduk Ads | `main_text`, `size`, `style` | `brand_logo_url`, `menu_items_json`, `reference_items_json` |
| Packaging Pouch | `dimensions`, `mandatory_info`, `color_concept` | `reference_items_json` |
| Packaging Box | `dimensions`, `mandatory_info` | `box_references_json` |
| Sticker Label | `sticker_shape`, `sticker_media`, `sticker_text` | `reference_items_json` |
| Frame Photobooth | `photobooth_size`, `vendor_name`, `event_theme` | `vendor_logo_url`, `reference_items_json` |
| Paket Sosial Media | `sosmed_platform`, `sosmed_vibe`, `main_text` | `reference_items_json` |
| Paket Brand Kopi Keliling | `brand_name`, `main_text` | `brand_logo_url`, `cart_references_json`, `cart_sides_json`, `kopi_menu_items_json` |

## 44.6 Repeatable Builders

### Product Builder

Used by:

- Poster Menu
- Banner UMKM
- Baliho / Spanduk Ads
- Paket Brand Kopi Keliling

Generic print categories store product items in:

```text
menu_items_json
```

Coffee-package products use:

```text
kopi_menu_items_json
```

Each item retains:

```text
id
image
caption
```

Required operations:

```text
Add Product
Remove Product
Upload Product Image
Update Product Caption
Render Product List
```

### Packaging Box Reference Builder

Used only by:

```text
Packaging Box
```

Storage:

```text
box_references_json
```

Operations:

```text
Upload Box Reference
Remove Box Reference
Render Box Reference List
```

Do not substitute generic `reference_items_json`.

### Cart Reference Builder

Used by:

```text
Paket Brand Kopi Keliling
```

Storage:

```text
cart_references_json
```

Operations:

```text
Upload Cart Reference
Remove Cart Reference
Render Cart Reference List
```

### Cart Side Builder

Default sides:

| Side | Dimensions |
|---|---|
| Sisi Depan Gerobak | 100 × 80 cm |
| Sisi Kanan Gerobak | 60 × 80 cm |
| Sisi Kiri Gerobak | 60 × 80 cm |

Each side contains:

```text
sideName
dimensions
textBrief
imageBrief
```

Operations:

```text
Add Side
Remove Side
Update Side Name
Update Side Dimensions
Update Side Text Brief
Upload Side Image
Render Side List
```

## 44.7 Common Reference Module

Where applicable, the common module supports:

- multiple image uploads
- reference links
- website/Pinterest/other visual URLs
- captions/tags where supported

Storage:

```text
reference_items_json
```

The module must not override specialized reference storage for Packaging Box or Paket Brand Kopi Keliling.

## 44.8 Submission Contract

On client submission:

1. Resolve the order/project from the token.
2. Validate token and active-link state server-side.
3. Validate only fields applicable to the selected category.
4. Validate required fields.
5. Validate upload type, size, and authorization.
6. Serialize repeatable data into the canonical JSON fields.
7. Save the resulting data under `formData`.
8. Invalidate/lock the one-time link according to the approved lifecycle.
9. Refresh the relevant admin/project state.
10. Generate/render invoice and tracking according to the approved project flow.
11. Show a clear success state to the client.

## 44.9 Client-Safe Data Boundary

Form data may be visible to Owner/Designer according to authorization.

Client-facing tracking must use an explicit client-safe DTO.

Never expose:

```text
freelancerFee
internal notes
internal assignment details
audit metadata
other clients' data
```

## 44.10 Required UI States for the Brief

The brief form must account for:

```text
Default
Loading
Submitting
Saving
Validation Error
Upload Error
Success
Expired
Locked
Unauthorized
Forbidden
Not Found
```

Repeatable builders must also handle:

```text
Empty
Adding
Removing
Upload Failed
```

## 44.11 Acceptance Criteria

The merged implementation is acceptable only when:

- category-specific fields render correctly;
- required validation is category-specific;
- optional uploads do not block valid submission;
- repeatable product items retain independent data;
- removed repeatable items do not affect other items;
- Packaging Box uses `box_references_json`;
- Paket Brand Kopi Keliling preserves cart sides and coffee menu items separately;
- active tokens can submit once;
- locked/expired tokens cannot submit;
- form data remains compatible with existing storage keys;
- client-safe tracking does not expose internal financial or operational data;
- the critical project E2E flow remains intact.

## 44.12 Conflict Register

The source documents contain one area that should remain explicit rather than silently reconciled:

### Sticker Builder terminology

The AGENTS contract describes a specialized "Sticker Builder" with:

- multi-side cart sticker configuration;
- width;
- height;
- dimensions in cm;
- material notes;
- positional photo references.

The detailed current Client Brief BRD defines the current `Sticker Label` category as:

- `sticker_shape`;
- `sticker_media`;
- `sticker_text`;
- optional `reference_items_json`.

These requirements are not identical.

Until the product owner explicitly resolves the difference, an AI agent must:

1. preserve the existing `Sticker Label` fields and storage behavior;
2. not silently replace them with cart-sticker fields;
3. not delete or rename existing storage keys;
4. ask for clarification only if implementing the specialized multi-side Sticker Builder is part of the requested change.

This is an intentional requirement conflict record, not an invented business rule.

---

# 45. MERGED AGENT OPERATING CHECKLIST

Before changing YukDesain:

- Read this entire contract.
- Identify whether the requested change affects business rules, form behavior, UI, data, security, or architecture.
- Search existing code before introducing new fields, entities, or dependencies.
- Preserve existing storage keys unless an explicit migration is approved.
- Preserve category-specific behavior.
- Enforce authorization server-side.
- Keep internal and client-safe data separated.
- Implement all relevant UI states.
- Validate responsive behavior.
- Run applicable typecheck, lint, tests, and build.
- Run `/antislop` when available.
- Report files changed, validation results, assumptions, and risks concisely.

> Golden rule: implement the smallest amount of high-quality code that correctly satisfies the approved requirement.

---

# 46. DETAILED CLIENT BRIEF BRD (REFERENCE)

**Document Type:** Business Requirements Document (BRD)  
**Format:** Markdown  
**Audience:** AI Coding Agent / Software Engineer / Product Designer  
**Source Basis:** Existing `yukdesain_studio_portal.html` and its current client brief form behavior  
**Status:** Reference / Implementation Specification

---

## 1. Document Purpose

Dokumen ini mendefinisikan requirement form brief client pada Yukdesain Studio berdasarkan implementasi form yang sudah ada.

Tujuan utama:

1. Menjadi referensi AI coding agent saat memahami atau mengembangkan ulang form.
2. Mempertahankan struktur dan terminology form yang sudah digunakan.
3. Mendefinisikan field, tipe input, kewajiban, helper text, dynamic builder, upload, dan struktur data.
4. Menghindari perubahan behavior bisnis yang tidak disengaja.

> **Important:** Dokumen ini adalah spesifikasi berdasarkan behavior yang ada pada source saat ini. Jika suatu aturan tidak ditemukan secara eksplisit pada source, jangan diasumsikan sebagai business rule baru.

---

# 2. Product Context

Yukdesain Studio memiliki alur:

```text
Admin membuat order/link
        ↓
Client membuka link
        ↓
Client mengisi brief sesuai kategori layanan
        ↓
Client submit brief
        ↓
Brief tersimpan ke order
        ↓
Invoice diterbitkan
        ↓
Admin assign designer
        ↓
Designer mengerjakan project
        ↓
Progress dikirim
        ↓
Client melakukan tracking/revisi
```

Form client bersifat **dynamic berdasarkan kategori layanan**.

---

# 3. Form Design Principles

## 3.1 Dynamic Category Form

Field yang ditampilkan client harus mengikuti `category`.

Jangan menampilkan seluruh field dari seluruh kategori sekaligus.

## 3.2 Common Reference

Sebagian besar kategori memiliki:

**Referensi Gaya Visual / Moodboard (Opsional)**

Client dapat:

- upload beberapa gambar;
- menambahkan reference link;
- menggunakan website/Pinterest sebagai referensi.

Data reference umum disimpan sebagai:

```text
reference_items_json
```

Exception:

- `packaging-box`
- `paket-kopi-keliling`

Kedua kategori tersebut mempunyai reference mechanism khusus.

## 3.3 Dynamic Repeatable Items

Beberapa kategori memiliki data berulang:

- product items;
- box references;
- cart references;
- cart sides.

AI agent harus mempertahankan kemampuan add/remove item.

---

# 4. Category List

Current service categories covered by the form:

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

# 5. Detailed Requirements Per Category

---

## 5.1 Logo Minimalis

### Purpose

Mengumpulkan informasi identitas brand dan arahan visual untuk pembuatan logo minimalis.

### Fields

| Field Key | Label | Type | Required | Description |
|---|---|---|---|---|
| `brand_name` | Nama Brand / Usaha | text | Yes | Nama persis yang ingin ditampilkan pada logo |
| `tagline` | Slogan / Tagline | text | No | Kalimat pendek pendukung logo |
| `business_desc` | Bidang Usaha & Deskripsi Singkat | textarea | Yes | Produk/bisnis dan target market |
| `colors` | Warna Utama & Yang Dihindari | text | Yes | Warna identitas yang diinginkan/dihindari |

### Reference

Common moodboard/reference section:

- optional;
- multiple image upload;
- reference links.

Storage:

```text
reference_items_json
```

### Example Input

```text
brand_name:
Kopi Senja

tagline:
Rasa Otentik Nusantara

business_desc:
Kedai kopi kekinian dengan konsep industrial.

colors:
Dominan coklat kayu dan cream. Hindari warna neon.
```

---

## 5.2 Logo Ilustrasi

Menggunakan struktur field yang sama dengan Logo Minimalis.

### Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `brand_name` | Nama Brand / Usaha | text | Yes |
| `tagline` | Slogan / Tagline | text | No |
| `business_desc` | Bidang Usaha & Deskripsi Singkat | textarea | Yes |
| `colors` | Warna Utama & Yang Dihindari | text | Yes |

### Reference

Common:

```text
reference_items_json
```

Optional multiple image/link references.

---

# 6. Poster Menu

## 6.1 Main Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `brand_logo_url` | Logo Brand | image upload | No |
| `main_text` | Informasi Teks & Daftar Menu / Promosi | textarea | Yes |
| `size` | Ukuran Desain / Media Cetak | text | Yes |
| `style` | Nuansa / Gaya Desain | text | Yes |

### `main_text`

Purpose:

Menampung daftar menu, harga, informasi, atau teks promosi yang wajib dimuat.

Example:

```text
Kopi Susu Gula Aren: Rp 18.000
Croissant: Rp 22.000
```

### `size`

Example:

```text
Poster A3
Banner 2x1 meter
```

### `style`

Example:

```text
Minimalis estetik
Mewah
Elegan bernuansa gelap
```

## 6.2 Product Builder

Client dapat menambahkan banyak product item.

### Product Item

```text
ProductItem
├── id
├── image
└── caption
```

Caption dapat berisi:

- nama produk;
- harga;
- deskripsi.

Example:

```text
Foto: Signature
Caption: Signature - Rp 25.000
```

Storage:

```text
menu_items_json
```

## 6.3 Reference

Optional:

```text
reference_items_json
```

---

# 7. Banner UMKM

Banner UMKM menggunakan struktur field yang sama dengan Poster Menu.

### Fields

| Field Key | Type | Required |
|---|---|---|
| `brand_logo_url` | image upload | No |
| `main_text` | textarea | Yes |
| `size` | text | Yes |
| `style` | text | Yes |
| Product items | repeatable upload | No |
| `reference_items_json` | image/link collection | No |

### Product

Mendukung multiple products:

```text
products[]
├── image
└── caption
```

Storage:

```text
menu_items_json
```

---

# 8. Baliho / Spanduk Ads

Menggunakan struktur yang sama dengan Poster Menu dan Banner UMKM.

### Fields

| Field Key | Type | Required |
|---|---|---|
| `brand_logo_url` | image upload | No |
| `main_text` | textarea | Yes |
| `size` | text | Yes |
| `style` | text | Yes |
| Product items | repeatable upload | No |
| `reference_items_json` | image/link collection | No |

---

# 9. Packaging Pouch

## Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `dimensions` | Ukuran Detail Kemasan (P x L x T) | text | Yes |
| `mandatory_info` | Informasi Wajib pada Kemasan | textarea | Yes |
| `color_concept` | Konsep Warna Kemasan | text | Yes |

### `dimensions`

Purpose:

Ukuran detail kemasan.

Example:

```text
Pouch 12 x 20 cm
```

### `mandatory_info`

Purpose:

Informasi produk/hukum yang harus masuk desain.

Example:

```text
Komposisi
Netto 250g
No. P-IRT
Halal
```

### `color_concept`

Example:

```text
Dominan biru pastel dengan aksen emas.
```

### Reference

Common optional:

```text
reference_items_json
```

---

# 10. Packaging Box

Packaging Box memiliki reference mechanism khusus.

## Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `dimensions` | Ukuran Detail Kemasan (P x L x T) | text | Yes |
| `mandatory_info` | Informasi Wajib pada Kemasan | textarea | Yes |

## Box Reference Builder

Client dapat upload contoh/model box.

Storage:

```text
box_references_json
```

Conceptual structure:

```text
box_references[]
├── image
└── metadata
```

### Important Rule

Jangan menggunakan `reference_items_json` sebagai pengganti `box_references_json` untuk kategori ini.

---

# 11. Sticker Label

## Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `sticker_shape` | Bentuk & Ukuran Sticker | text | Yes |
| `sticker_media` | Penggunaan Pada Media Apa | text | Yes |
| `sticker_text` | Teks / Informasi pada Label | textarea | Yes |

### `sticker_shape`

Example:

```text
Bulat diameter 5 cm
Kotak 7 x 4 cm
```

### `sticker_media`

Example:

```text
Botol plastik PET
Kemasan pouch
Paper cup
```

### `sticker_text`

Example:

```text
Logo brand
Varian rasa
Nomor WhatsApp
```

### Reference

Optional:

```text
reference_items_json
```

---

# 12. Frame Photobooth

## Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `photobooth_size` | Pilihan Ukuran Frame Photobooth | select | Yes |
| `vendor_name` | Nama Vendor Photobooth | text | Yes |
| `vendor_logo_url` | Logo Vendor Photobooth | image upload | No |
| `event_theme` | Tema Event / Acara | text | Yes |

## Photobooth Size Options

Current options:

```text
4R — Standar Strip / Grid Photo

Newspaper A3 — Tema Koran Unik & Aesthetic
```

## Vendor Logo

Optional upload.

Purpose:

Logo vendor dapat dimasukkan ke desain frame.

## Event Theme

Example:

```text
Pernikahan Rustic
Ulang Tahun Neon
```

### Reference

Optional:

```text
reference_items_json
```

---

# 13. Paket Sosial Media

## Fields

| Field Key | Label | Type | Required |
|---|---|---|---|
| `sosmed_platform` | Platform & Kebutuhan Konten | text | Yes |
| `sosmed_vibe` | Gaya Visual & Tone of Voice | text | Yes |
| `main_text` | Informasi Teks & Daftar Menu / Promosi | textarea | Yes |

### `sosmed_platform`

Purpose:

Menentukan platform dan jumlah/format content.

Example:

```text
15 Feed Grid Instagram & 10 Story
```

### `sosmed_vibe`

Purpose:

Menjelaskan visual direction dan tone of voice.

Example:

```text
Profesional bersih, tone warna pastel.
```

### `main_text`

Purpose:

Menampung informasi, topik content, atau template text.

### Reference

Optional:

```text
reference_items_json
```

---

# 14. Paket Brand Kopi Keliling

Ini adalah kategori paling kompleks dan terdiri dari beberapa sub-module.

## 14.1 Brand Identity

| Field Key | Label | Type | Required |
|---|---|---|---|
| `brand_name` | Nama Brand | text | Yes |
| `brand_logo_url` | Logo Brand | image upload | No |

---

## 14.2 Cart Reference

Client dapat upload foto/contoh gerobak.

Storage:

```text
cart_references_json
```

Conceptual structure:

```text
cart_references[]
├── image
└── metadata
```

---

## 14.3 Cart Sides Builder

Client dapat mendefinisikan sisi gerobak.

Default sides:

| Side | Default Dimensions |
|---|---|
| Sisi Depan Gerobak | 100 × 80 cm |
| Sisi Kanan Gerobak | 60 × 80 cm |
| Sisi Kiri Gerobak | 60 × 80 cm |

Setiap side memiliki:

| Property | Purpose |
|---|---|
| `sideName` | Nama sisi |
| `dimensions` | Ukuran P x T |
| `textBrief` | Brief/instruksi teks |
| `imageBrief` | Gambar referensi sisi |

Conceptual structure:

```text
cart_sides[]
├── sideName
├── dimensions
├── textBrief
└── imageBrief
```

Client dapat:

- edit side;
- remove side;
- add side baru.

Storage:

```text
cart_sides_json
```

---

## 14.4 Coffee Menu Builder

### Main Menu Brief

Field:

```text
main_text
```

Type:

```text
textarea
```

Required:

```text
Yes
```

Purpose:

Daftar menu kopi, varian, harga, dan informasi terkait.

### Coffee Product Items

Multiple items.

Structure:

```text
kopi_menu_items[]
├── id
├── image
└── caption
```

Example:

```text
Product:
Es Kopi Susu

Caption:
Kopi Susu Gula Aren - Rp 18.000
```

Storage:

```text
kopi_menu_items_json
```

---

# 15. Common Reference Module

## 15.1 Visibility

Common reference module ditampilkan untuk kategori:

```text
Logo Minimalis
Logo Ilustrasi
Poster Menu
Banner UMKM
Baliho / Spanduk Ads
Packaging Pouch
Sticker Label
Frame Photobooth
Paket Sosial Media
```

Tidak digunakan sebagai primary reference module untuk:

```text
Packaging Box
Paket Brand Kopi Keliling
```

## 15.2 Capabilities

### Image Upload

Multiple image references.

### URL Reference

Client dapat menambahkan link reference.

Possible destinations include:

```text
Website
Pinterest
Other visual reference URL
```

## 15.3 Storage

```text
reference_items_json
```

---

# 16. Field Behavior Matrix

| Category | Required Core Fields | Repeatable Data | Special Upload |
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

# 17. Form Submission Requirements

Saat client submit brief:

1. Sistem harus mencari order berdasarkan token.
2. Token harus valid.
3. Link/order harus berstatus `active`.
4. Semua required field harus lolos validation.
5. Uploaded assets harus sudah tercatat.
6. Dynamic repeatable data harus diserialisasi ke field JSON yang sesuai.
7. `formData` disimpan ke order.
8. Link/order berubah menjadi status `used`.
9. Order disimpan ke localStorage.
10. Admin dashboard dirender ulang.
11. Invoice/tracking view dirender.
12. Client mendapatkan notification bahwa brief berhasil dikirim dan invoice diterbitkan.

---

# 18. Data Contract

Order object secara konseptual memiliki data:

```text
order
├── token
├── clientName
├── category
├── price
├── orderDate
├── deadline
├── status
├── formData
├── assignedDesignerId
├── freelancerFee
├── projectStatus
├── progressFiles
├── revisions
└── invoiceNo
```

Form-specific data berada di:

```text
order.formData
```

---

# 19. JSON-like Form Data Examples

## Logo

```json
{
  "brand_name": "Kopi Senja",
  "tagline": "Rasa Otentik Nusantara",
  "business_desc": "Kedai kopi kekinian.",
  "colors": "Coklat dan cream",
  "reference_items_json": []
}
```

## Poster Menu

```json
{
  "brand_logo_url": "...",
  "main_text": "Daftar menu dan harga...",
  "size": "Poster A3",
  "style": "Minimalis estetik",
  "menu_items_json": [
    {
      "id": "...",
      "image": "...",
      "caption": "Kopi Susu - Rp 20.000"
    }
  ],
  "reference_items_json": []
}
```

## Packaging Box

```json
{
  "dimensions": "10 x 10 x 5 cm",
  "mandatory_info": "Komposisi, Netto, Halal",
  "box_references_json": [
    {
      "image": "..."
    }
  ]
}
```

## Paket Kopi Keliling

```json
{
  "brand_name": "Kopi Senja",
  "brand_logo_url": "...",
  "cart_references_json": [],
  "cart_sides_json": [
    {
      "sideName": "Sisi Depan Gerobak",
      "dimensions": "100 x 80 cm",
      "textBrief": "...",
      "imageBrief": "..."
    }
  ],
  "main_text": "Daftar menu kopi...",
  "kopi_menu_items_json": [
    {
      "id": "...",
      "image": "...",
      "caption": "Kopi Susu - Rp 18.000"
    }
  ]
}
```

---

# 20. Validation Requirements

## Required Fields

AI agent wajib mempertahankan validation terhadap field yang ditandai `Required = Yes`.

Minimal:

```text
brand_name
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
```

Namun field wajib harus diterapkan **hanya jika field tersebut berlaku untuk category terkait**.

Contoh:

`brand_name` tidak boleh diwajibkan pada Packaging Pouch hanya karena `brand_name` wajib pada kategori Logo.

---

# 21. Upload Requirements

Upload handler harus mendukung:

### Single Image

Contoh:

```text
brand_logo_url
vendor_logo_url
```

### Multiple Images

Contoh:

```text
reference_items_json
box_references_json
cart_references_json
```

### Repeatable Product Images

Contoh:

```text
menu_items_json
kopi_menu_items_json
```

### Side-specific Image

Contoh:

```text
cart_sides_json[].imageBrief
```

---

# 22. Dynamic Builder Requirements

## Product Builder

Must support:

```text
Add Product
Remove Product
Upload Product Image
Update Product Caption
Render Product List
```

Used by:

```text
Poster Menu
Banner UMKM
Baliho / Spanduk Ads
Paket Brand Kopi Keliling
```

---

## Box Reference Builder

Must support:

```text
Upload Box Reference
Remove Box Reference
Render Box Reference List
```

Used by:

```text
Packaging Box
```

---

## Cart Reference Builder

Must support:

```text
Upload Cart Reference
Remove Cart Reference
Render Cart Reference List
```

Used by:

```text
Paket Brand Kopi Keliling
```

---

## Cart Side Builder

Must support:

```text
Add Side
Remove Side
Update Side Name
Update Side Dimensions
Update Side Text Brief
Upload Side Image
Render Side List
```

Used by:

```text
Paket Brand Kopi Keliling
```

---

# 23. AI Agent Implementation Rules

When modifying or rebuilding the form:

### Rule 1 — Preserve Category Behavior

Do not merge category-specific fields merely because labels look similar.

### Rule 2 — Preserve Existing Storage Keys

Prefer existing keys:

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

### Rule 3 — Do Not Introduce Generic Fields Without Requirement

For example, do not add:

```text
description
notes
additional_info
brand_description
```

if an existing field already covers that purpose.

### Rule 4 — Preserve Repeatable Data

Do not flatten:

```text
products[]
cart_sides[]
references[]
```

into a single textarea.

### Rule 5 — Category-specific Exceptions Matter

Especially:

```text
Packaging Box → box_references_json
Paket Brand Kopi Keliling → cart_references_json + cart_sides_json + kopi_menu_items_json
```

---

# 24. Acceptance Criteria

## AC-01 Category Selection

Given a client order with category X,

when the client opens the brief form,

then only fields applicable to category X are rendered.

---

## AC-02 Required Field Validation

Given a required field is empty,

when the client submits the form,

then submission must be blocked and the missing field must be identified.

---

## AC-03 Optional Upload

Given an optional logo/reference upload is empty,

when the client submits a valid form,

then submission must still be allowed.

---

## AC-04 Product Builder

Given a category supporting product items,

when the client adds multiple products,

then every product retains its own:

```text
image
caption
id
```

---

## AC-05 Product Removal

When a client removes one product,

then only that product is removed.

Other product data must remain intact.

---

## AC-06 Packaging Box References

When category is Packaging Box,

then uploaded box references must be stored under:

```text
box_references_json
```

and not substituted with generic references.

---

## AC-07 Coffee Cart Builder

When category is Paket Brand Kopi Keliling,

then the client must be able to manage multiple cart sides.

Each side must retain:

```text
sideName
dimensions
textBrief
imageBrief
```

---

## AC-08 Coffee Menu Builder

When category is Paket Brand Kopi Keliling,

then coffee products must be stored separately from generic product data:

```text
kopi_menu_items_json
```

---

## AC-09 Submission

When all required fields are valid and the token is active,

then:

```text
formData is saved
order status becomes used
invoice/tracking is generated/rendered
admin data is refreshed
```

---

# 25. Current Form Architecture Summary

```text
CLIENT BRIEF FORM
│
├── Category Router
│
├── Common Fields
│   └── Reference / Moodboard
│
├── Logo Forms
│   ├── Logo Minimalis
│   └── Logo Ilustrasi
│
├── Marketing / Print Forms
│   ├── Poster Menu
│   ├── Banner UMKM
│   └── Baliho / Spanduk Ads
│
├── Packaging Forms
│   ├── Packaging Pouch
│   └── Packaging Box
│
├── Sticker
│   └── Sticker Label
│
├── Event
│   └── Frame Photobooth
│
├── Social Media
│   └── Paket Sosial Media
│
└── Special Package
    └── Paket Brand Kopi Keliling
        ├── Brand
        ├── Cart References
        ├── Cart Sides Builder
        ├── Menu Brief
        └── Coffee Product Builder
```

---

# 26. Non-Goals

Dokumen ini tidak mendefinisikan perubahan baru terhadap:

- pricing;
- designer assignment;
- freelancer fee;
- Kanban workflow;
- invoice calculation;
- revision policy;
- authentication;
- backend/API architecture.

Dokumen ini fokus pada **client brief form dan data yang dihasilkannya**.

---

# 27. Source-of-Truth Principle

Untuk implementasi AI agent:

1. Source code existing tetap menjadi source of truth untuk behavior yang sudah berjalan.
2. BRD ini digunakan untuk memahami struktur bisnis/form.
3. Jangan mengubah field key tanpa migration plan.
4. Jangan menghapus existing stored JSON field.
5. Jika menemukan conflict antara BRD dan source code, inspect source code terlebih dahulu sebelum melakukan perubahan.
6. Jika requirement baru diperlukan, buat perubahan eksplisit sebagai requirement baru, bukan mengubah behavior existing secara diam-diam.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
