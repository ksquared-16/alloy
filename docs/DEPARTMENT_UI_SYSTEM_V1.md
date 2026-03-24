# Department Workspace UI — System Specification (v1)

Internal product + design + system reference. Describes the **Department** surface as implemented for AdminV2 / UI V2 workspaces. Use this to extend **Org → Work Unit → Record** views without drifting layout, meaning, or visual grammar.

**Shared column contract (all levels):** see [Workspace system — v1](./WORKSPACE_SYSTEM_V1.md) (left = context/state, right = actions; Record is the reference for rail without generic context).

---

## 1. Overview

### What this UI represents

The **Department workspace** is the **operating console for a department**: a single screen that answers *where attention should go*, *what the system is doing*, and *what a human can execute next*—without dumping full work-object detail.

### Purpose

- **Orient** the operator (today’s focus, live model scope, signals).
- **Measure** health at a glance (business + AI KPI rails).
- **Surface work** at the right altitude (**rollups**, not exhaustive lists).
- **Separate execution** from narrative (dedicated **command center**).
- **Show automation** as a first-class system (workflows strip).

### Hierarchy placement

| Level        | Role (conceptual)                         | Department workspace |
| ------------ | ----------------------------------------- | ---------------------- |
| **Org**      | Portfolio / multi-department summary    | Parent context         |
| **Department** | **This UI** — operational control      | **Current surface**    |
| **Work Unit**  | Single object / case / job in depth     | **Drill target** from rollups & signals |
| **Record**     | Canonical entity / document view      | Adjacent / linked surface |

Department is the **middle layer**: dense enough to run the day, abstract enough to stay scannable.

---

## 2. Core design principles

- **AI-first, not AI-added**  
  AI is woven into focus copy, awareness line, signal prioritization hints, AI KPI lane, AI actions, and workflow observation—not bolted on as a generic assistant panel.

- **Rollups before details**  
  Lanes show **categories and counts** (plus short descriptors). **Lists of individual work objects** belong in **Work Unit** context after drill, not in the department canvas.

- **Action-oriented surfaces**  
  Signals expose **immediate actions**; the command rail groups **system**, **quick**, and **AI** actions with **executable** labels (verbs, short command-like phrases).

- **Density over empty space**  
  Prefer **tight rhythm**, **inline measurement**, and **single system bars** over large empty cards or decorative whitespace.

- **System visibility**  
  Operator should see: **what the model is watching** (awareness), **what’s on fire** (signals), **how automation is running** (workflows + observation), and **how the business reads** (KPI strip).

- **Clear separation of concerns**  
  - **Context** — narrative focus + signals + KPIs (left primary column, top).  
  - **Work** — throughput + attention rollups (primary column, middle).  
  - **Execution** — command rail (**actions only**); cross-cutting relationship panels for department are **deferred** (see [Workspace system v1](./WORKSPACE_SYSTEM_V1.md)).  
  - **Execution visibility** — workflows (primary column, bottom).

---

## 3. Page structure (top to bottom)

Fixed **~75% primary column / ~25% command column** split. **Do not treat this document as a layout spec for other levels** without adaptation—use the **roles** of each band consistently.

### A. Top deck (control deck)

Single light **panel** unifying narrative + signals + (visually adjacent) measurement entry.

1. **“Today’s focus”**  
   Small **uppercase label** (muted). Frames the headline as **AI-directed operational focus**, not a generic page title.

2. **Headline**  
   One **strong line** (e.g. density, risk, pressure). **No** long descriptive paragraph under it—detail lives in **briefing** (tooltip/long copy) when provided, not inline clutter.

3. **AI awareness line**  
   One **quiet, single line** (e.g. live model scope, intervention count). Reinforces **system + AI** without a new section or chat UI.

4. **Signals**  
   - **What they are:** Prioritized, actionable **exceptions and opportunities** (warning / critical / info).  
   - **Behavior:** Compact **cards** in a **fixed grid**; each signal has **at least one action**; optional **short AI rationale** line per signal.  
   - **Role:** Bridge from **state** (focus + awareness) to **immediate intervention**.

### B. KPI measurement strip

- **Business rail** vs **AI rail** (dual lane in one strip): **business** = pine/operational readout; **AI** = model-derived metrics (brand-tinted values where specified).  
- **Inline strip, not cards:** Reads as **instrumentation**, not a dashboard widget wall.  
- **Hierarchy:** Labels small/uppercase; values **tabular and dominant** within the strip.

### C. Work object rollups

Two **sibling lanes** (when secondary queue exists):

| Lane | Meaning | Accent |
| ---- | ------- | ------ |
| **Throughput** | Forward **operational flow** (dispatch, pipeline, coverage, etc.) | **Pine** (green family) |
| **Attention & exceptions** | **Review, billing, compliance, customer**—human judgment | **Amber** (exception family) |

- **Rollup model:** **Grouped counts + short descriptors**; optional **examples** as context only—not row-level work UI.  
- **Whole-card drill:** Clicking the rollup **opens the work-unit list / queue** for that lane (implementation: single drill target per lane).  
- **Connection to Work Unit:** Department answers **“what buckets exist and how big?”**; Work Unit answers **“what are the actual items?”**

### D. Command center (right rail)

Structured **stack** of **light panels** (same surface language: white/light fill, border, radius, padding rhythm):

1. **System status** (optional) — short **monospace-style** lines (automation, queue load)—**not** a narrative feed.  
2. **System operations** — create, ingest, execute reports/workflows, etc.  
3. **Quick operations** — high-frequency human shortcuts.  
4. **AI actions** — **short, command-like** suggestions (e.g. *Execute rebalance → east cluster*).  
5. **Context & support** — relationship / reference groups (contacts, roster, etc.) in **one** panel with the same chrome as above.

**Role of the rail:** **Execution and support** without stealing the canvas from **state + work**. Left = **what’s true**; right = **what to do**; AI suggestions **bridge** the two.

### E. Workflows section

- **Purpose:** **Live automation health**—runs, success, failures—so the operator trusts (or debugs) the **system loop**.  
- **Header bar (single row):**  
  - **Left:** `AUTOMATION & WORKFLOWS`  
  - **Center:** **Live scope** (e.g. *12 live · dispatch + billing*) — secondary, muted metadata, **centered** in the bar  
  - **Right:** **Inline metrics** (avg run, success, runs today, failures) with **color logic** (e.g. brand for success signal, amber for failures, pine for neutral ops).  
- **Table:** Workflow name, status, last run, outcome indicator—**structure preserved**; row spacing **tight but readable**.  
- **Observation line:** One **AI / ops note** tied to the run set (e.g. edge case, pause reason)—**part of the loop**, not generic marketing copy.

---

## 4. Interaction model

| User action | Intent (product) |
| ----------- | ----------------- |
| **Signal action** | Fires **`signal.action`** with `signalId` + `actionId`—router resolves (open queue, assign, rebalance, etc.). |
| **Rollup card (throughput / attention)** | Drills to **work-object list** for that queue (**`queue.item.action`** / view-all pattern)—**Department → Work Unit list**. |
| **Command center button** | Fires **`actions.block`** with `actionId`—system, quick, or AI suggestion. |
| **Context row actions** | Context-scoped actions (e.g. call, open related)—**`context.group.action`**. |
| **Briefing control** | Surfaces **long-form briefing** (paragraphs) without expanding the deck. |

**Drill-down story:** Department **orients and aggregates**; **Work Unit** (and below) **resolves individual objects**. Keep that contract when adding Org or Record surfaces.

---

## 5. AI-native layer

### Where AI appears

- **Today’s focus** label + headline tone (system-authored summary).  
- **AI awareness line** (explicit model scope / interventions).  
- **Signals** — prioritization copy (`aiExplanation`) where present.  
- **KPI strip** — **AI rail** for model-derived metrics.  
- **AI actions** — executable, system-aware phrasing.  
- **Workflow observation** — post-run / loop insight.

### What we avoided

- **No** embedded **chat** as the primary metaphor.  
- **No** heavy “AI panel” competing with real work.  
- **No** duplicate **AI narrative** in the command rail.

### Operator experience

The user is a **system operator**: they need **confidence** (what the model sees), **leverage** (one-click / short commands), and **accountability** (workflows + status)—not a conversation thread.

---

## 6. Visual system

### Panels vs ambient

- **Page / workspace** may carry **ambient** treatment (pattern, wash) on the shell.  
- **Department panels** (control deck, rollup lane chrome, workflows, command cards) use **solid light / white** surfaces, **hairline borders**, **soft elevation**—they read as **instruments** on top of the field.

### Accents

- **Pine** — throughput, business KPI emphasis, operational text.  
- **Amber** — attention / exceptions lane and failure-adjacent UI.  
- **Blue (brand)** — AI lane, AI actions, success-highlighted workflow metric where used, signal info severity.

### Typography (conceptual)

- **Headline:** Largest weight in the deck; single dominant line.  
- **Section labels:** Small caps / wide tracking (kickers).  
- **Metrics:** Tabular numbers; values heavier than labels.  
- **Signals / command:** Small but **legible**; density is **intentional**, not arbitrary shrink.

### Spacing

- **Tight vertical stacks** with **clear** separation between **deck → operational row → workflows** (subtle separators acceptable).  
- **Consistent gutters** between primary and command column.

---

## 7. What we removed (important)

- **Detailed work-object lists** in the department canvas (replaced by **rollups** + drill).  
- **Redundant subline / essay** under the headline (briefing is optional elsewhere).  
- **Duplicate signal feeds** in the command center.  
- **Card soup** / redundant widgets in the KPI area (single **measurement strip**).  
- **Heavy AI chat UI** as a default pattern.

---

## 8. Known tradeoffs / open questions

| Area | Tradeoff / question |
| ---- | ------------------- |
| **Density** | May feel **tight** on small laptops or for users who prefer whitespace-first dashboards. |
| **AI depth** | Awareness + suggestions are **light by design**; deeper reasoning could move to **inspector**, **drawer**, or **optional expand**—without defaulting to chat. |
| **Mobile / narrow** | **75/25** and **three-up signals** **degrade** (stack, scroll); org-level may need **simplified** or **progressive disclosure** layouts. |
| **Context panel** | Duplicate **title + “Context & support”** kickers possible when `title` is set—content model cleanup TBD. |
| **Optional work title** | Department workflows **omit** optional `work.title` row for density; reintroduce only if product requires it. |
| **Rollup copy** | “AI-ranked throughput” / “AI-prioritized exceptions” are **semantic labels**—swap if taxonomy should stay neutral. |

---

## Document control

- **Version:** v1  
- **Scope:** Department workspace (UI V2 / AdminV2) as built in this iteration.  
- **Not:** API contracts, adapter logic, or component-level implementation docs—those live in code and separate engineering references.

When extending to **Org**, **Work Unit**, or **Record**, **reuse principles and visual grammar**; **recompose sections** to match each level’s job (breadth vs depth vs entity).
