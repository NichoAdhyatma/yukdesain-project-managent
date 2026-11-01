# CLAUDE.md — YukDesain Studio Portal

Read `AGENTS.md` before doing any implementation. It is the mandatory AI-agent contract.

## Session Start Protocol

**IMPORTANT: Check for latest checkpoint before starting any work.**

1. Check `checkpoints/` folder for the most recent checkpoint
2. If there's a checkpoint newer than your last work, restore it
3. Check `AGENTS.md` for any updates since last session
4. Review `src/types/` and `src/lib/constants/` for any type changes

## Checkpoint Rules

- Create checkpoint after completing each major feature/milestone
- Checkpoint naming: `checkpoint-XXX-feature-name` (e.g., `checkpoint-001-febase-layout-complete`)
- Each checkpoint must have `README.md` documenting:
  - What was built
  - Files changed
  - Validation status
  - How to resume

## Mandatory workflow

For every meaningful UI task:
1. Use UI/UX Pro Max before implementation.
2. Reuse the existing YukDesain design system.
3. Implement required states and responsive behavior.
4. Run the installed `/antislop` review.
5. Fix valid findings.
6. Run validation: typecheck, lint, tests, and build as applicable.

## Business source of truth

Read the current BRD and relevant files under `docs/` before changing business behavior.

Never invent:
- pricing rules
- revision rules
- permissions
- status transitions
- client-visible data
- payment behavior
- service behavior

When requirements conflict, use the latest approved requirement and document the change.

## Feature guides

- **WhatsApp AI Chatbot & Order Intake** (approved 2026-11-01, v2): read `docs/WHATSAPP_AI_CHATBOT.md` before touching anything under `src/lib/whatsapp/`, `src/app/api/whatsapp/`, `src/app/api/wa-intakes/`, `/wa-orders`, or WhatsApp settings. The AI only writes drafts (brief draft, payment-proof extraction). Price, deadline, DP validity, and project creation are always admin actions in the portal.
