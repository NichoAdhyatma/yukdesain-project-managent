# BRD Merge Notes

## Newly incorporated from latest BRD

1. Enterprise Design Agency Management System / Yukdesain Studio Portal framing.
2. Owner/Admin, Designer Staff/Contractor, Client tokenized access.
3. Service Catalog with SVC-01 through SVC-11.
4. Standard output format per service.
5. Advanced Brief & Form Builder.
6. Contextual helper text, tooltips, and examples.
7. Multi-file visual reference uploads with captions/tags.
8. Sticker Builder.
9. Photobooth Frame Builder.
10. Kanban workflow.
11. Priority tags.
12. Direct designer assignment from Kanban.
13. Full-Time vs Freelancer classification.
14. Per-project Freelancer Fee.
15. Gross Income, Freelancer Expenses, Net Studio Revenue formulas.
16. Automatic digital invoice after brief submission.
17. PDF invoice export.
18. 16-character alphanumeric client tokens.
19. Structured 3x revision quota.
20. Multi-image revision attachments.
21. Revision lock after quota exhaustion.
22. Client portal without login.

## Preserved from previous requirements

Where not contradicted:
- Owner → Worker/Designer → Client flow.
- Manual DP/payment recording.
- Order/project management.
- Worker assignment/reassignment.
- Project updates.
- Internal/external data separation.
- Project history/audit trail.
- Search/filter.
- Dashboard.
- Attachment management.
- Secure public tracking.
- Future WhatsApp/payment automation as Phase 2 unless explicitly approved.

## Intentional technical override

The latest BRD lists a browser LocalStorage implementation and an SPA using HTML5/Tailwind/Lucide. Those are treated as BRD prototype/technical notes, not the final production architecture, because the project has an approved modern stack direction:

Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma + PostgreSQL + approved auth + object storage + Vercel.

The business behavior from the BRD is preserved.

## Important business clarification

The BRD defines a simple Kanban of:
- Belum Dikerjakan
- Sedang Dikerjakan
- Selesai

Previously established requirements contain a richer internal lifecycle. The agent must not expose unnecessary internal states to clients. If the richer internal lifecycle is implemented, it should map to the simpler client-facing status.

## Out of scope unless explicitly approved

- Payment gateway
- Fully automated WhatsApp
- Microservices
- Redis
- Kubernetes
- Advanced analytics
- Unlimited revisions
- Client account/password authentication
