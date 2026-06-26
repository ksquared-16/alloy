# Alloy OS Configuration Runtime — Business Processes UX Redesign

**Status:** Design blueprint (pre-implementation) — June 2026  
**Superseded styling:** Configuration Mode visual doctrine (`docs/system/configuration-mode-doctrine.md`) — **do not use blue/gray legacy admin styling** on Configuration Runtime surfaces. Use Alloy pine/midnight/forge/stone tokens only.
**Scope:** Business Processes configuration experience only  
**Implementation:** **Paused** until this document is approved  
**Runtime:** Frozen — no primitive redesign, no Queue Builder, no Focus Panel Builder

---

## Executive summary

The Configuration Runtime **architecture and ownership doctrine are correct**. The **UX is not yet operational**.

Phase 2 Perspectives work proved that metadata ownership (BP) vs presentation ownership (Experience Builder) is sound. The interface still reads as a **vertical CRUD form stack** exposing implementation vocabulary (`lane key`, `grain`, `queue_key`) instead of the work operators will perform.

This document is the **blueprint** for all remaining Configuration Runtime UX work. It redesigns Business Processes configuration to feel like **configuring an operating system** — using Universal Card language, business-first copy, runtime preview, and honest presentation assignment — without moving ownership boundaries or inventing parallel builders.

---

# Part 1 — Critique of the current Business Processes page

Reference captures: [Phase 2B design review](./configuration_runtime_phase_2b_design_review.md) and screenshots in [`configuration-runtime-phase-2b/`](./configuration-runtime-phase-2b/).

## 1.1 Form stack, not operational workspace

The stage workspace is a **single-column accordion of forms**:

| Section today | Experience |
|---------------|------------|
| Stage Membership | Long checklist of status categories |
| Stage requirements | Field rule pickers |
| Operating Plan | Work templates + outcomes |
| Perspectives | Metadata form per lane |
| Ready Check | Validation panel |

Each section is a `<details>` block with inputs. The page answers **“what fields exist?”** rather than **“what work happens in this stage?”**

**Symptom:** Administrators scroll through administrative surfaces; nothing resembles the Work Unit they are configuring.

## 1.2 Implementation vocabulary dominates

Current Perspectives card (Lead stage capture):

| Shown to admin | What it actually means | Problem |
|----------------|------------------------|---------|
| `Lane key: lifecycle_lead` | Synced queue lane identity | Exposes slug, not business concept |
| `Grain: case` | Record grain in queue definition | Platform term |
| Display label | Perspective name in rail | OK but isolated |
| Display order | Rail ordering | OK but feels like DB column |
| Assign in Layouts (link only) | Layout slot assignment | No visual connection to runtime |

This violates [Alloy Visual Language](../platform/operator/alloy-visual-language.md) §1: *business meaning before fields*.

## 1.3 Perspectives feel like metadata, not operational lenses

Today a Perspective is edited as **four disconnected inputs** (label, mission, order, visible). It does not communicate:

- **Who** the lens is for  
- **What work** is included  
- **How** records are sorted  
- **What** operators will see (queue + Focus Panel)  
- **Why** this lens exists (mission as operational intent)

The intro copy explains doctrine correctly, but the **card anatomy** still reads as config keys awaiting save.

## 1.4 Presentation is disconnected from runtime

“Assign in Layouts” links jump to the gallery without showing:

- Which layout is currently assigned  
- What that layout looks like  
- How queue row vs Focus Panel differ for this perspective  

Administrators cannot validate operator experience from Business Processes.

## 1.5 No runtime preview path

Configuration and runtime are mentally separate. There is no **Preview work unit** or **Preview this perspective** action that opens the real Work Unit Context with the configured lens applied (future: behind compatibility merge flag).

## 1.6 Save model is form-centric

Unified **Save stage** is correct architecturally, but dirty state lives only on the top bar. Card-level stories do not show **what changed** or **what will happen** when saved.

## 1.7 Missing cards in the story

`LifecycleStageLayoutAssignmentsCard` exists in codebase but is **not in the stage workspace**. Doctrine expects **Presentation** between Perspectives and Ready Check — today the story jumps from Perspectives to validation.

## 1.8 What is working (preserve)

| Working | Keep |
|---------|------|
| `/settings/business-processes` canonical route | ✅ |
| Process catalog → stage tabs mental model | ✅ |
| BP owns stage membership, requirements, operating plan, perspectives metadata | ✅ |
| EB owns layout authoring; BP owns assignments | ✅ |
| Unified Save stage transaction | ✅ |
| No standalone Perspectives route / forbidden builders | ✅ |
| White card Settings shell + pine hero | ✅ |

---

# Part 2 — Redesigned information architecture

## 2.1 Top-level: Business Processes hub

```
/settings/business-processes
├── Process catalog (card rail — select process)
├── Process header (name, tracks, stage count, queue count)
├── Stage navigator (tabs by track)
└── Stage workspace (card grid — see §2.2)
```

**Change:** Process catalog remains entry. Stage workspace becomes a **card grid**, not an accordion form list.

## 2.2 Stage workspace — card grid IA

Each stage is an **operational workspace** composed of Universal Cards (Settings variant — same anatomy, configuration tier).

```
Stage workspace — {Stage label}
├── Context bar (stage stats, Save stage, Preview work unit)
├── Row 1 (identity & membership)
│   ├── Card: Status membership
│   └── Card: Required information
├── Row 2 (how work is experienced)
│   ├── Card: Perspectives (lens list)
│   └── Card: Presentation (layout assignments + previews)
├── Row 3 (automation & actions)
│   ├── Card: Operating plan (work + outcomes + attention)
│   └── Card: Process actions
└── Row 4 (validation)
    └── Card: Ready check
```

**Collapsed default:** Membership + Perspectives summaries visible above fold; other cards collapsed with **insight chips** (e.g. “3 perspectives · 2 visible”, “Queue: Compact · Drawer: Lead overview”).

## 2.3 Perspectives card — internal IA

```
Perspectives card
├── Header: "Perspectives" + summary chip
├── Intro (one line): operational lenses in the work unit
├── Lens list (compact cards, reorderable display order)
│   └── Perspective lens card (see Part 3)
├── Add perspective (disabled when no synced lanes — honest empty state)
└── Advanced ▸ (sync diagnostics: lane sync status, last save — not lane keys)
```

**Rule:** One synced queue lane may yield one default lens. Multi-lane stages show multiple lens cards. Lanes are **never** named `lifecycle_lead` in primary UI — they are introduced as **Queues** in Advanced only.

## 2.4 Perspective lens — field IA (business language)

| Business label | Stores (BP metadata) | Advanced / runtime |
|----------------|----------------------|--------------------|
| **Operators see** | `label` | Maps to rail + header |
| **Mission** | `mission` | Drawer mission line / BOS context |
| **Work included** | `filters_v1` (new, BP-owned business conditions) | Merged at runtime with queue lane filters |
| **Sorted by** | `sort_v1` (business sort presets) | Queue preview ordering |
| **Presentation → Queue** | layout assignment slot (existing) | EB-published queue layout |
| **Presentation → Focus Panel** | layout assignment slot (existing) | EB-published drawer layout |
| **Visible in work unit** | `visible_in_rail` | Runtime rail |
| **Display order** | `display_order` | Rail order |
| **Preview runtime** | — (navigation action) | Opens WUC with perspective applied |
| **Advanced ▸ Technical identity** | `queue_key`, grain | Implementers only |

## 2.5 Presentation card — internal IA

```
Presentation card
├── Queue layout assignment
│   ├── Thumbnail preview (read-only render of assigned layout)
│   ├── Name + version chip
│   └── Change → /settings/layouts?surface=queue&slot=…
├── Focus Panel layout assignment
│   ├── Thumbnail preview (Summary mode sample)
│   ├── Name + version chip
│   └── Change → /settings/layouts?surface=drawer&slot=…
└── Note: "Layout content is authored in Experience Builder"
```

**Not in scope:** embedded layout editor (forbidden). Assignment + preview + deep link only.

## 2.6 Vocabulary mapping (frozen copy deck)

| Retire from primary UI | Replace with |
|------------------------|--------------|
| queue_key / lane key | *(Advanced only)* Synced queue |
| grain | Record type |
| lane | Queue (business) |
| Display label | Operators see |
| Default mission | Mission |
| Visible in rail | Visible in work unit |
| metadata | *(remove word)* |
| Assign in Layouts | Change (with layout name visible) |
| stage_operating_plan_v1 | Operating plan |
| status rollup | Status membership |

---

# Part 3 — Wireframe-quality mockups

## 3.1 Business Processes page

**Layout:** Settings shell (midnight sidebar, white canvas, pine hero) + process catalog cards + selected process stage navigator.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Settings › Business Processes                                           │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ HERO: Configure how work moves through your operation              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ Select a process                                                       │
│ ┌──────────────┐ ┌──────────────┐                                      │
│ │ ● Enrollment │ │   Admissions │   …                                  │
│ │ 7 stages     │ │              │                                      │
│ └──────────────┘ └──────────────┘                                      │
│ Enrollment · Family + Child tracks                                     │
│ [Lead] [Qualification] [Tour] [Decision] [Waitlist] [Enrolling] …      │
│ ┌──────────────────────────── stage workspace card grid ─────────────┐ │
│ │ (see 3.2)                                                           │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**High-fidelity mock:** [mockup-business-processes-page.png](./configuration-runtime-bp-ux-redesign/mockup-business-processes-page.png)

## 3.2 Stage workspace (card grid)

```
┌─ Lead stage ──────────────────────────────── Save stage · Preview WU ─┐
│ 2 statuses · 5 required fields · 1 perspective · Ready ✓               │
├────────────────────────────┬──────────────────────────────────────────┤
│ STATUS MEMBERSHIP      [▼] │ REQUIRED INFORMATION               [▼]   │
│ Families / leads · 2 stat  │ 5 fields · 2 required                    │
├────────────────────────────┴──────────────────────────────────────────┤
│ PERSPECTIVES — operational lenses in this work unit            [▼]   │
│ ┌─ Lens: New families today ────────────────────────────────────────┐ │
│ │ (see 3.3)                                                          │ │
│ └────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────┬──────────────────────────────────────────┤
│ PRESENTATION           [▼] │ OPERATING PLAN                   [▼]   │
│ Queue: Compact preview     │ 2 work items · 1 outcome                 │
│ Focus: Lead overview       │                                          │
├────────────────────────────┴──────────────────────────────────────────┤
│ READY CHECK — stage is ready to run                            [▼]   │
└────────────────────────────────────────────────────────────────────────┘
```

**High-fidelity mock:** [mockup-stage-workspace.png](./configuration-runtime-bp-ux-redesign/mockup-stage-workspace.png)

## 3.3 Perspective lens card (expanded)

```
┌─ Perspective ─────────────────────────────────────── Preview runtime → ┐
│ Operators see                                                          │
│ [ New families today________________________________________ ]           │
│ Mission                                                                │
│ [ Respond to new inquiries while intent is highest.____________ ]      │
│ Work included                                              + Add rule   │
│ ┌ Status      │ is        │ New inquiry, Open              │ ✕        │
│ ┌ Location    │ is any    │ All sites                      │ ✕        │
│ Sorted by                                                              │
│ [ Updated (newest first) ▼ ]                                           │
│ Presentation                                                           │
│  Queue          [▣▣▣ mini preview]  Enrollment · Compact    Change →   │
│  Focus Panel    [▣▣▣ mini preview]  Lead overview          Change →   │
│ ☑ Visible in work unit     Display order [ 1 ]                         │
│ Advanced ▸ Technical identity (synced queue: Lead families)            │
└────────────────────────────────────────────────────────────────────────┘
```

**High-fidelity mock:** [mockup-perspective-card.png](./configuration-runtime-bp-ux-redesign/mockup-perspective-card.png)

## 3.4 Presentation assignment card

```
┌─ Presentation ──────────────────────────────────────────────────────────┐
│ What operators see when working this stage                              │
├──────────────────────────────┬──────────────────────────────────────────┤
│ Queue                        │ Focus Panel                              │
│ ┌──── mini row preview ────┐ │ ┌──── mini drawer preview ────────────┐ │
│ │ Name · Status · Program  │ │ │ Header · Attention · Work cards   │ │
│ └──────────────────────────┘ │ └─────────────────────────────────────┘ │
│ Enrollment queue · Compact   │ Lead overview · Summary mode            │
│ [ Change ]                   │ [ Change ]                              │
└──────────────────────────────┴──────────────────────────────────────────┘
  Layout content is authored in Experience Builder → open gallery
```

**High-fidelity mock:** [mockup-presentation-assignment.png](./configuration-runtime-bp-ux-redesign/mockup-presentation-assignment.png)

## 3.5 Current state (for comparison)

| Current | Capture |
|---------|---------|
| Accordion form stack | [business-processes-stage-workspace.png](./configuration-runtime-phase-2b/business-processes-stage-workspace.png) |
| Perspectives metadata form | [perspectives-section-default.png](./configuration-runtime-phase-2b/perspectives-section-default.png) |
| Technical lane key visible | [perspective-card-edited-dirty.png](./configuration-runtime-phase-2b/perspective-card-edited-dirty.png) |

---

# Part 4 — Why each design decision improves operator understanding

| Decision | Operator / admin benefit |
|----------|--------------------------|
| **Card grid vs accordion forms** | Each card answers one business question; scanning matches runtime Work Unit muscle memory |
| **Business vocabulary** | Admins configure *work*, not database keys; reduces fear of “breaking sync” |
| **Perspective as operational lens** | Connects rail label, mission, filters, and presentation in one object — mirrors how staff experience the work unit |
| **Work included (business conditions)** | Explains *which records appear* in plain language; aligns with workflow condition mental model |
| **Sorted by presets** | Sorting is operational (“Tour time”, “Waitlist priority”), not `sort[0].field` |
| **Presentation previews** | Administrators **see** queue row density and drawer composition before publish |
| **Preview runtime** | Closes the loop between configuration and operation; validates lens without guessing |
| **Advanced disclosure** | Support and implementers retain access to sync identity without polluting primary UX |
| **Presentation card separate from Perspectives** | Doctrine clarity: BP assigns *which* layout; EB authors *how* it looks — but admins see both stories adjacently |
| **Context bar (Save + Preview WU)** | Stage workspace feels like a control panel, not a form footer |
| **Insight chips on collapsed cards** | Status at a glance without expanding every section |

---

# Part 5 — Alignment with platform systems

## 5.1 Universal Cards

| Universal Card doctrine | BP Settings application |
|-------------------------|-------------------------|
| Card answers one operational question | Each stage section becomes a Settings-tier card (Membership, Perspectives, Presentation…) |
| Header / body / footer anatomy | Perspective lens uses header (Operators see), body (Work included, Presentation), footer (Preview runtime) |
| Density tokens (compact / standard) | Lens list = compact cards; expanded editor = standard |
| Tiers (Attention → Work → Context) | Ready check ≈ Attention; Operating plan ≈ Work; Presentation ≈ Context |
| EB composes cards in runtime | BP configures *which lenses and assignments* exist; EB composes layout docs |

Settings cards are **configuration-tier** siblings of runtime cards — same visual language, different mutations (Save stage vs live record).

## 5.2 Focus Panel

| Focus Panel runtime | BP configuration UX |
|---------------------|---------------------|
| Fixed chrome + mode control (Summary / Work / Activity) | Presentation assignment shows **named layout + mini preview** per mode baseline |
| Mission line in header | Perspective **Mission** field feeds runtime mission projection |
| Card grid body (Concept B) | Preview thumbnail renders assigned drawer layout sample |

No Focus Panel Builder in BP — only **assignment + preview + Change in Layouts**.

## 5.3 Queue

| Queue runtime | BP configuration UX |
|---------------|---------------------|
| Preview/selection surface | Perspective **Work included** defines business scope of lens |
| Queue row layout from EB | Presentation row shows assigned queue layout + mini row preview |
| Perspective rail | **Operators see** + **Visible in work unit** + **Display order** |

Queue Builder remains forbidden — row shape authored in Experience Builder.

## 5.4 Experience Builder

| EB owns | BP UX relationship |
|---------|-------------------|
| Queue row presentation | BP assigns published layout to slot; preview read-only |
| Focus Panel body layouts | BP assigns published drawer doc to slot |
| Field placement on surfaces | Out of scope inside BP cards — link to Layouts |
| Universal Card composition in layouts | BP does not compose cards — assigns result |

## 5.5 Business Processes doctrine (ownership unchanged)

| BP continues to own | UX change only |
|---------------------|----------------|
| Stages, status membership | Card: Status membership (same data, new shell) |
| Required information | Card: Required information |
| Perspectives + missions + **business filters** (proposed `filters_v1`) | Card: Perspectives (operational lens) |
| Layout **assignments** | Card: Presentation (previews + Change) |
| Operating plan, attention, actions | Cards in row 3 |
| Work units (sync) | Advanced diagnostics + Preview WU |

**Proposed metadata extension (design only):** `perspectives_v1[].filters_v1` and `sort_v1` as business-condition arrays — still stage metadata, no new tables, validated against Fields catalog references.

---

# Part 6 — Visual artifacts

## 6.1 Mockups (target state)

| Artifact | File |
|----------|------|
| Business Processes page | [mockup-business-processes-page.png](./configuration-runtime-bp-ux-redesign/mockup-business-processes-page.png) |
| Stage workspace card grid | [mockup-stage-workspace.png](./configuration-runtime-bp-ux-redesign/mockup-stage-workspace.png) |
| Perspective operational lens | [mockup-perspective-card.png](./configuration-runtime-bp-ux-redesign/mockup-perspective-card.png) |
| Presentation assignment | [mockup-presentation-assignment.png](./configuration-runtime-bp-ux-redesign/mockup-presentation-assignment.png) |

## 6.2 Current state annotations

| Issue | Annotated reference |
|-------|---------------------|
| Long form stack; Membership dominates above fold | [business-processes-stage-workspace.png](./configuration-runtime-phase-2b/business-processes-stage-workspace.png) — Perspectives not visible without scroll |
| `Lane key` / `Grain` in primary card | [perspectives-section-default.png](./configuration-runtime-phase-2b/perspectives-section-default.png) |
| Duplicate title vs label field; link-only presentation | [perspective-card-edited-dirty.png](./configuration-runtime-phase-2b/perspective-card-edited-dirty.png) |
| Persistence works but UX still form-like | [perspective-card-saved-reloaded.png](./configuration-runtime-phase-2b/perspective-card-saved-reloaded.png) |

## 6.3 Visual language checklist (implementation gate)

When implementing, every BP Settings surface must satisfy:

- [ ] White/`alloy-stone` cards, `alloy-forge/12` borders, `alloy-pine` primary actions  
- [ ] No legacy blue admin panels inside stage workspace  
- [ ] Typography: 14/600 card titles, 11px helper, 10px uppercase field labels  
- [ ] Universal Card radius ~10px, flat elevation  
- [ ] Business headline first; fields support meaning  
- [ ] Advanced disclosure for identifiers  
- [ ] Preview affordances (layout thumb, Preview runtime) where assignments exist  

---

# Implementation phasing (after design approval)

**Do not start until this document is approved.**

| Phase | UX scope | Runtime scope |
|-------|----------|---------------|
| **UX-1** | Card grid shell for stage workspace; vocabulary pass; Advanced disclosure | None |
| **UX-2** | Presentation card with previews + `LifecycleStageLayoutAssignmentsCard` integration | None |
| **UX-3** | Perspective operational lens card (rename fields, hide keys) | Optional read-only preview navigation |
| **UX-4** | Work included business condition editor (`filters_v1` metadata) | Phase 2C merge behind flag |
| **UX-5** | Preview runtime deep link to WUC | Requires perspective merge + assignment resolution |

Phase 2B persistence may commit **only after** UX-1 vocabulary/disclosure fixes **or** explicit waiver documented here.

---

# Constraints confirmation

| Constraint | Status |
|------------|--------|
| Runtime primitives frozen | ✅ Design respects frozen runtime |
| No Queue Builder | ✅ Assign + preview + link only |
| No Focus Panel Builder | ✅ Same |
| Ownership boundaries unchanged | ✅ BP / EB / Fields / Statuses table preserved |
| No duplicate configuration systems | ✅ Extends existing metadata paths |
| No `/settings/perspectives` route | ✅ Lenses live in stage workspace card |

---

# Approval checklist

Product / design sign-off required before implementation:

- [ ] Card grid IA for stage workspace  
- [ ] Perspective operational lens field model (+ proposed `filters_v1`)  
- [ ] Presentation preview pattern (thumbnail scope)  
- [ ] Preview runtime navigation contract  
- [ ] Advanced disclosure policy (what remains hidden)  
- [ ] Phase 2B commit waiver or UX-1 first  

---

## Related

- [Phase 2B visual gate](./configuration_runtime_phase_2b_design_review.md)  
- [Configuration Runtime design alignment](../../system/configuration-runtime-design-alignment.md)  
- [Universal Card System](../platform/operator/universal-card-system.md)  
- [Alloy Visual Language](../platform/operator/alloy-visual-language.md)  
- [Configuration ownership doctrine](../../system/configuration-ownership-doctrine.md)
