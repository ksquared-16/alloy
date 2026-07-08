# GPT Handoff — Processing V2+ (post-freeze)

**Paste this into a new ChatGPT / Cursor thread when continuing Processing work.**

---

## Context

Alloy **Digital Mailroom** (Processing V1) shipped and is **UI frozen** as of 2026-07-08 on `staging`.

- **Product:** Digital Mailroom — “Where operational work happens.”
- **Modes:** Work (Overview | **Queue**) and Studio (Forms | Packets | Fields | Branding)
- **Pipeline:** Import form → Review questions → Generate native form → Studio Builder
- **Rule:** Do **not** redesign the shell. Future work goes **inside** the shell.

Canonical docs:

- `docs/platform/modules/documents-and-forms.md`
- `docs/sprints/07_2026/processing-v1-productization-closeout.md`
- `docs/sprints/07_2026/processing-v1-freeze-closeout.md`
- `docs/sprints/07_2026/processing-v1-cursor-handoff.md`
- `docs/sprints/07_2026/processing-v1-implementation-handoff.md`

Screenshots: `docs/sprints/07_2026/digital-mailroom-identity-screenshots/`

---

## Frozen shell layout

**Navigation (matches Communications):**

```
Digital Mailroom
Where operational work happens.
──────────────────────────────
Work | Studio          ← AlloyModeSwitch
Overview | Queue       ← CommsModalTabBar
──────────────────────────────
[ workspace execution ]
```

Shared component: `OperationalWorkspaceModeNav`

**Work review (document case):**

- **Queue** (~22%) — folder tree + dense rows; `border-r` separates from workspace
- **Source document** (~55%) — PDF hero; compact stepper + metadata header
- **Review questions** (~23%) — flat inspector rows; Bend Pine for confidence/selection only

**Overview:** action cards + `SurfaceHeaderKpiCard` (workspace variant) + differentiated bottom cards.

**Colors:** Midnight Forge, Bend Pine, Stone, White only. No emerald/amber/gray pills in Processing chrome.

---

## What NOT to do

- No shell redesign, no new top-level tabs, no duplicate heroes
- No API / engine / workflow changes unless the sprint explicitly says so
- No random teal/gray/green palette mixing
- No dev banners, build markers, or cleanup hints in production surfaces
- Do not reintroduce boxed question cards or heavy inspector borders

---

## Acceptance test

Open Communications, then Digital Mailroom. Navigation rhythm, dividers, typography, and accent usage should feel like one operating system.

---

## Suggested next threads

Pick **one** per thread:

| Thread | Goal |
|--------|------|
| **OCR intake** | Scanned PDF path through existing Work review panels |
| **AI extraction** | Smarter question detection; same review UX |
| **Studio Packets** | Replace placeholder tab with packet library |
| **Studio Fields / Branding** | Config-only tabs inside Studio |
| **Runtime submission** | Public form submit → processing case linkage |
| **Family experience** | Parent-facing form completion (outside AdminV2 modal) |
| **BOS intelligence** | Recommendations/actions inside frozen Work surfaces |

---

## Key shared modules

- Nav: `OperationalWorkspaceModeNav`, `CommsModalTabBar`, `AlloyModeSwitch`
- KPI tiles: `SurfaceHeaderKpiCard` from `WorkspaceHeader.tsx`
- Question model: `web/lib/pos/processingCase/formDraft/questionResolutionModel.ts`
- Queue API: `/api/admin/processing/queue`

---

## Branch discipline

- Shell/docs fixes: `staging` or short-lived branch → PR → merge
- Feature work: branch from `staging`; keep UI changes inside frozen layout contract
