# Alloy OS — Workspace V3 — Operational Command Center

**Revision:** 2.1  
**Status:** Canonical platform doctrine (June 2026)  
**Authority:** Landing surface law for `/workspace` — how operators enter operational execution.

**Evolution constraint (Sprint 3):** Refine today's shipped Workspace — **do not replace** shell, sidebar, command rail, banner chrome, or tile shells.

**Continuity objective (Sprint 4):** Workspace Operational Surface = **cover page** of Work Unit `adminv2-os-context` stack — same typography, KPI strip, and progressive reveal. See [`sprint-4-ux-continuity.md`](../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-4-ux-continuity.md).

**Related:** [`navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) · [`workspace-v3-operational-surface-doctrine.md`](./workspace-v3-operational-surface-doctrine.md) · [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5) · [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md)

**Sprint packs:** [Sprint 1](../../sprints/archive/06_2026/workspace-v3-operational-command-center/README.md) · [Sprint 2](../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-2-evolution.md) · [Sprint 3 — Evolution Reset](../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-3-evolution-reset.md) · [Sprint 4 — UX Continuity](../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-4-ux-continuity.md)

---

## 1. Platform law

**Alloy is not a dashboard. Alloy is an operating system.**

**Evolution law (Sprint 3):** We are no longer inventing Alloy — we are refining it. The Workspace landing must remain **instantly recognizable** as today's Alloy product: same `AdminV2Shell`, sidebar, header, command rail, `WS_COMMAND_BANNER_CLASS`, and `processNavTile` shells. Changes apply to **content, hierarchy, storytelling, and entry points** inside existing chrome — not replacement UI.

The Workspace (`/workspace`) is **not where operators work**. It is where operators **decide which work to enter next**.

| Surface | Question answered | Operator posture |
|---------|-------------------|------------------|
| **Workspace** | Where should I go? | Orient · prioritize · launch |
| **Work Unit** | What should I do? | Execute · resolve · complete |
| **Analytics** | What happened? Why? What trends exist? | Analyze · report · forecast |

**Law:** Workspace remains **operational**. Analytics remains **analytical**. These concerns are **completely separated**.

**Law:** Workspace must **never duplicate** Work Unit functionality. No queues, no Focus Panel, no record drawers, no BOS execution on the landing page. Workspace **composes and elevates** established runtime systems.

**Law (Sprint 2 — enterability):** If an operator can see an operational number on Workspace, they should **usually be able to enter that work directly** via a predefined Work View deep link.

---

## 2. Progressive operational depth

Alloy is organized around **progressively deeper operational context** — not disconnected pages.

```
Organization
  ↓
Workspace
  ↓
Operational Surface          ← Zone 3 launcher (miniature domain)
  ↓
Work Unit
  ↓
Queue (condensed)
  ↓
Focus Panel
  ↓
Embedded Workspace
  ↓
BOS
```

Every transition should feel like **zooming further into operations** — never like opening an unrelated module.

**Navigation implications:** Shared shell and command rail persist. Content column deepens. Motion explains continuity (depth-in, not page-swap). Spacing compresses at higher levels (Pulse) and expands at launch level (Surfaces).

Cross-reference: [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md) — Work Unit entry lands in Operational Mode immediately.

---

## 3. Four zones — one question each

Each zone answers **exactly one question**. If two zones answer the same question, the design must be reconsidered.

| Zone | Name | Question |
|------|------|----------|
| **1** | Organization Pulse | *How is the organization?* |
| **2** | Operational Pulse | *What requires attention?* |
| **3** | Operational Surfaces | *Where should I go?* |
| **4** | Operational Activity | *What just happened?* |

### Zone 1 — Organization Pulse

| Attribute | Value |
|-----------|-------|
| **Height** | Minimal — one compact band |
| **Purpose** | Organization heartbeat |
| **Tone** | Very calm; not analytics |
| **Examples** | Org name · Operational Health · Enrollment Health · Business Health · Critical System Alerts |

Communicates **health status** (healthy · needs attention · critical · no data) — not trends or forecasts.

### Zone 2 — Operational Pulse

| Attribute | Value |
|-----------|-------|
| **Height** | Compact — one or two scannable rows |
| **Purpose** | Cross-process attention signals |
| **Tone** | Indicators, not charts |
| **Examples** | Needs Attention · Overdue Work · Children Starting Soon · Outstanding Payments · Licensing Deadlines |

**Law:** Pulse indicators are **operational**, not analytical. Each indicator is **enterable** when a Work View mapping exists.

### Zone 3 — Operational Surfaces (dominant)

| Attribute | Value |
|-----------|-------|
| **Height** | Primary viewport share |
| **Purpose** | Launch environments into operational execution |
| **Tone** | Miniature Work Units — alive, story-driven |
| **Examples** | Enrollment · Billing · Scheduling · Attendance · Staffing · Compliance · Health · Planning |

Zone 3 **is** the Workspace. Operational Surfaces are **not dashboard cards** — see [`workspace-v3-operational-surface-doctrine.md`](./workspace-v3-operational-surface-doctrine.md).

### Zone 4 — Operational Activity

| Attribute | Value |
|-----------|-------|
| **Height** | Lowest priority — collapsible / below fold |
| **Purpose** | Historical context |
| **Tone** | Quiet, chronological |
| **Examples** | Workflow completions · Org events · Notifications · BOS insights · Automation activity |

**Law:** Zone 4 never competes with Zone 3.

---

## 4. Operational Surfaces (Zone 3)

> **Full specification:** [`workspace-v3-operational-surface-doctrine.md`](./workspace-v3-operational-surface-doctrine.md)

Operational Surfaces replace the Sprint 1 "Business Process card" mental model. They are **miniature representations of complete operational domains**.

### Operational storytelling

Numbers support the story. The story is primary.

```
Enrollment                                    Healthy
3 families are waiting for contact.

Today's work
• 2 Tours              ← enterable
• 1 Enrollment         ← enterable
• 3 Follow Ups         ← enterable

Open Enrollment →
```

### Three navigation levels

| Level | Affordance | Destination |
|-------|------------|-------------|
| **1** | `Open {Process} →` | Default Work Unit — Operational Mode |
| **2** | Clickable work line / pulse indicator | Work Unit + predefined Work View |
| **3** (future) | BOS narrative insight | Filtered queue + Focus Panel context |

**Law:** Work Views are **existing Configuration Runtime artifacts** — Operational Surfaces expose them; they do not invent queue functionality.

### Deep-link routing (Level 2)

```
/workspace/work-unit/{slug}?work_view={workViewId}
```

Compat: `?queue={key}`, `?attention_bucket={key}`. Server builds authoritative `href` per work line.

---

## 5. Role-aware Workspace (future architecture)

Not required for implementation now. Architecture must support:

- Different surface sets per role (Executive · Center Director · Finance · …)  
- Configurable surface ordering  
- Process visibility per org/role  
- Fallback to all entitled surfaces when unconfigured  

See Sprint 2 §4 — [`sprint-2-evolution.md`](../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-2-evolution.md).

---

## 6. Relationship to established runtime (frozen)

| System | Status | Workspace relationship |
|--------|--------|------------------------|
| Work Units | ✅ Frozen | Entry target |
| Universal Queue | ✅ Frozen | Reached via Work View deep link |
| Focus Panel | ✅ Frozen | Opens on WU entry |
| Universal Cards | ✅ Frozen | Grammar inherited — not rendered on Workspace |
| System 5 / 5A / 5B / 5C | ✅ Frozen | Visual law |
| BOS | ✅ Frozen | Level 3 insights (future); command rail unchanged |
| Operational Mode | ✅ Frozen | Default after any entry level |
| Work Views | ✅ Frozen definition | Exposure layer for deep links |

---

## 7. Relationship to Analytics

| Concern | Workspace | Analytics |
|---------|-----------|-----------|
| Question | Where should I go? | What happened? Why? |
| Time | Now · next · action | Historical · trends · forecasts |
| Entry | `/workspace` | Dedicated analytics workspace |

**Law:** No analytics charts or trend widgets on Workspace.

---

## 8. Visual direction

System 5 language upward: white canvas · quiet borders · domain rails · juniper/amber/ember accents · compact pulse · expansive surfaces.

**Exploration variants** (Sprint 2 mockups): Mission Control (large surfaces) · Card-first dense · Role-specific · Mobile/tablet.

---

## 9. Data and truth boundaries

| Data | Source | Rule |
|------|--------|------|
| Surface catalog | `loadOperatorLifecycleLandingCards` | Same as sidebar |
| Story + work lines | OIP narrative + Work View count API | Preview only |
| Work line hrefs | Server-built from Work View config | Authoritative routing |
| Health | OIP metric packs | Status chips |
| Pulse | OIP placements | Enterable when mapped |

**Law:** Queue rows never render on Workspace.

---

## 10. Performance contract

Subject to [`adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md):

- Coordinated above-fold reveal  
- Deep-link prewarm on hover — never blocks landing reveal  
- `null` ≠ zero  

---

## 11. Configuration (design for — not implement)

| Configurable (future) | Platform-owned |
|-----------------------|----------------|
| Surface order · visibility | Four-zone layout |
| Work View → work line bindings | Surface anatomy |
| Role layouts | Zone questions |
| Story templates · OIP placements | Enterability law |
| Pulse → deep link mappings | Routing contract |

Experience Builder does **not** author Workspace layout.

---

## 12. Success criteria

- [ ] Workspace does not feel like a dashboard  
- [ ] Operators immediately know where to go  
- [ ] Every Operational Surface feels alive (story-driven)  
- [ ] Important operational numbers are enterable  
- [ ] Workspace → Work Unit feels like zooming into the same OS  
- [ ] Architecture supports future role-based layouts without rework  
- [ ] Configuration can attach later without structural changes  

---

## 13. Revision history

| Rev | Date | Changes |
|-----|------|---------|
| 1 | Jun 2026 | Initial four-zone command center; Business Process cards |
| 2 | Jun 2026 | Operational Surfaces · storytelling · enterability · Work View deep links |
| 2.1 | Jun 2026 | Evolution constraint — refine existing Workspace chrome; Sprint 3 reset |

**Supersedes:** Sprint 1 "Business Process card" terminology — use **Operational Surface**. Sprint 2 greenfield mockups superseded by Sprint 3 evolution mockups anchored to baseline screenshot.
