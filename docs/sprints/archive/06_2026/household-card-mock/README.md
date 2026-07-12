# Household Card — Visual Mock (review artifact)

**Status:** Mock **approved and implemented** (June 2026). Household v1 ships in the
active Focus Panel. This directory keeps both the original design mock and
verification snapshots of the **shipped production component**.

## Production component verification (shipped card)

These are screenshots of the **real `HouseholdCard`** (not the mock) rendered from
fixture `OperationalContext` values via the dev harness
`web/app/dev/household-card-verify/` (dev-only, 404 in production):

![Household production — all states](./05-production-states.png)

![Household production — evidence/expanded](./06-production-evidence.png)

![Household production — focused emergency](./07-production-focused-emergency.png)

Confirmed in the shipped card: neutral chrome (semantic color only as a badge /
warning), children **belonging-only** (count chip + names, no age/program/status),
**address** surfaced in Evidence (not forced into Overview), **masked channels**
("Contact details restricted") for Permission-Limited, and Missing-Primary /
Missing-Emergency / Empty states.

---

**Original design mock** (for reference): NOT the production card.

## How to view (preferred — live)

```bash
cd web && npm run dev
# open http://localhost:3000/dev/household-card-mock   (route 404s in production builds)
```

- Route: `web/app/dev/household-card-mock/page.tsx`
- Gallery: `web/app/dev/household-card-mock/HouseholdCardMockGallery.tsx` (self-contained, local fixtures, scoped `hcm-` styles — does not import or modify the production card)

## Snapshots

**Implementation-approved Household v1** (the frozen build set):

![Household Card — approved v1 set](./03-approved-v1.png)

All states:

![Household Card mock — states](./04-states.png)

Full gallery (states + densities + transitions + models) and interactive demo:

![Household Card mock — full gallery](./01-full-gallery.png)

![Household Card mock — interactive perspective demo](./02-interactive-demo.png)

## Revision (v1 calm pass)

- Overview kept largely as-is (closest to target).
- **Evidence simplified:** Primary Contact is the dominant answer; the rest are compact single-line group rows (not full tables). Reduced borders/lines — pill stats, borderless group rows.
- **Removed "Open full contact profile"** from the card. Subject change is documented separately as a future **Change Subject** interaction, not a card behavior.
- **Children belonging-only:** names + count only. No program, room, schedule, status, or age.
- Focused Emergency Contact and Focused Authorized Pickup detail model preserved.
- Added the **Implementation-approved Household v1** section (Overview, Evidence, Focused Contact, Focused Emergency, Missing Primary, Missing Emergency, Mobile).

## What it shows

- **Interactive demo** — drives the perspective state machine (Overview → Evidence → Focused → Edit) as local UI state only.
- **States** — Overview, Evidence, Focused Contact, Focused Emergency, Focused Authorized Pickup, Edit-ready (inline), Missing Primary (blocking), Missing Emergency (attention), Empty, Permission Limited, Loading-via-Operational-Context.
- **Densities** — Queue, Summary, Work, Focused, Mobile.
- **Transitions** — table of trigger / animation / stays-mounted / loads / never-loads / performance feel for all seven required transitions.
- **Models** — interaction, performance, loading, editing.

## Architecture (no drawer / product-surface language)

```
Operational Context  →  Focus Panel  →  Surface / Card layout  →  Household Card perspectives
```

The card observes one Operational Context (subject id = `context.subject.id`, data = `context.truth`, permissions = `context.capabilities`). Perspectives are local UI state. There is no drawer and no per-subject surface.

## Gate

Per the sprint hard rule, **do not implement the production Household card until this mock/spec is reviewed and approved.** Freeze spec: [`../../../platform/operator/household-reference-card.md`](../../../platform/operator/household-reference-card.md).
