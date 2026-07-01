# Action Workspace V2 — Intake Experience Mockups

**Status:** Design sign-off (pre-implementation)  
**Scope:** First-screen intake layout only — no BOS identity redesign, no workflow/backend changes  
**Gallery:** `/dev/action-workspace-intake-mockups`

---

## Problem

Current production intake still reads as:

- Modal + form
- Giant textarea
- Blue header bolted onto white body
- Lonely “Analyze with BOS” button below the field

Target feeling: **“I’m entering a BOS workspace”** — not **“I’m filling out a form.”**

---

## Rejected baseline

| Element | Why rejected |
|---------|----------------|
| Midnight Forge header bar + white body | Disconnected hybrid; feels like modal chrome |
| Giant `<textarea>` styling | Reads as CRM import form |
| Analyze button below canvas | Orphan action, not integrated workspace |
| Workspace reveal on empty open | BOS reveals intelligence, not containers |

---

## Layout options

Screenshots: `docs/sprints/06_2026/assets/action-workspace-intake-mockups/`

### Option A · Preferred — Cohesive BOS environment

**File:** `01-option-a-cohesive-environment.png`

- Fog backdrop + Midnight Forge perimeter (`ForgeCarvedPanel`)
- White workspace **carved from center** with cloud perimeter on the content surface
- `BosHeader` on white surface (not on dark bar)
- Paste channel chips (Email, Call Note, Website Inquiry, Enrollment Request)
- Document content surface (not textarea chrome)
- Integrated action rail: Cancel · Enter manually · **Analyze with BOS**

**Best fit for sprint direction:** single cohesive environment; removes header/body split.

### Option B — Document workspace

**File:** `02-option-b-document-workspace.png`

- Single `BosWorkspaceShell` on fog backdrop
- Document frame is the hero; minimal outer chrome
- Analyze in document footer rail

**Tradeoff:** lighter environment; less “forge carved from center” drama than A.

### Option C — BOS guidance rail + document canvas

**File:** `03-option-c-guidance-rail.png`

- Split: left `BosNotification` + guidance list; right document surface
- Full-width action rail below

**Tradeoff:** more explanatory; closer to workstation than pure workspace. May overlap Concept B+ split-pane for later phases.

### Option D — Forge band + inset document card

**File:** `04-option-d-forge-band.png`

- Step rail on Midnight Forge band only
- White document card inset inside forge shell
- Action rail on card footer

**Tradeoff:** strong carved-center feel; step rail still on dark band (partial hybrid).

---

## Reveal behavior (unchanged doctrine)

| Moment | Reveal |
|--------|--------|
| Open intake workspace | **None** — workspace appears immediately |
| Analyze → BOS thinking | `BosRevealSequence` `mode="working"` |
| Full BOS modal entry (other flows) | `mode="workspace"` only when opening a BOS command experience |

---

## Recommended next step

1. **Choose layout** (default recommendation: **Option A**)
2. Implement intake surface in `ActionWorkspacePasteCanvas` + `ActionWorkspaceBosShell` shell composition only
3. Remove workspace reveal on Create Lead open (`ActionWorkspaceBosShell`)
4. Keep working reveal on analyze only

---

## Capture screenshots

```bash
cd web && npm run screenshots:action-workspace-intake
```

Requires dev server on port 3000 (or Playwright webServer config).
