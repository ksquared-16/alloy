---
owner: platform
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Configuration Ownership & Inheritance — Core Platform Doctrine

**Status:** Ratified core platform doctrine — Organization Configuration Runtime V1
**Date:** 2026-06-30
**Sits beside:** Business Process · Operational Truth · Entity Model · Record System · [Commercial Operating Model](commercial-operating-model.md)
**Extends (does not replace):** `docs/system/configuration-ownership-doctrine.md` (surface-ownership matrix) and `docs/system/configuration-runtime-v1.md` (the frozen settings shell). This doctrine adds the **inheritance + override** dimension those lack, and the **four-owner** model.
**Mandate:** Define how every configurable object in Alloy is *owned*, *inherited*, and *overridden* — one pattern for Financials, Communications, Branding, Scheduling, Workflows, Policies, Access, and every future module. Runtime contract: `../../system/organization-configuration-runtime-v1.md`.

> **The discovery:** the Commercial Configuration mockup didn't expose a Financials problem. It exposed that Alloy has no canonical answer to **"who owns configuration, and how does it inherit?"** Pricing is just the first object to need it. Get this right and you've solved it for every configurable object.

## Ratification and owner-model reconciliation

The frozen surface-ownership matrix and this four-owner model are complementary:

- the **surface matrix** names the one operator home allowed to author each concern;
- the **four-owner model** separates business meaning, operational delivery, configuration authoring, and runtime consumption.

“Configuration owner” is the bridge: it must equal the authoring home in the frozen surface matrix. The other three owners are responsibility lenses, not additional edit surfaces. Therefore the four-owner model does not permit duplicate authoring or weaken the one-system-of-record rule.

Organization Runtime V1 implements the shared declaration, platform → organization → location value resolution, provider-gated distribution plan, and cross-location posture. Individual domains still own their payloads and must register authoritative read/apply behavior before the organization surface claims a resolved or applied state.

---

## 0. Three questions this doctrine answers

1. **Who owns a configured object?** → §2 (four owners) + §3 (system-of-record rule).
2. **How does a value inherit and resolve?** → §4 (inheritance) — and it largely *already exists* in the schema.
3. **How does an operator override it?** → §5 (the Override Pattern / Inheritance Control — the net-new platform primitive).

What's already real (built into the schema today, per audit):
- A **scope ladder** `org → site → program → room` (`scope_type` + `scope_shape` CHECK on `childcare_rate_plans`, `childcare_capacity_rules`; shared `validate_childcare_config_scope()`), resolved **most-specific-wins**.
- A **platform→org** override axis (`org_id IS NULL` = global default; an org row overrides it — `consumption_event_types`).
- Consistent **effective dating** (`effective_start`/`effective_end`, supersede-never-overwrite).
- **No reusable override/inheritance UI** — that is the gap this doctrine fills.

---

## 1. Two kinds of inheritance (the distinction everything rests on)

A configurable object inherits in one of two ways. Conflating them is the root confusion.

| | **Value inheritance** | **Availability (assignment)** |
|---|---|---|
| Question | *What is the value here?* | *Does this exist here?* |
| Mechanism | Set high, **override** lower (most-specific-wins) | Defined once, **offered/withdrawn** per scope |
| Examples | Tuition price, late-fee amount, brand color, open hours, SLA threshold | A **Program** offered at a site, a **Workflow** enabled at a site, a **Comm template** active at a site, a **Service** offered |
| Schema today | `scope_type` rows (rate plans, capacity rules) | `location_program_categories` per site; `is_active` flags |

**One control handles both** (§5): "*Applies to* [scopes]" expresses availability; "*Override here*" expresses value. The operator never learns the distinction — they just see "where does this apply, and what's different where."

---

## 2. The four owners

Every configurable object has four owners. They are usually **different**, and collapsing them is what produced "Services" trying to be pricing, capacity, and catalog at once.

| Owner | Question | Example: **Tuition** | Example: **A Program** |
|---|---|---|---|
| **Commercial owner** | What gives it business meaning / what does it attach to commercially? | The **Program** (it's *that program's* tuition) | n/a (a program *is* the commercial unit) |
| **Operational owner** | Where is it delivered / executed? | n/a (price isn't delivered) | The **Site / Room** (where children attend) |
| **Configuration owner** | Where is it authored, and along what scope does it inherit? | **Commercial Config**, scope `org→site→program→room` | **Programs catalog** (today: Locations), scope `org→site` |
| **Runtime owner** | What consumes it to produce behavior? | The **Consumption Resolver / billing** | **Enrollment, scheduling, attendance** |

**Why four, not one:** the operator authors tuition in *Commercial Config* (configuration owner), but it belongs to a *Program* (commercial owner), is delivered at a *Room* (operational owner), and is consumed by the *resolver* (runtime owner). Each owner answers a different design question; a page must know which it is for every object it shows.

---

## 3. System of record vs. reference (the ownership rule)

> **Every configurable object has exactly one home — its system of record. Every other surface references it read-only, with a deep link. No surface recreates an object it does not own.**

This is the rule the mockup violated by implying Financial Configuration would recreate Programs. It must **consume** them.

- **Commercial Configuration** *owns*: Tuition, Funding, Fees & Add-Ons, Financial Policies, Accounting mapping. *References*: Programs, Rooms, Locations.
- **Locations / Operations** *owns*: Sites, Rooms, (today) Program categories, Schedule templates, Capacity rules. *References*: the tuition/programs summary (read-only).
- **Communications** *owns*: channels, templates, send rules. **Branding** *owns*: tokens/assets. **Automation** *owns*: Workflows, Actions. **Admin** *owns*: Users, Roles, Access.

**Reference contract:** a referencing surface shows the object's identity + a *"managed in <home> ↗"* deep link, never an editor. A program's page shows its tuition (read-only, "managed in Commercial Config"); the tuition grid shows its program (read-only, "managed in Programs").

### The one ownership shift this doctrine implies
Programs are **site-scoped** today (`location_program_categories`, `UNIQUE(org_id, location_id, key)`). The ownership model wants **Program identity to be org-level** (one "Toddler" catalog entry) that is **offered at** sites (availability) and whose tuition is authored in Commercial Config (value). Target: a `programs` catalog at org scope + per-site availability; current per-site categories become the availability layer. *(Design note, not a migration here.)*

---

## 4. Inheritance doctrine

### 4a. The scope ladder (canonical)
Two **independent axes**, plus time:

```
AXIS 1 — Provenance:   Platform default  →  Organization
AXIS 2 — Scope:        Org  →  Site  →  Program  →  Room
AXIS 3 — Time:         effective_start … effective_end  (orthogonal to both)
                       └─ leaf: the Subject (an Enrollment) may carry an instance override (a negotiated price)
```

- **Axis 1** is "Alloy's default vs this tenant's" (`org_id IS NULL` → org row). Already real for `consumption_event_types`; generalize to status/action/template defaults.
- **Axis 2** is the within-tenant cascade. Already real for rate plans + capacity rules (`org→site→program→room`). The **canonical ladder.** No region/brand level today (flat org→site); the model leaves room for one (`org → region → site → …`) without reshaping the rule.
- **Axis 3** is supersede-by-effective-date (already consistent across config tables).
- `department` / `work_unit` are **orthogonal access/metrics axes**, *not* the config-value ladder — keep them out of value resolution.

### 4b. Resolution rule
> For a given **subject** at a given **time**, resolve the **nearest scope** (room → program → site → org) that has an **applicable, effective** value; if none, fall back to the **org**, then the **platform default**.

This is exactly the most-specific-wins behavior the schema already encodes — this doctrine names it and makes it universal.

#### 4b-i. Regulatory constraints are binding across scopes (additive reconciliation)
Most-specific-wins governs **operator-chosen values**. It does **not** apply to **regulatory constraints** (values sourced from licensing, e.g. `capacity_kind = 'licensed'` / `source_key = 'licensing'`). A regulatory constraint is a **binding limit that lower scopes may only *tighten*, never *weaken*.** A more-specific rule with a *weaker* value does **not** override (erase) a broader regulatory constraint — the effective regulatory limit is the **most restrictive applicable** value in scope (for a capacity ceiling, the minimum; for a required-staff floor, the maximum). Ordinary most-specific-wins inheritance therefore never lifts a binding regulatory constraint.
*Enforced (Location Operational Phase A):* resolution-time clamp in `web/lib/childcareOperational/config/regulatoryCeiling.ts` (`resolveLicensedCeiling`) + author-time guard in `configRuleAuthoringService` (`validateLicensedOverrideNotWeaker`), which rejects an override that would weaken a binding licensing limit.

### 4c. What inherits along which axis (challenged per object)
| Object | Inherits? | Axis | Kind |
|---|---|---|---|
| **Pricing / Tuition** | Yes | org→site→(program)→room | value |
| **Financial Policies** | Yes | org→site→program→room | value |
| **Programs** | Yes | org→site | **availability** (offered at site) |
| **Funding sources** | Yes | org→site | value (rates) + availability |
| **Communications templates** | Yes | platform→org→site | value + availability |
| **Branding** | Yes | org→site | value |
| **Workflows / Actions** | Yes | platform→org→site | availability (+ param value) |
| **Scheduling (hours)** | Yes | org→site→room | value |
| **Attendance rules** | Yes | org→site→program→room | value |
| **Access / Roles** | Partly | org (defined) + site/dept (assignment) | availability (orthogonal axis) |
| **Fields / Layouts / Statuses** | Org today | platform→org | value (could extend) |
| **Rooms / Locations** | n/a (they *are* the scope) | — | — |

---

## 5. The Override Pattern — the canonical platform primitive

The audit found **no reusable override UI** — only ad-hoc copy ("merged with platform defaults"). This doctrine defines **one component, the Inheritance Control**, that every configurable value renders through.

### 5a. Anatomy
Every configurable value, everywhere in Alloy, shows:
1. **The value** (editable when at the active scope).
2. **Provenance badge** — *Default* · *Organization* · *Overridden at North Campus*. One glance answers "where does this come from?"
3. **Applies to** — "*Applies to all 3 sites* 🔒" (availability + reach).
4. **Override affordance** — **Unlock → choose scopes → set a different value** (creates an override only there; the rest keep inheriting).
5. **Effective from** — any change opens "*Apply from…*" (supersede; never silent overwrite).
6. **Reset to inherited** — removes an override, restoring the parent value.

```
┌ Late-pickup fee ────────────────────────────────────────────┐
│ $25 / occurrence            ● Organization default           │
│ Applies to all 3 sites 🔒        [ Unlock to override ▾ ]     │
│ ▸ Downtown overrides this: $35   (effective Sep 1)           │
└──────────────────────────────────────────────────────────────┘
```

### 5b. Beyond the locked/unlock example (improvements)
The prompt's "🔒 locked → unlock → select locations → override" is the seed. Generalized and improved:
- **Provenance everywhere** (not just on override) — inheriting values say where they came from.
- **Compare-across-scopes view** — a matrix (rows = items, cols = sites) showing inherited vs overridden cells; the home for fleet operators.
- **Cascade-impact preview** — "Changing the org default affects 2 sites and 240 enrollments" before save.
- **Override hygiene** — count overrides ("3 sites differ"), one-click *reset to inherited*, warn on override sprawl.
- **Availability == the same control** — toggling "offered at North Campus" is the availability face of the same Inheritance Control.

### 5c. Why this is platform, not Financials
The Inheritance Control takes only: a value type, a scope axis, and a system-of-record. It is agnostic to *what* is being configured. Pricing cells, policy amounts, comm templates, brand tokens, open hours, workflow enablement — all render through it. **Building it once is the platform-level capability.**

---

## 6. Configuration language (operator vs. system)

Extends the Commercial Language Bible (historical: `../../sprints/active/commercial-language-bible.md`) to the configuration layer. Operators see the left; the system stores the right.

| Operator sees | System term |
|---|---|
| Program · Tuition · Funding · Fees · Accounting | service_offering · rate_plan · rate_rule · charge_template · gl_mapping |
| **Applies to** (sites) | `scope_type` + scope FK |
| **Overridden here** / **Inherited from Organization** | a scoped row vs. fallback |
| **Default** (Alloy's) | `org_id IS NULL` global row |
| **Effective from** | `effective_start` |
| **Compare locations** | scope diff query |
| Location / Site · Room | `locations` (site / unit) |

Never shown: scope_type, effective_start, org_id-null, program_category_id, billable_source_type.

---

## 7. Commercial Configuration V2 (redesigned on the ownership model)

V1 was a Program-first workspace with a Tuition grid. **V2 keeps that and adds the ownership/inheritance spine.**

### 7a. Visual hierarchy — the answers
- **Where does Location appear?** As a **Scope Context bar** at the top — the global Inheritance Control lens: *Configuring: Organization (default) ▾ · applies to all 3 sites · [Compare locations]*. Locations are **referenced** (owned by Locations), never edited here.
- **Where does Program appear?** As the **spine** (left rail), **referenced** from the Programs catalog; tuition attaches to it.
- **Where does Pricing appear?** On the Program, as the **Tuition grid**, resolved for the current scope lens, each cell carrying provenance + override.
- **What belongs on the Programs page (Locations/Ops)?** Program identity (name, age band, rooms, capacity, enrollment window) + a **read-only tuition summary** ("managed in Commercial Config ↗").
- **What belongs on Commercial Configuration?** Tuition, Funding, Fees, Policies, Accounting — organized by Program, scoped by the Location lens.
- **What belongs on Locations?** Site/room identity, hours, address + a **read-only** "programs offered & pricing" reference.
- **What is merely referenced?** Programs, Rooms, Locations (in Commercial Config); Tuition (on Programs/Locations pages).

### 7b. What V2 must solve (and how)
| Concern | V2 mechanism |
|---|---|
| **Organization** | The default scope; the Scope Context bar opens at "Organization (default)." |
| **Locations** | A scope lens + "Compare locations" matrix; referenced, not owned. |
| **Programs** | The rail; referenced from catalog; availability per site via the Inheritance Control. |
| **Tuition** | The hero grid, resolved per scope, per cell provenance + override. |
| **Funding** | A sibling hub tile; the grid's funding lens; rates inherit org→site. |
| **Overrides** | The Inheritance Control on every value; "N sites differ" + reset. |
| **History** | Per-cell/per-grid version timeline (supersede). |
| **Effective dates** | "Apply from…" on every change; scheduled-change banners. |

### 7c. Shell
Lives in the **frozen Configuration Runtime shell** (Settings index → Context Queue 260px → Object Queue 320px → Workspace). Commercial Config is a Context Queue entry; Programs are the Object Queue; the Tuition workspace is the flex pane. The Scope Context bar spans the workspace top.

---

## 8. Three competing concepts

### Concept A — Organization-first (inheritance is the hero)
- **Layout:** the **Compare-locations matrix** is the main surface (rows = config items / programs, cols = sites); cells show inherited vs overridden; edit org defaults, override per cell.
- **Strengths:** makes ownership/override explicit and central; ideal for multi-site chains; the lock/applies-to pattern is native and front-and-center.
- **Weaknesses:** overwhelming for single-site orgs; reads as "managing a fleet," not "configuring my business"; the tuition grid is nested inside a bigger matrix.

### Concept B — Program-first (V1 + a scope lens)
- **Layout:** the Program workspace (rail + Tuition hero) with a **Location lens** in the Scope Context bar; each value shows provenance + inline override.
- **Strengths:** matches the operator mental model; inheritance is contextual, never overwhelming; single-site orgs barely notice scope.
- **Weaknesses:** cross-location comparison needs a lens switch (no at-a-glance matrix); fleet managers want the grid view.

### Concept C — Commercial-first (a configuration hub)
- **Layout:** a **Commercial Configuration hub** of tiles — Programs & Tuition · Funding · Fees · Policies · Accounting · Simulator — each opening its surface; a global scope lens persists across all.
- **Strengths:** scales to the whole commercial domain and future experiences; one clear home; consistent scope lens everywhere.
- **Weaknesses:** adds a navigation hop before the grid; the hub itself isn't where work happens.

---

## 9. Converged target — **Commercial Configuration V2**

**Take the strongest idea from each:**
- **Entry = the hub (C):** Commercial Configuration → Programs & Tuition · Funding · Fees · Policies · Accounting · Simulator.
- **Working surface = Program-first (B):** the rail + Tuition grid, the operator's natural home.
- **Inheritance spine = a persistent Scope Context bar (A's hero, not forced):** "Configuring: Organization (default) ▾ · applies to all 3 sites · **Compare locations**." Compare-locations opens A's matrix **on demand** — power without imposing it on single-site orgs.
- **Every value carries the Override Pattern** (§5): provenance badge + override + effective date.

This converges correctly because each concept's failure mode is avoided: A's matrix is available but not forced, B's cross-site blind spot is covered by Compare-locations, C's extra hop lands directly in the working grid. See the rendered V2 mockup alongside this doctrine.

---

## 10. Platform-wide implications (one pattern, every module)

The same three pieces — **system-of-record rule** (§3), **scope ladder + resolution** (§4), **Inheritance Control** (§5) — govern every configurable object. Each future module declares: *its home, which scope axes it inherits along, and whether each value is value-inheritance or availability.*

| Module | System of record | Inherits along | Kind | Override example |
|---|---|---|---|---|
| **Communications** | Communications | platform→org→site | value + availability | Org template; Downtown overrides the signature |
| **Branding** | Brand/Settings | org→site | value | Org palette; one campus has its own logo |
| **Scheduling (hours)** | Locations | org→site→room | value | Site hours; Room 2A opens earlier |
| **Attendance rules** | Operations | org→site→program→room | value | Late-pickup threshold per program |
| **Workflows / Actions** | Automation | platform→org→site | availability (+ params) | Enable a workflow at two sites only |
| **Policies** | Commercial / Ops | org→site→program→room | value | Proration org-wide; deposit per program |
| **Access / Roles** | Admin | org + site/dept assignment | availability (orthogonal) | A role scoped to North Campus |
| **Analytics / Reporting** | Analytics | platform→org (defs); per-scope views | value + availability | Org KPI definition; per-site targets |

**Every future configuration experience is now a fill-in-the-blank:** name the object's four owners, its home, its scope axes, and render its values through the Inheritance Control. No new inheritance design per module.

---

## 11. Ownership Matrix (canonical)

| Object | Commercial owner | Operational owner | Configuration owner (home · scope) | Runtime owner |
|---|---|---|---|---|
| **Locations / Sites** | — | itself | Locations · org | enrollment, scheduling |
| **Rooms** | — | itself (capacity/ratio) | Locations · site | placement, attendance |
| **Programs** | the commercial unit | Site/Room | Programs catalog (today Locations) · org→site (availability) | enrollment, pricing, scheduling |
| **Services / Offerings** | Program/Org | — | Commercial Config · org→site | billing |
| **Pricing / Tuition** | Program | — | Commercial Config · org→site→program→(room) | Consumption Resolver / billing |
| **Funding** | Payer/Program | — | Commercial Config · org→site | resolver (responsibility split) |
| **Financial Policies** | Org/Program | — | Commercial Config · org→site→program→room | resolver, billing, collections |
| **Charge Templates** | Program/Org | — | Commercial Config · org (→site) | charge resolution |
| **Communications** | Org | Site | Communications · platform→org→site | comms engine |
| **Branding** | Org | Site | Brand/Settings · org→site | every rendered surface |
| **Workflows / Actions** | Org | Site | Automation · platform→org→site | execution engine |
| **Scheduling** | — | Site/Room | Locations · org→site→room | attendance, billing |
| **Attendance** | — | Room | Operations · org→site→program→room | consumption pipeline |
| **Access / Roles** | — | — | Admin · org + site/dept | authorization |
| **Reporting / Analytics** | Org | — | Analytics · platform→org + per-scope | dashboards |
| **Fields / Layouts / Statuses** | — | — | Configuration Runtime · platform→org | record runtime |

---

## 12. Success criteria

By the end of this sprint we know exactly:
- **Who owns configuration** — four owners per object; one system of record (§2–3).
- **How inheritance works** — two axes (platform→org, org→site→program→room) + time, most-specific-wins (§4) — already in the schema.
- **How overrides work** — one Inheritance Control: provenance + applies-to + override + effective-date + reset (§5).
- **What pages own data vs consume it** — system-of-record rule + reference contract (§3).
- **How Commercial Configuration fits the rest of Alloy** — it's the first instance of a universal pattern; Communications, Branding, Scheduling, Workflows, Policies, Access, Analytics all follow (§10).

> **The bigger truth:** this isn't pricing. It's the pattern that governs every configurable object in Alloy. Build the Inheritance Control and enforce the system-of-record rule once, and every future configuration experience — known and unknown — inherits the answer.
