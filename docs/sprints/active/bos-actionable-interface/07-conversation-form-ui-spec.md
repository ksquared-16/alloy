---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 07 — Conversation / Form UI Specification

## Visual doctrine

Honor `alloy-visual-language.md` + frozen `bos-identity-doctrine.md`:

- Business meaning before fields
- Calm under pressure
- No raw admin-panel feel
- Shared Alloy input primitives
- No new BOS motifs (no sparkles, glow blobs, genie)
- Reuse `AlloyIdentityLoader` for execute waits
- Immediate acknowledgement; no blank transitions

## Composition

```text
BOS panel (floating or pinned)
├── Session header
│   ├── Command title (“Create Lead”)
│   ├── Mode toggle: Conversation | Form
│   └── Close / discard
├── Body
│   ├── Conversation mode: thread + composer
│   └── Form mode: intake fields + household repeaters
├── Sticky resolution strip (missing required / warnings)
└── Footer
    ├── Secondary: Switch mode / Discard
    └── Primary: Continue to preview → Confirm → (Processing)
```

Prefer composing **CommandSurfaceShell anatomy** (header/body/footer/success/failure) for preview/confirm/success phases even when Conversation gather looks chat-like.

## Mode specifics

### Conversation

- Composer supports paste, type; dictate = future (don’t block V1).
- Assistant turns: ack, parse summary, follow-up questions (one cluster at a time), preview card, errors, success.
- Evidence: “From your note” / “Suggested” chips under extracted values in summary cards — not confidence %.

### Form

- Embed existing operational intake controls.
- Show evidence state per field.
- Multi parent/child repeaters unchanged semantically.
- Cascading location/program/room/schedule unchanged sources.

## Focus Panel / Actions

- BOS geometry changes must not move Work Unit Actions or Focus Panel Manage lists.
- When Processing review needs width, pin BOS or allow IdentityReviewPanel to use the existing modal/drawer pattern **owned by Processing** if rail is too narrow — product preference: pin BOS first; fall back to current in-flow panel used by modal today.

## Minimum dimensions

| Context | Behavior |
|---|---|
| Pinned ≥ ~420px | Full Form usable |
| Floating narrow | Prefer Conversation; Form stacks single column |
| Viewport ≤1000px | Existing BOS stack rules (`max-height` etc.) |

## Motion

- Action click → BOS open: existing presentation motion.
- Mode switch: cross-fade content, retain header.
- Execute: identity loader, not custom spinner.

## Copy rules

- No raw `create_lead`, payload keys, or readiness enums.
- Confirm CTA: “Continue to Processing review”.
- Success: reuse `createLeadSuccess` copy builders where possible.
