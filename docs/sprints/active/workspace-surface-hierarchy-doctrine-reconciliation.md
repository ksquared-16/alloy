---
owner: sprint
status: sprint
last_reviewed: 2026-07-16
supersedes: []
---

# Workspace Surface Hierarchy — Doctrine Reconciliation

**Sprint:** `workspace-surface-hierarchy` (slot 5)
**Artifact type:** Investigation / ownership reconciliation — **not** platform doctrine
**Date:** 2026-07-16
**Status:** Paused for review before visual inventory

This report corrects the sprint premise against the repository. It does **not** invent a parallel Workspace Surface Hierarchy. Frozen operational hierarchy remains authoritative for its declared scope.

---

## A. Existing canonical truth

### Owner (frozen five-layer hierarchy)

**Document:** `docs/platform/core/navigation-and-workspace-doctrine.md`
**Section:** `Alloy Operational Workspace Doctrine V3 (frozen)`
**Subsection:** `Visual hierarchy (five layers — frozen)`

**Status in doc:** Frozen and certified (July 2026).

### Frozen hierarchy (verbatim structure)

| Layer | Name | Treatment | Components / tokens |
|-------|------|-----------|---------------------|
| **1** | Application shell | White modal chrome; compact header; mode/sub-nav; control-band divider | `WorkspaceShell`, `WorkspaceHeader`, `WorkspaceModeNav`, `WorkspaceModeTabs`, `WorkspaceSubTabs`, `WS_CONTROL_BAND_DIVIDER` |
| **2** | Workspace field | Inset stone canvas (~7% River Stone wash) inside white gutter | `WS_SHELL_INSET`, `WS_FIELD_CANVAS`, `WS_FIELD` |
| **3** | White operational surfaces | Cards, queue rail, source document, review inspector, studio panels | `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel`, `WS_QUEUE_RAIL`, `WS_ARTIFACT_CANVAS` |
| **4** | Interactive objects | Buttons, rows, CTAs, toggles, zoom controls, queue actions | `WS_ACTION_PRIMARY`, `WS_ACTION_SECONDARY`, `WorkspaceArtifactZoomControls` |
| **5** | Selection / Bend Pine | Selected queue row, active tab, active stage, primary progress | `WS_ROW_SELECTED`, Bend Pine washes, left selection rails |

**Hard rules already locked:**

- Layer 1 is **never** stone-tinted full-bleed.
- Layer 2 is **inset** inside the white shell.
- Layer 3 surfaces **float** on the stone field with soft elevation — not flat all-white modals.
- Containment prefers spacing over boxes; no double stone tint.

### Declared scope

The V3 section states this is the **canonical operational workspace visual system for every AdminV2 module modal**. Explicit inheritance list includes Scheduling, Attendance, Billing, Commercial, and future modules.

It is **explicitly distinct** from the org-level `/workspace` landing (Presentation Runtime four-zone command center).

`WorkspaceShell` implementation comments reinforce the exclusion list:

- Do **not** use for `/workspace` org landing (`WorkspaceRootShell`).
- Do **not** use for entity drawers / Focus Panel record surfaces.
- Do **not** use for Settings or configuration pages outside the operational modal pattern.

**Conclusion on scope:** The frozen five-layer hierarchy is **not** a platform-wide surface doctrine. It is the frozen composition for **operational module modals**. It is already intended to govern that class broadly (all future operational modals), not only Processing — but it does **not** currently claim Focus Panel, Settings, Configuration Runtime, org landing, or analytics page chrome as consumers of `WorkspaceShell` + stone field.

### Reference implementations

| Role | Module |
|------|--------|
| Reference implementation | Processing (Digital Mailroom) |
| Certified consumers | Communications, Work Items |

### Implementation primitives (executable vocabulary)

| Concern | Location |
|---------|----------|
| Component barrel + layer map | `web/components/workspace/doctrine.ts` |
| Tokens | `web/components/workspace/workspaceTokens.ts` (`WS_SHELL_INSET`, `WS_FIELD_CANVAS`, `WS_FIELD`, …) |
| Shell ownership of Layer 2 | `web/components/workspace/WorkspaceShell.tsx` |
| White surfaces / regions | `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel` |
| Doctrine import surface | `@/components/workspace/doctrine` |

`alloy-visual-language.md` already points at `doctrine.ts` as the **executable workspace vocabulary** and at `navigation-and-workspace-doctrine.md` for operational workspace doctrine — without replacing the visual-language document.

---

## B. Scope matrix

Classification key:

- **Explicit** — named in frozen V3 / WorkspaceShell exclusion / certified list
- **Implicit** — same category as V3 (operational module modal) but not yet certified
- **Other doctrine** — governed by a different canonical owner
- **Ungoverned** — no clear surface-layering owner for background / region / object hierarchy
- **Conflict / ambiguous** — overlapping owners or stale vocabulary

| Surface | Classification | Notes |
|---------|----------------|-------|
| **Processing** | Explicit | V3 reference implementation |
| **Communications** | Explicit | Certified V3 consumer |
| **Work Items** | Explicit | Certified V3 consumer |
| **Commercial** | Implicit | Named as future V3 inheritor; not certified in table |
| **Business Processes** (operational module shape) | Implicit / Other | Process execution uses Work Unit / Focus Panel; BP *settings* are configuration plane |
| **Workspace shell** (module modal) | Explicit | `WorkspaceShell` owns Layers 1–2 |
| **Queues** (inside operational modals) | Explicit | Layer 3 (`WS_QUEUE_RAIL`, zone panels) under V3 |
| **Current Work** | Other doctrine | Record/execution card surface; `current-work-surface.md` + System 5 / Universal Card — not V3 shell |
| **Focus Panels** | Other doctrine | System 1–5 + drawer/Focus Panel docs; white canvas + card grammar — **not** stone Layer 2 |
| **Drawers / Focus Panel infrastructure** | Other doctrine | Reveal/open-state + Focus Panel product surface; V3 excluded |
| **Settings** | Other doctrine | Configuration plane; white canvas forced in `configurationRuntime.css` |
| **Locations** | Other doctrine | Configuration workspace / Configuration Runtime consumer; visual language is white canvas + object cards |
| **Configuration Runtime** | Other doctrine | `configuration-workspace-visual-language.md` + CSS: **Canvas: white** |
| **Organization landing** (`/workspace`) | Other doctrine | Command-center / Presentation Runtime; V3 explicitly distinct; System 5 “white canvas” language |
| **Dialogs / command surfaces** | Ungoverned / Other | Interaction model + modal shells exist; no five-layer mapping |
| **Landing pages** (module Overview landings) | Explicit (when inside V3 shell) | Overview landings on stone field via `WorkspaceSurface` / cards |
| **Analytics** | Conflict / ambiguous | `operational-workspace-shell.md` lists Operational Intelligence as a fourth reference module; V3 certified table does not; analytics modal may not fully compose V3 stone field |
| **Planning surfaces** | Ungoverned | Planning plane exists in operational UX doctrine; no surface-layering owner |
| **Queues** (Work Unit condensed queue) | Other doctrine | Queue system + Runtime Spec / System 2 — not V3 modal stack |
| **Embedded workspace** (card expansion) | Other doctrine | System 5B card interaction; not V3 shell |

### Category mapping status (shared grammar vs identical layout)

| Category | Layering owner today | Stone Layer 2? | Gap |
|----------|----------------------|----------------|-----|
| Organization landing | Command-center / Presentation Runtime + System 5 language | No (white canvas language) | No shared grammar mapping to V3 layer names |
| Operational workspace (module modal) | **V3 frozen** | Yes (required) | Certified for 3 modules; future modules implicit |
| Work Unit / queue-and-focus | Runtime Spec + System 5 | No | Hierarchy expressed as queue + Focus Panel peers, not modal stone field |
| Focus Panel | System 3–5 + drawer docs | No (white) | Region vs card rules exist; not framed as V3 layers |
| Configuration workspace | Configuration visual language | No (white by doctrine) | Card/section overuse risk; Locations exposed composition gap **inside white canvas**, not missing V3 stone |
| Analytics workspace | Partial (`operational-workspace-shell.md`) | Unclear in code/docs | Ownership drift vs V3 |
| Planning workspace | Plane doctrine only | Unknown | Surface layering ungoverned |
| Dialog / command surface | Interaction / modal primitives | Unknown | No layering grammar |
| Embedded workspace | System 5B | N/A (inside Focus Panel / card) | Not V3 |

**Important distinction preserved:** Locations’ “missing intermediate canvas” finding does **not** automatically mean Configuration must adopt operational Layer 2 stone. Configuration doctrine currently **requires white canvas**. The genuine question is category-specific composition: where working regions vs objects vs cards belong **within** each category’s shell/canvas choice.

---

## C. Ownership recommendation

### Question answers

1. **What visual hierarchy is already canonical?**
   The five-layer Operational Workspace Doctrine V3 hierarchy in `navigation-and-workspace-doctrine.md`, executed by `web/components/workspace/*`.

2. **What surface categories does it explicitly govern?**
   AdminV2 **operational module modals** (Processing reference; Communications / Work Items certified; future operational modals inherit).

3. **Limited to operational module modals, or wider platform?**
   **Limited to operational module modals** by explicit text and by `WorkspaceShell` exclusion comments. Wider platform surfaces have other owners (System 5, configuration visual language, command center).

4. **Which requested surfaces are already covered?**
   Processing, Communications, Work Items, and (by inheritance claim) future operational modals including Commercial. Queues/landings **inside** those modals.

5. **Which remain genuinely uncovered (for shared layering grammar)?**
   Organization landing, Work Unit/queue-and-focus composition, Focus Panel region philosophy relative to V3 vocabulary, Configuration/Settings/Locations composition (region vs card), Dialogs, Analytics certification gap, Planning, Embedded workspace mapping.

6. **Overlaps / conflicts / inconsistent vocabulary?**

   | Issue | Detail |
   |-------|--------|
   | Stale V2 index | `design-and-operational-doctrine.md` still cites **V2** + `WorkspaceMetricTiles` as frozen presentation doctrine |
   | Stale shell companion | `operational-workspace-shell.md` still documents CompactKpiStrip / `WorkspaceMetricTiles` / older header stack while also claiming V2 frozen primitives — conflicts with V3 `WorkspaceOperationalHealth` |
   | Comment drift | `WorkspaceShell.tsx` header says Doctrine **V2**; `doctrine.ts` says **V3** |
   | Token file header drift | `workspaceTokens.ts` top comment still says “white canvas + white panels”; frozen Layer 2 is stone field |
   | “Canvas” overload | V3 Layer 2 = stone workspace field; System 5 / config / command center say **white canvas** — same word, different layers |
   | Dual operational-shell docs | `navigation-and-workspace-doctrine.md` (V3) vs `operational-workspace-shell.md` (structural + partially superseded presentation) |

7. **Which existing document should own the generalized doctrine?**
   Do **not** create a new parallel owner named “Workspace Surface Hierarchy.”

   Recommended ownership split (one truth per concern):

   | Concern | Canonical owner |
   |---------|-----------------|
   | Operational module modal composition + frozen five layers + stone field | **`navigation-and-workspace-doctrine.md` (V3)** — keep |
   | Cross-category *layering grammar* (shared names, category-specific compositions) | **`alloy-visual-language.md`** — amend (feel/philosophy bridge; already points at `doctrine.ts`) |
   | Focus Panel / Work Unit card & region composition | **System 5** (`operational-surface-design-system.md`) + Runtime Spec — keep |
   | Configuration / Settings / Locations visual composition | **`configuration-workspace-visual-language.md`** — keep; amend only if category mapping changes white-canvas rule |
   | Presentation index / freeze pointers | **`design-and-operational-doctrine.md`** — amend V2→V3, stop citing obsolete KPI primitive |
   | Structural module shell grammar (modes, queue→workspace) | **`operational-workspace-shell.md`** — amend to defer presentation hierarchy to V3; remove conflicting KPI/header stacks |

8. **Should this sprint amend / extract / or conclude no new doc?**

**Recommendation: amend existing canonical owners — do not create a new doctrine document.**

Smallest truthful documentation change:

1. **Do not** introduce `docs/platform/**/workspace-surface-hierarchy.md` as a competing owner.
2. **Do not** mark V3 obsolete.
3. **Amend** `design-and-operational-doctrine.md` freeze/index lines: V2 → V3; `WorkspaceMetricTiles` → `WorkspaceOperationalHealth` / overview activity tiles.
4. **Amend** `operational-workspace-shell.md` to state it owns structural grammar and defers visual hierarchy / KPI presentation to V3.
5. **Amend** `alloy-visual-language.md` with a short **Surface layering grammar** section that:
   - names the five layers as shared vocabulary;
   - states that **category compositions may differ** (stone field vs white canvas);
   - points each category to its owner;
   - forbids inventing parallel hierarchies per module.
6. Optionally sync comment headers in `WorkspaceShell.tsx` / `workspaceTokens.ts` when implementation work is approved (out of scope for this reconciliation commit).

**Not recommended now:** extracting a brand-new platform owner that restates the five layers. That would violate one-truth / one-owner unless V3 were narrowed underneath it in the same change — larger than needed until category mapping is approved.

---

## D. Revised sprint plan (gaps only)

### Out of scope (already frozen — do not reinvent)

- Five-layer hierarchy for operational module modals
- Processing / Communications / Work Items as V3 reference/certified set
- Stone field ownership inside `WorkspaceShell`
- Runtime, navigation, BOS, interaction redesign
- Token / palette redesign

### Remaining investigation (approved next steps only after this review)

1. **Category composition map (docs-only)**
   For each category in the table above, map: shell / canvas / working region / object / control — using existing owners’ vocabulary. Output: amendment draft for `alloy-visual-language.md` (not a new owner).

2. **Targeted visual inventory (gap surfaces only)**
   Inventory composition of: Organization landing, Work Unit + Focus Panel, Configuration Runtime / Locations / Settings, Analytics modal, Dialogs, Planning (if any UI).
   Skip full re-inventory of Processing / Communications / Work Items except as **reference baselines**.

3. **Region vs Object vs Card reconciliation**
   Compare V3 containment doctrine (“spacing over boxes”) with Configuration (“sections as rows inside one card”) and System 5 card grammar. Produce one vocabulary table for amendments — no UI.

4. **Stale-pointer cleanup PR plan**
   List exact paragraphs to amend in `design-and-operational-doctrine.md` and `operational-workspace-shell.md` (and optional code comment sync).

5. **Implementation roadmap (recommendations only)**
   Rollout order for *future* UI work after doctrine amendments are approved — likely: (a) doc pointer fixes, (b) Configuration region/card discipline (Locations as candidate), (c) Analytics V3 certification gap, (d) org landing / Focus Panel only if category map says they need change.

6. **External product study**
   Downgraded: optional, non-authoritative, only after Alloy gaps are named. Must not override frozen V3 or configuration white-canvas rules.

### Explicit non-goals until approval

- No UI implementation
- No token changes
- No new color palette
- No new canonical doctrine file under `docs/platform/`
- No marking V3 obsolete

---

## Pause point

Stop here for Kelly review of:

1. Scope reading (V3 = operational modals, not whole platform)
2. Ownership recommendation (amend `alloy-visual-language.md` + fix V2 drift; keep V3 owner)
3. Revised gap-only sprint plan

Do not proceed to full-platform visual inventory until this reconciliation is accepted or redirected.
