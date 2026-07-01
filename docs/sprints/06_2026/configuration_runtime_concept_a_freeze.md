# Alloy OS — Configuration Runtime Concept A (Freeze)

**Status:** **Frozen** — canonical UX reference (June 2026)  
**Implementation:** Faithful to approved mockups; architecture and ownership unchanged  
**Supersedes:** [Business Processes UX redesign draft](./configuration_runtime_business_processes_ux_redesign.md) (exploratory — Concept A is authoritative)

---

## Status

This document **freezes** Configuration Runtime UX.

The approved mockups are the **canonical implementation targets**. The goal is to **faithfully implement** them while preserving existing architecture and ownership doctrine.

**If implementation pressure conflicts with these mockups, implementation changes — not the design.**

---

## Architecture remains frozen

Ownership does **not** change.

| Owner | Owns |
|-------|------|
| **Business Processes** | Lifecycle, stages, perspectives, required information, work included, missions, process actions, workflow entry points |
| **Experience Builder** | Queue presentation, Focus Panel presentation, Universal Cards, layouts |
| **Fields** | Field catalog, formatting, validation, persistence |
| **Statuses** | Lifecycle vocabulary, colors, transitions |

No ownership boundaries change.

---

## Frozen mockups (canonical targets)

| Mockup | File |
|--------|------|
| Business Processes hub | [mockup-business-processes-page.png](./configuration-runtime-bp-ux-redesign/mockup-business-processes-page.png) |
| Stage workspace | [mockup-stage-workspace.png](./configuration-runtime-bp-ux-redesign/mockup-stage-workspace.png) |
| Perspective configuration | [mockup-perspective-card.png](./configuration-runtime-bp-ux-redesign/mockup-perspective-card.png) |
| Presentation configuration | [mockup-presentation-assignment.png](./configuration-runtime-bp-ux-redesign/mockup-presentation-assignment.png) |

Reference these in every Configuration Runtime implementation PR.

**Current-state baseline (pre–Concept A):** [configuration-runtime-phase-2b/](./configuration-runtime-phase-2b/)

---

## Configuration Runtime doctrine

The runtime and configuration runtime share the same operating model.

```
Operator Runtime          Configuration Runtime
─────────────────         ─────────────────────
Navigation                Navigation
    ↓                         ↓
Context                   Configuration Context
    ↓                         ↓
Operational Surface       Configuration Surface
    ↓                         ↓
BOS                       BOS
```

Configuration is **another Alloy workspace** — not a separate application.

---

## Design principles

### 1. Business concepts, not implementation

| Good | Bad |
|------|-----|
| Who belongs here | `queue_key` |
| Mission | `lane_key` |
| Work included | metadata |
| Presentation | IDs |
| Preview runtime | JSON |

Implementation details belong only in **Advanced → Technical identity**.

### 2. One operational story per card

Use **Universal Cards** (Settings tier). Each card answers one question:

| Card | Question |
|------|----------|
| Status membership | Who belongs here? |
| Required information | What must be completed? |
| Perspectives | How operators view this work |
| Presentation | What operators see |
| Actions | What operators can do |
| Automation | What the platform does automatically |
| Ready check | Is this stage complete? |

### 3. Presentation is visual

Every presentation assignment includes: queue preview, Focus Panel preview, current layout name, **Change**, **Open in Layouts**.

### 4. Perspectives are operational lenses

Operators see · Mission · Work included · Sort · Presentation · Visibility · **Preview runtime**

### 5. Work included uses business language

Workflow-condition style — never SQL builders or JSON editors.

### 6. Preview runtime is first-class

Every configurable object should eventually support **Preview runtime** (opens real runtime with current configuration).

### 7. BOS remains visible

Configuration is operational work. BOS stays in the persistent right rail (analyze process, find gaps, recommend improvements).

---

## Navigation doctrine

**Avoid navigation inside navigation.**

```
Target path:
Application → Settings Workspace → Process selector (cards) → Stage selector (pills)
```

Process cards and stage pills **are** navigation. Do not add another permanent left panel inside Business Processes.

---

## Implementation rules

**Do not:** Queue Builder · Focus Panel Builder · expose `queue_key`/IDs/metadata in primary UI · duplicate editors · move ownership

**Do:** Business language · previews · Universal Cards · cross-link · hide technical identity · preserve BOS rail

---

## Implementation phases

| Phase | Scope |
|-------|--------|
| **UX-1** | Shell and navigation — stage as primary context |
| **UX-2** | Stage sections → Universal Cards — same functionality, new hierarchy |
| **UX-3** | Operational lens editor — Work included, presentation previews, Preview runtime, Advanced |
| **UX-4** | Presentation card — live previews, Change, Open in Layouts |
| **UX-5** | BOS configuration recommendations |

---

## Validation (every PR)

1. Updated screenshots  
2. Design comparison vs frozen mockups  
3. **Deviation log** — if a screen differs, explain why; otherwise match approved designs  

---

## Canonical scope

This freeze applies to all future Configuration Runtime workspaces:

- Business Processes  
- Layouts  
- Fields  
- Statuses  
- Analytics  
- Actions  

Future work **extends** Concept A — it does not redesign it.

---

## Related

- [Configuration Runtime design alignment](../../system/configuration-runtime-design-alignment.md)
- [Universal Card System](../platform/operator/universal-card-system.md)
- [Alloy Visual Language](../platform/operator/alloy-visual-language.md)
- [Configuration ownership doctrine](../../system/configuration-ownership-doctrine.md)
