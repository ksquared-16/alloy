---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# BOS Rail Action Icon Doctrine

**Status:** ACTIVE  
**Last Updated:** June 2026  
**Companion:** `docs/system/bos-identity-doctrine.md`

---

## Rule

The **BOS logo identifies the system once** — in the rail header (`BosHeader`).

**Recommendation and starter rows use operational action icons** — not `BosMark`.

---

## Row icon mapping

| Action | Icon key | Visual |
|--------|----------|--------|
| Summarize Queue / Lead | `summarize` | Document / summary (`FileText`) |
| Identify Missing Information | `missing` | Search / inspection (`Search`) |
| Draft Follow-up | `draft` | Message (`MessageSquare`) |
| Review Documents | `documents` | Document stack (`FileStack`) |
| Prepare Outreach | `outreach` | Phone / conversation (`Phone`) |
| Explain Attention Item | `insight` | Guidance / insight (`Lightbulb`) |

---

## Requirements

- Bend Pine stroke (`#00A283`)
- Consistent `strokeWidth={1.75}`
- Lightweight 16px icons
- Operational — improve scanning, not brand repetition

---

## Implementation

| Piece | Location |
|-------|----------|
| Icon component | `web/app/adminV2/components/bos/identity/BosRailActionIcon.tsx` |
| Icon keys on suggestions | `web/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout.ts` |
| Rail starter rows | `web/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx` |

---

## Rejected

- `BosMark` on every recommendation row
- Generic sparkle / AI icons
- Mixed stroke weights or non-pine accent colors on row icons

---

## Approved BOS mark usage (not row icons)

- Rail header (`BosRailHeader` → `BosHeader`)
- Primary BOS CTAs (`BosButton`, drawer assist when appropriate)
- Identity loader (`AlloyIdentityLoader`)
- Live analyze reveal (`BosRevealSequence`)
