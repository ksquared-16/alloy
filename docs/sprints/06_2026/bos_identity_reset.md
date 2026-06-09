# BOS Identity Reset

**Path:** `docs/sprints/06_2026/bos_identity_reset.md`  
**Status:** Shape exploration — design sign-off gate  
**Date:** 2026-06-08

## Decisions (binding)

### 1. Gold removed from BOS identity

Gold is not part of the Alloy operating language for BOS. It created visual noise in Action Workspace explorations. Gold may exist as an optional future accent elsewhere — **not** as BOS primary, border, divider, or fill.

### 2. BOS color system

| Role | Token | Hex | Meaning |
|------|-------|-----|---------|
| **Platform** | Midnight Forge | `#273F52` | Structure, records, authority, OS |
| **BOS** | Bend Pine | `#00A283` | Intelligence, assistance, recommendations, confirmed outcomes |
| **Human attention** | Amber | semantic | Review required, uncertainty, confirmation |
| **Risk** | Red | semantic | Low confidence, blocking, incorrect extraction |

### 3. BOS needs a recognizable shape

Not a cartoon cloud. Not AI clip art. A **signature contour** recognizable without reading "BOS."

Surfaces: Command Center · Action Workspace · BOS Findings · Drawer BOS Cards · future BOS UI.

### 4. Layout unchanged

Concept B split-pane Action Workspace is approved. This sprint answers: **"What does BOS look like?"**

---

## Four shape explorations

| Option | Name | Recognition mechanism |
|--------|------|----------------------|
| **A** | Cloud BOS | Soft cloud crest — organic, ambient, subtle |
| **B** | Contour BOS | Bold asymmetric intelligence frame — distinctive silhouette |
| **C** | Halo BOS | Bend-pine radial halo — framing through glow |
| **D** | Intelligence Frame BOS | Geometric corner-notch frame — engineered, scalable |

Each exploration applied to:

1. Action Workspace (Concept B · Findings)
2. Command Center rail
3. Drawer BOS card

---

## Mockups

**Gallery:** `http://localhost:3000/dev/bos-shape-exploration`

```bash
cd web && npm run screenshots:bos-shape
```

Output: `docs/sprints/06_2026/assets/bos-shape-exploration/`

| File | Shape |
|------|-------|
| `A-cloud-bos.png` | Cloud BOS |
| `B-contour-bos.png` | Contour BOS |
| `C-halo-bos.png` | Halo BOS |
| `D-intelligence-frame-bos.png` | Intelligence Frame BOS |

SVG reference: `web/app/dev/bos-shape-exploration/BosShapeMarks.tsx`

---

## Option summaries

### A · Cloud BOS

**Feel:** Approachable, ambient intelligence.  
**Shape:** Gentle multi-bump cloud crest on pane top; mini cloud badge.  
**Best when:** BOS should feel supportive, not territorial.  
**Risk:** May be too subtle without stronger stroke discipline.

### B · Contour BOS

**Feel:** Intentional, present, owns BOS territory.  
**Shape:** Asymmetric crest + anchored base; heavier pine stroke.  
**Best when:** Maximum recognition at small scale.  
**Risk:** Blob UI trend if over-rounded.

### C · Halo BOS

**Feel:** Focused attention, premium glow.  
**Shape:** Radial bend-pine halo behind content — no hard outline.  
**Best when:** Soft framing without geometric weight.  
**Risk:** Invisible on busy backgrounds without opacity rules.

### D · Intelligence Frame BOS

**Feel:** Precision instrument, Alloy-native engineering.  
**Shape:** Characteristic corner notch + pine rail; same geometry badge → workspace.  
**Best when:** Platform-grade scalability and cold trust.  
**Risk:** Can feel cold without pine wash warmth.

---

## Preliminary recommendation (for discussion)

**D · Intelligence Frame** as primary platform shape, with **B · Contour** crest energy on Action Workspace findings pane.

| Criterion | Cloud | Contour | Halo | Intelligence Frame |
|-----------|-------|---------|------|---------------------|
| Recognition at icon scale | ★★☆ | ★★★★ | ★★☆ | ★★★★★ |
| Premium / subtle | ★★★★ | ★★★☆ | ★★★★★ | ★★★★ |
| Cross-surface scale | ★★★ | ★★★★ | ★★★ | ★★★★★ |
| Avoids cartoon | ★★★ | ★★★★ | ★★★★★ | ★★★★★ |
| Alloy OS feel | ★★★ | ★★★★ | ★★★ | ★★★★★ |

**Rationale:** Intelligence Frame's corner notch is memorable at badge size and scales cleanly to Command Center and full workspace without morphing the path family. Contour's organic crest is strong but risks blob association; Cloud and Halo are softer but weaker at thumbnail recognition.

**Final choice requires design sign-off.**

---

## Workspace shell exploration (correct problem)

The BOS shape is **not** the findings pane, card, or Command Center chip.

The shape is the **Action Workspace outer container** — entering BOS territory, not another rectangle modal.

**Gallery:** `http://localhost:3000/dev/bos-workspace-shell-exploration`

Five shell explorations (top-edge crest hypothesis — normal sides, normal bottom):

1. Cloud Shell
2. Organic Contour Shell
3. Intelligence Halo Shell
4. Sculpted Alloy Shell
5. Dynamic Island-inspired BOS Shell

Each shows **closed** and **open** states over simulated Alloy workspace. Interior split-pane unchanged.

```bash
cd web && npm run screenshots:bos-workspace-shell
```

Output: `docs/sprints/06_2026/assets/bos-workspace-shell-exploration/`

---

## Atmospheric border (approved direction)

Organic Contour #2 approved as **base** — but contour is **atmosphere, not shape**.

| Rule | Detail |
|------|--------|
| Full perimeter | All four sides participate |
| Structure | Enterprise rectangular — layout/dimensions unchanged |
| Ripples | Reduced 60–70% vs contour shell |
| Border | Thick bend-pine, **low opacity** — soft intelligence field |
| Avoid | Cloud silhouettes, blob UI, cartoon |

Three explorations:

1. **A · Soft Intelligence Field** — uniform multi-layer glow
2. **B · Brainwave Border** — subtle sine on full perimeter (35% amplitude)
3. **C · Cloud Energy Border** — diffuse energy wash, no cloud path

**Gallery:** `http://localhost:3000/dev/bos-atmospheric-border-exploration`

```bash
cd web && npm run screenshots:bos-atmospheric-border
```

Output: `docs/sprints/06_2026/assets/bos-atmospheric-border-exploration/`

User read: *"this surface feels different"* — not *"that's a cloud"*.

---

## Implemented — BOS Cloud Territory v1 (Create Lead only)

**Production:** `ActionWorkspaceBosCloudShell` wraps `CreateLeadModal` only.

- BOS territory via physical shell (`BosTerritoryShell`) — organic perimeter band + workspace cavity inside
- Header uses platform `midnightForge` (#273F52) — Alloy extension, not separate BOS blue
- Differentiation through shape, perimeter, material — not second dark color family
- Target: "entered BOS territory" not "modal with special effects"
- Step rail: Bend Pine active, muted pine completed, neutral grey future (no blue)
- Manual entry: `ActionWorkspaceBosGuidancePanel` keeps BOS presence
- Execute: neural pulse + live assembly phase labels (presentation only)
- Success: household label + suggested next actions (Schedule Tour / Welcome Email disabled until drawer opens)
- Default `ActionWorkspaceShell` unchanged for other actions

**Gallery:** `http://localhost:3000/dev/action-workspace-bos-cloud`

```bash
cd web && npm run screenshots:action-workspace-bos-cloud
```

Output: `docs/sprints/06_2026/assets/action-workspace-bos-cloud/`

Post sign-off:

1. Promote chosen `BosShapeMark` to shared design system
2. Update Command Center shell, Action Workspace, drawer BOS panels
3. Document color rules in `docs/system/action-workspace-foundation.md` + BOS UX coherence doc
4. Remove gold from `ActionWorkspaceBosBanner` and dev mockups

Use rough sketch as shape reference: cloud territory outside, workspace safely inside, no hard cutoff.

**No workflow, execute path, registry, or backend changes.**

---

## BOS Workspace Shell v1 — Final polish (closed)

Presentation layer complete. **Stop cloud experimentation** unless usability issue found.

### Functional cutover sprint (next)

Priority order for production workflow integration:

1. Real BOS intake
2. Real extraction
3. Real field suggestions
4. Real layout-driven forms
5. Real lead creation
6. Real drawer handoff

**Finish line:** Create Lead → BOS Intake → BOS Suggestions → Review → Create Lead → Open Lead Drawer using real platform data and layouts.

### v1 polish delivered

- Cloud foreground stroke overlaps workspace perimeter (~28px bleed) — single atmospheric object
- Material blend inset shadow — workspace carved into cloud, not modal-on-illustration
- Workflow rail: Bend Pine active, muted pine completed, grey future
- Manual entry: BOS Guidance panel + Notion/Linear form hierarchy
- Execute: household neural graph + 6 assembly phases
- Success: BOS Recommendations section (presentation only)
