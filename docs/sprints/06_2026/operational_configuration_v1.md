# Operational Configuration V1 — Architecture & Implementation Plan

**Status:** Planning memo (June 2026). No implementation. Determines how the Operational Execution backend (through P3.3.1) becomes visible and configurable through the **existing** Configuration Platform before Posting / Payments / Settlement / Subsidy continue.

**Anchored doctrine (do not violate):**
- Configuration Runtime V1 is **frozen**: `docs/system/configuration-runtime-v1.md`, `configuration-ownership-doctrine.md`, `configuration-workspace-v1-doctrine.md`, `configuration-mode-doctrine.md`. Interaction model: **Context → Queue → Workspace → BOS**. "No new IA changes without explicit doctrine update."
- Operational truth-flow: `docs/platform/operational-truth-flow-doctrine.md` (L1 Config → L2 Intent → L3 Expectations → L4 Facts → L5 Consequences). Expectations are derived, never persisted.
- Billing/financials: `docs/platform/modules/billing-financials-platform.md`.
- Platform principle: **childcare is the first implementation, not the architecture.** Generic platform naming everywhere.

---

## 0. Executive summary (the three decisions that matter)

1. **Financials becomes a first-class Configuration domain** (sibling to Organization / Data / Operations), not rates embedded in Programs/Locations. It requires an explicit amendment to the frozen ownership doctrine — treat that amendment as a **gate**.
2. **Physical/operational rules stay in Locations** (capacity, ratio, operating windows, schedule eligibility) because they are properties of places and need spatial context; **pricing policy moves to Financials** (rate plans/rules, charge categories). This asymmetry is intentional and justified in §1/§4.
3. **Ship read-only first.** Several backends already expose read APIs (`operational-expectations`, `expected-vs-actual`, `actual-compliance`, `financial-charge-preview`). The P1 config rules and P3.2 rates are **read-only with no write service or admin route** — the single biggest backend gap. We can make the platform *visible* for QA immediately with thin read endpoints, then add effective-dated write services in dependency order.

---

## 1. Configuration Information Architecture (Deliverable 1)

### Current frozen IA (`configurationModeNav.ts`)

| Group | Surfaces |
|---|---|
| Organization | Locations, Access, Communications |
| Data | Fields, Statuses |
| Operations | Processes, Surfaces |
| Operational Intelligence | Operational Intelligence (Metrics) |
| Automation | Workflows |
| Internal | Action definitions |

### Proposed IA (one additive domain)

```
Settings
├── Organization
│   ├── Locations          ← + operational rules (capacity, ratio, operating windows, schedule eligibility)
│   ├── Access
│   └── Communications
├── Data
│   ├── Fields
│   └── Statuses
├── Operations
│   ├── Processes
│   └── Surfaces
├── Financials             ← NEW first-class domain
│   ├── Rate Plans         (rate rules nested inside a plan)
│   ├── Charge Categories  (read-only / vocabulary in V1)
│   ├── Charge Policies        (future)
│   ├── Financial Responsibility (future)
│   └── Subsidy               (future)
├── Operational Intelligence
│   └── Metrics
└── Automation
    └── Workflows
Internal: Action definitions
```

**Why one new domain and not more:** operators already think in *places* (Locations) and *money* (Financials). Capacity/ratio/operating windows/eligibility are operational properties **of a place** and belong with that place; pricing is a distinct policy concern that spans org→site→program→room and is dominated by org/program-level plans, so it earns its own domain. We deliberately do **not** create separate top-level "Operating Rules", "Attendance", or "Enrollment" sections (the last is forbidden — enrollment is a Business Process).

**Gate:** This is an IA change to a frozen system. Required before any Financials nav item ships:
- Amend `docs/system/configuration-ownership-doctrine.md` (add Financials ownership row) and `configuration-workspace-v1-doctrine.md` (add Financials to the domain map).
- Extend `web/lib/adminV2/configurationModeNav.ts` + icons + nav tests.

---

## 2. Recommended navigation (Deliverable 2)

- **Financials** added as its own nav group, after Operations, before Operational Intelligence (money reads naturally after behavior/presentation, before analytics).
- **Financials default surface:** Rate Plans.
- **Rate Rules are NOT a separate top-level nav item.** They are children of a rate plan (a rule is scoped via its parent plan and carries `schedule_basis × rate_basis`). They are edited in a **nested list → workspace** inside the Rate Plan workspace (same pattern as Processes' operating-plan nested queue). An optional flat **"Rate matrix"** read view can live as a secondary tab inside Rate Plans for cross-plan review.
- **Locations** nav unchanged at the top level; operational rules surface **inside** the Locations workspace (see §3), not as new nav items.
- **Charge Categories** appears under Financials but renders a **read-only vocabulary** in V1 (code-owned invariants — see §4/Risks).
- Generic labels only: "Rate Plans", "Capacity", "Ratios", "Operating Windows", "Schedule Eligibility" — never "tuition plans" or childcare-specific wording in the IA.

---

## 3. Locations redesign (Deliverable 3)

### Finding: Locations is already an inline operational workspace — not a CRUD drawer list

`LocationsConfigurationPage` already runs the frozen shell: **section queue** (Locations / Programs / Rooms / Schedule Templates) → **object queue** → **inline workspace detail panel** (`ConfigurationDetailCard`, Save in place). A drawer is used **only** for "Add Location". So the "drawers are no longer appropriate" instinct is largely already satisfied; the real work is **folding operational rules into the existing inline workspace** and **retiring the create-only drawer**.

### What changes

| Concern | Where it lives | Inline vs expandable |
|---|---|---|
| Site identity (name, address, phone, **timezone**) | Site detail panel | **Inline** (always visible) |
| Program identity (name, age band, room types) | Program detail panel | **Inline** |
| Room identity (name, program, age band) | Room detail panel | **Inline** |
| Schedule Templates (patterns) | Existing section | **Inline** (already wired; has write service) |
| **Capacity** (physical/licensed/operational) | Room primarily; Program/Site where scoped | **Expandable** effective-dated rule card on the Room/Program/Site workspace |
| **Ratio** (+ tiered staffing, jurisdiction) | Program / age-group within a site | **Expandable** effective-dated rule card with a tier table |
| **Operating Windows** (weekday open/close) | Site | **Expandable** effective-dated weekly grid |
| **Schedule Eligibility** (min/max days, eligible schedule types per age group) | Program / Site | **Expandable** effective-dated rule card; cross-link to enrollment Process |

### Rules of thumb
- **Inline = identity + the single current value an operator changes constantly.** Always visible, no expansion.
- **Expandable (`ConfigurationAdvancedSection` / Universal Card) = effective-dated rule sets with version history.** These are sets-over-time (capacity history, ratio tiers, operating-window weeks, eligibility), so they collapse by default and open to a version timeline + editor.
- **Resolved-value preview** sits at the top of each rule card: "Operational capacity for this room on <date>: **12** (inherited from Program · effective 2026-01-01)." This reuses `resolveConfigRule` / `resolveCapacityBreakdown` and is the core QA affordance.

### Room / program management
Stays in Locations (it already does). Rooms and Programs are the spatial anchors that capacity/ratio attach to; moving them elsewhere would orphan the rule cards.

### Drawers
- **Retire the create drawer.** Replace "Add Location/Program/Room" with an **inline "new" row in the object queue → blank workspace form** (consistent with how Statuses/Fields create flows are trending). If a lightweight modal is retained for create, use the existing `ConfigurationDetailCard` form shape — never a separate drawer runtime.

---

## 4. Financial configuration architecture (Deliverable 4)

### Decision: Financials is a first-class section; rates are NOT embedded in Programs/Locations

**Why not embed in Locations/Programs:**
- Rate plans are **scoped org→site→program→room** and effective-dated. Org- and program-level plans are the common case; embedding under a single location would fragment authoring and hide org-level plans.
- Charge categories, charge policies, financial responsibility, and subsidy have **no natural home** in Locations.
- A dedicated domain matches generic platform naming and keeps childcare out of the architecture.

**Why this differs from capacity/ratio (which DO stay in Locations):** capacity/ratio/operating windows are *physical properties of a place* an operator reasons about while looking at that room/site. Pricing is a *policy layer* an operator reasons about as a set. Same scope model, different mental model → different home.

### Financials sub-architecture

```
Financials
├── Rate Plans              object queue = plans (scope + effective range + currency + calc strategy)
│     └── workspace
│           ├── Plan settings (currency, billing basis, calc strategy, proration/cadence hooks)
│           └── Rate Rules (nested list→workspace): schedule_basis × rate_basis × age group × amount
├── Charge Categories       read-only vocabulary (code-owned: CHARGE_CATEGORIES + DB CHECK)
├── Charge Policies         (future — backend undefined; placeholder)
├── Financial Responsibility(future — P3.3 ships default household/account payer only)
└── Subsidy                 (future — P3.5 seam; expected subsidy is L3-derived, never AR)
```

- **Rate Plan workspace** shows a **resolved-rate preview** ("5-day infant on 2026-03-01 → $1,200/mo from Program plan") reusing `resolveRate`.
- **Charge Categories** are **code-owned invariants** (`web/lib/financials/billableSource.ts`). V1 **displays** them read-only; it does **not** move them into tenant JSON config (doctrine: code owns invariants).
- **Financial Charge Preview inspector** (read-only, API already exists at `/api/admin/financial-charge-preview`) belongs as a QA panel inside Financials: pick agreement + service period → resolved rate, schedule basis, quantity, amount, currency, responsibility, resolution key, `wouldWrite`. This is the single highest-value visibility surface and needs **no new backend**.

---

## 5. Versioned configuration strategy (Deliverable 5)

### Which objects need version history

| Object | Effective-dated? | Versioning mechanism |
|---|---|---|
| Rate Plans | **Yes** (`effective_start/end`) | Supersede (new version row) |
| Rate Rules | **Yes** | Supersede; scope inherited from plan |
| Capacity Rules | **Yes** | Supersede |
| Ratio Rules | **Yes** | Supersede |
| Ratio Rule **Tiers** | No own dates | Version **with parent** ratio rule (tiers are children) |
| Operating Windows | **Yes** | Supersede |
| Schedule Rules (eligibility) | **Yes** | Supersede |
| Sites / Programs / Rooms identity | **No** | Mutable entity edit (not a rule) |
| Charge Categories | **No** | Vocabulary (active/inactive), code-owned |

All rule tables **already carry** `effective_start` / `effective_end` and `source_key` — the schema is ready; the **write semantics are missing**.

### Operator model (the rule that prevents truth corruption)

- **Editing an effective-dated rule never mutates the active row in place.** "Edit" = **create a new version** effective on a chosen date; the prior row's `effective_end` is closed the day before. This mirrors the existing **placement/schedule-assignment supersede** pattern (`supersedeChildPlacement`, `supersedeScheduleAssignment`) — reuse that discipline.
- **Future-dated changes:** author a version with a future `effective_start`; it shows as **Scheduled** and does not affect today's resolution until it starts.
- **Historical review:** the expandable rule card shows a **version timeline** — Expired / Current / Scheduled badges, each with its effective range and values.
- **Supersede behavior:** new row added, prior row closed; nothing is destructively deleted.
- **Rollback:** two safe paths — (a) before a Scheduled version starts, **void/delete the pending version**; (b) after it is active, **add a new version** that restores prior values effective from the rollback date. No in-place edits, no history rewrites.
- **Resolved preview** accompanies every editor so operators see exactly which version wins for a given date/scope before saving.

---

## 6. Remaining operational configuration inventory (Deliverable 6)

| Capability | Expose now? | Home | Backend status | Action needed |
|---|---|---|---|---|
| Programs | Yes | Locations | Write + API exist (program categories) | UI only |
| Rooms | Yes | Locations | Write + API exist (`/api/admin/locations`) | UI only |
| Schedule Templates/Patterns | Yes | Locations | Write + API exist (`schedule-patterns`) | UI only (already wired) |
| Capacity | Yes | Locations | **Read-only fetcher; no write/route** | **New CRUD service + route (supersede)** |
| Ratios (+ tiers, jurisdiction) | Yes | Locations | **Read-only fetcher; no write/route** | **New CRUD service + route (parent+tiers)** |
| Operating Windows | Yes | Locations | **Read-only fetcher; no write/route** | **New CRUD service + route (supersede)** |
| Schedule Eligibility (schedule rules) | Yes | Locations (×-ref Process) | **Read-only fetcher; no write/route** | **New CRUD service + route (supersede)** |
| Rate Plans | Yes | Financials | **Read-only fetcher; no write/route** | **New CRUD service + route (supersede)** |
| Rate Rules | Yes | Financials (nested) | **Read-only fetcher; no write/route** | **New CRUD service + route** |
| Charge Categories | Yes (read-only) | Financials | Code-owned vocab + DB CHECK | Display only |
| Charge Preview | Yes (read-only) | Financials | **Read API exists** | UI only (inspector) |
| Charge Policies | Defer | Financials | Undefined backend | Define later |
| Financial Responsibility | Defer | Financials | P3.3 default payer only | Hook/placeholder |
| Subsidy | Defer | Financials | P3.5 seam | Hook/placeholder |
| Attendance config (absence reasons, timezone) | Partial | Locations/Org | Absence reasons code-owned; timezone on site | Surface read-only; timezone already inline on Site |
| Operational read models (expectations, compliance) | Optional | Runtime workspace (not config) | Read APIs exist | Out of config scope; QA via workspace |
| BOS operational hooks | Defer | Operational Intelligence | Metrics domain exists | Targets later |
| Future subsidy hooks | Defer | Financials | — | Placeholder |

### Gaps that block end-to-end operator configuration
1. **No write service / admin API for any P1 config rule or P3.2 rate object.** This is the dominant effort. Build server-side, role-gated services (mirror `schedulePatternService` + `childcareChargeService` posture) with **supersede** semantics — never client-side writes, never in-place PATCH of effective-dated rows.
2. **Charge categories / policies tenant-configurability is undefined.** Keep code-owned for V1.
3. **Age-group taxonomy authoring** is implicit (derived from program categories / location field values). Confirm program categories remain the canonical age-band authoring surface; no new taxonomy editor in V1.

---

## 7. Implementation batches (Deliverable 7)

**Batch 0 — Visibility (read-only, minimal backend):**
- Financials section scaffold (nav + doctrine amendment gate) → **Rate Plans/Rules read viewer** using existing fetchers behind thin GET routes.
- **Charge Preview inspector** (API already exists — zero new backend).
- **Locations operational read cards** (capacity / ratio / operating windows / eligibility) rendered read-only from existing fetchers via thin GET routes, each with a **resolved-value preview**.
- Outcome: the whole backend is visible for QA with no write paths.

**Batch 1 — Financials CRUD + versioning:**
- Write services + routes for `childcare_rate_plans` / `childcare_rate_rules` with supersede.
- Rate Plan workspace + nested Rate Rules editor + resolved-rate preview + version timeline.

**Batch 2 — Locations operational CRUD + versioning:**
- Write services + routes for capacity, ratio (+ tiers), operating windows (supersede).
- Inline expandable editors with version history on Site/Program/Room.

**Batch 3 — Schedule eligibility:**
- Write service + route for schedule rules; eligibility editor; cross-reference from enrollment Process.

**Batch 4 — Charge categories + (optional) policies:**
- Read-only category display; policy scaffolding only if backend is defined.

**Batch 5 — Future hooks:**
- Financial Responsibility / Subsidy placeholders aligned to P3.4/P3.5.

---

## 8. Risks (Deliverable 8)

1. **Frozen IA.** Adding Financials violates the freeze unless doctrine is amended first. *Mitigation:* doctrine amendment + nav-test update as Batch 0 gate.
2. **Effective-dated writes implemented as naive CRUD** would corrupt operational truth. *Mitigation:* mandate supersede semantics reusing placement/assignment patterns; ban in-place PATCH on rule tables; add tests.
3. **No write backend exists** for config rules/rates — largest effort, easy to under-scope. *Mitigation:* batch read-only first; treat write services as their own batches.
4. **Client-side money/config writes.** *Mitigation:* server-only, role-gated services (`has_org_role`), mirroring `childcareChargeService`.
5. **Childcare naming leaking into platform IA.** *Mitigation:* generic labels; childcare as first implementation only.
6. **Scope/precedence confusion** (org→site→program→room + age group). *Mitigation:* resolved-value preview + inheritance breadcrumb on every rule card.
7. **Moving invariants into JSON config** (charge categories). *Mitigation:* keep code-owned; display only.
8. **Locations drawer removal** could regress create. *Mitigation:* replace with inline create using the existing detail-card form; keep behind the same tests.
9. **AdminV2 runtime performance doctrine.** Settings pages are lower-risk but must reuse existing loaders and not introduce above-fold skeletons.

---

## 9. UX recommendations (Deliverable 9)

- **One effective-dated editor primitive** (new shared component, build once): version timeline + Current/Scheduled/Expired badges + "Edit = new version" + resolved-value preview. Reuse across capacity, ratio, operating windows, schedule eligibility, rate plans, rate rules. This is the most important reuse decision.
- **Resolved preview everywhere.** Capacity binding, required staff, resolved rate, and draft charge are all derivable from existing pure resolvers — surface them so configuration is *testable by looking*. This directly serves the sprint's "make the backend visible" goal.
- **Inheritance is explicit:** show "inherited from Program" vs "overridden here", with "Add override at this room/program".
- **No edit drawers.** Inline workspace for edit; inline new row (or existing detail-card form) for create.
- **Read before write.** Every surface ships a read-only viewer first; write is added behind the same layout.
- **Charge Preview inspector** as a guided form (agreement + period → resolved breakdown) — the flagship QA surface.

---

## 10. Recommended implementation order for exposing the backend (Deliverable 10)

Ordered for **fastest visibility, lowest backend risk, dependency-aware**:

1. **Doctrine amendment + Financials nav scaffold** (gate).
2. **Charge Preview inspector** (read API exists) — immediate, high-value visibility.
3. **Rate Plans/Rules read viewer** (Financials) — thin GET routes over existing fetchers + resolved-rate preview.
4. **Locations operational read cards** (capacity / ratio / operating windows / eligibility) — thin GET routes + resolved previews.
5. **Shared effective-dated editor primitive** (built once, validated on rates first).
6. **Rate Plans/Rules CRUD + versioning** (Financials write services + routes).
7. **Capacity + Ratio(+tiers) + Operating Windows CRUD + versioning** (Locations write services + routes).
8. **Schedule Eligibility CRUD** (Locations, ×-ref Process).
9. **Charge Categories display** (+ policies if backend defined).
10. **Future hooks** (Financial Responsibility, Subsidy) aligned with P3.4/P3.5.

Steps 1–4 make the entire completed backend visible for QA **before** any new write code, satisfying the sprint goal; steps 5–10 progressively make it configurable.

---

## Runtime reuse map (Deliverable 6 detail)

**Reuse (do not reinvent):**
- `ConfigurationModeLayout` primitives: `ConfigurationContext`, `ConfigurationShell`, `ConfigurationQueue/QueueItem`, `ConfigurationWorkspace`, `ConfigurationDetailCard`, `ConfigurationEmptyState`, `ConfigurationAdvancedSection`.
- `ConfigurationRuntimeUniversalCard` for effective-dated rule cards.
- `configurationRuntime.css` tokens; `configurationModeNav.ts` registry; the `use*ConfigurationSettings` hook pattern.
- Existing section-queue + object-queue + inline-workspace layout (Locations/Statuses/Fields are the templates).

**Extend (existing pages):**
- `LocationsConfigurationPage` + its detail panels → host the operational rule cards.

**Create (new):**
- `FinancialsConfigurationPage` + `useFinancialsConfigurationSettings` (mirror Locations hook/page).
- **One** shared `EffectiveDatedRuleEditor` / version-history component.
- Thin GET routes (Batch 0) and supersede write services + routes (later batches) for the P1/P3.2 tables.

**Avoid duplicate runtime concepts:** a single effective-dated editor; a single resolved-preview helper bound to existing pure resolvers (`resolveConfigRule`, `resolveCapacityBreakdown`, `requiredStaffForChildren`, `resolveRate`).

---

## Adjacent note (not in scope, flagged)

Fields, Actions, Communications, and Access already have **built Configuration Runtime page components** behind **legacy route clients**. Wiring those routes is out of scope for Operational Configuration V1 but is adjacent cleanup that shares the same shell.

---

## Batch 0 — Read-Only Exposure (IMPLEMENTED)

Status: shipped. Read-only exposure of the completed backend primitives inside the existing Configuration Runtime. No posting, payments, subsidy, migrations, schema changes, or broad CRUD.

### What is visible now

**Financials (new first-class domain)** — `/settings/financials`, nav group "Financials" (icon `Banknote`, testId `config-mode-nav-financials`):
- **Overview** — domain framing + counts (rate plans, rate rules, GL codes, GL mappings) + list of future write surfaces.
- **Rate Plans** — read-only object queue + detail. Plan shows key, scope, currency, billing basis, calculation strategy, age group, effective range, active flag, and effective status badge (Current / Scheduled / Historical). **Rate Rules** are nested under the selected plan (schedule basis, amount, rate basis, age group, effective range, status).
- **Charge Preview** — read-only inspector over the existing `/api/admin/financial-charge-preview`. Labeled "Preview only — no invoice, no AR, no posting, no ledger write."
- **GL Codes** — read-only over `gl_accounts` (code, name, type, currency, active).
- **GL Mappings** — read-only over `gl_account_mappings` (key → GL account).

**Locations / Organization** — `/settings/locations`, new **Operational Rules** section:
- Read-only **Capacity Rules**, **Ratio Rules** (+ tiers), **Operating Windows**, **Schedule Rules**, each with scope badge (Org default / Location override / Program override / Room override) and effective-status badge.
- **Resolved per location** preview using the authoritative `resolveConfigRule` (most-specific-wins) to show inheritance per site.

### Why Financials is first-class

Pricing/rate configuration, charge resolution, GL, posting, payments, responsibility, and subsidy are a coherent ownership domain distinct from Organization or Data Model. Embedding rates inside Programs/Locations would fragment financial truth and block versioned rate authoring. Financials is added as an **additive** nav group; no existing pages were moved.

### Why GL / GL Codes belongs under Financials

GL Codes (`gl_accounts`) and GL Mappings (`gl_account_mappings`) are the accounting targets that posting will map charge categories, payments, credits, deposits, subsidy, and adjustments to. They are core financial configuration even though the editable/posting model is deferred. Exposed read-only now so the financial model is visible end-to-end.

### Why Settings IA is evolving but not reorganized

Only the additive **Financials** group and the **Operational Rules** Locations section were introduced. No working pages were relocated. Broader IA (Processing, Communications/Integrations consolidation) is deferred.

### Read-only data access added (no writes)

- `GET /api/admin/financial/rate-config` → `loadRateConfigBundle` (admin/ops gated).
- `GET /api/admin/financial/gl-config` → `loadGlConfigBundle` over `gl_accounts` + `gl_account_mappings` (admin/ops gated, read-only `glConfigService`).
- `GET /api/admin/operational-config-rules` → `loadChildcareConfigRuleBundle` (admin gated).
- Shared pure presentation helper `configReadPresentation.ts` (effective-status classification, generic scope labels, currency/range formatting). The authoritative resolver remains `resolveConfigRule.ts`.

### Effective-dated / versioned UX

All effective-dated rows render Current / Scheduled / Historical status badges and an effective range, and sort Current → Scheduled → Historical. Supersede/change-later **authoring** is deferred to later batches; V1 is read-only.

### Create drawer quarantine

The Locations "Add Location" create drawer is now scoped to the Locations section only and marked for removal pending an inline create flow. It does not appear on the Operational Rules section.

### What remains read-only

Rate plans, rate rules, GL codes, GL mappings, capacity/ratio/operating-window/schedule rules, and charge preview are all read-only.

### What remains unbuilt

Write/versioning services + routes for P1 config rules and P3.2 rate plans/rules; GL code/mapping authoring; posting; payments; financial responsibility; subsidy; inline location create.

### Recommended next batch

**Batch 1 — Financials write + versioning:** supersede-based effective-dated write services + admin routes for Rate Plans and Rate Rules, behind the same read layouts (read-before-write). Then **Batch 2** for Locations operational-rule authoring (capacity/ratio/operating windows/schedule).

---

## Batch 1 — Financials Write + Versioning (IMPLEMENTED)

Status: shipped. Versioned authoring for Rate Plans + Rate Rules inside the existing Financials configuration surface. **No schema change / no migration** — the P3.2 tables already carry `effective_start` / `effective_end` / `is_active` / `metadata` and the RLS already permits scoped insert/update/delete for admin/ops. No posting, payments, AR, subsidy, charge-resolution changes, or GL authoring.

### Versioning model (effective-dated, never overwritten)

- A **logical rate plan** is the set of `childcare_rate_plans` rows sharing `(plan_key, scope, age_group)`; each row is one **version** with its own effective window. A **rate-rule lineage** is the set of `childcare_rate_rules` rows sharing `(rate_plan_id, schedule_basis, age_group)`.
- The rate tables have **no `status` / `supersedes_id` column** (unlike placements). Supersede is therefore expressed purely by **effective dating**: a new version row + the prior row's `effective_end` closed the day before (`computePriorRowCloseDate`). The prior-version link is preserved in `metadata.supersedes_id` / `metadata.lineage_origin_id` for auditability without a schema change.
- **Status is derived, not stored:** `Current` (latest open row effective today), `Scheduled` (future start), `Superseded` (ended with a later version), `Retired` (ended/deactivated with no successor). Classification lives in the pure, domain-generic `effectiveDatedVersioning.ts` and agrees with the resolver's "latest effective_start" tie-break.

### Operations (all server-side, role-gated admin/ops)

| Operation | Plan | Rule | Semantics |
|---|---|---|---|
| create | ✓ | ✓ | genesis version |
| future version / supersede | ✓ | ✓ | new row, close prior the day before; **plan supersede carries the prior version's currently-effective rules forward** so resolution never hits `no_rule` |
| retire | ✓ | ✓ | close `effective_end` (date-based, non-destructive); a past/today date also `is_active=false` on plans |
| void | ✓ | ✓ | hard-delete a **not-yet-started** version (rollback) and **reopen its predecessor**; refused once a version was ever effective |

### Runtime components

- **`lib/adminV2/operationalConfig/effectiveDatedVersioning.ts`** — pure, domain-generic version model (status classification, version timeline, `planSupersede`, `canVoidVersion`). The single reusable primitive intended to later power capacity / ratio / operating-window / schedule-rule authoring.
- **`lib/financials/rates/rateAuthoringService.ts`** — supersede-based write service for plans + rules (mirrors `supersedeChildPlacement`). Reuses the shared `effectiveDating` helpers and `OperationalEnrollmentServiceError`.
- **`app/api/admin/financial/rate-plans/route.ts`** + **`rate-rules/route.ts`** — `requireAdminOrOps`-gated POST routes dispatching `create | version | retire | void`.
- **`components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor.tsx`** + `ConfigEditorPrimitives.tsx` — **the one shared editor primitive** (version timeline + status badges + inline "create future version" + retire/void + resolved-preview slot), field-driven and domain-agnostic. This is the §9 "one effective-dated editor primitive" reuse decision, realized.
- **`components/adminV2/settings/financials/RatePlanAuthoringWorkspace.tsx`**, `CreateRatePlanForm.tsx`, `useRateAuthoring.ts` — financials authoring host: plan version timeline, nested per-schedule-basis rule editors, add-rule, create-new-plan, and a **resolved-rate preview** using the authoritative `resolveRate`. `FinancialsConfigurationPage` now lists one entry per plan lineage and hosts authoring; the read-only `RatePlanDetailPanel` was folded into the workspace and removed.

### Tests

- `tests/adminV2/effectiveDatedVersioning.test.ts` — pure status/timeline/supersede/void model.
- `tests/financials/rateAuthoringService.test.ts` — create/version (incl. rule carry-forward)/retire/void for plans + rules, validation + not-found paths, lineage metadata, predecessor reopen.
- `tests/financials/rateAuthoringRoutes.test.ts` — auth gating, action dispatch, actor wiring, error→HTTP mapping, POST-only.
- `tests/adminV2/operationalConfigurationV1Batch0.test.ts` — updated posture: GL + Locations remain read-only; Financials rate authoring routes export gated POST; versioning primitive is domain-generic. The shared mock (`mockOperationalEnrollmentSupabase.ts`) gained `.delete()` + bulk-insert-await support.

### What remains intentionally unbuilt (Batch 1)

Location/program **picker** for scoped plans (V1 takes scope-target IDs; org scope is the common case); Batch 2 Locations operational-rule authoring (capacity/ratio/operating windows/schedule) — already designed to reuse `EffectiveDatedConfigurationEditor` + `effectiveDatedVersioning`; posting, payments, financial responsibility, subsidy, and GL authoring (later phases).

---

## Phase 3 (Batch 2) — Locations Operational-Rule Write + Versioning (IMPLEMENTED)

Status: shipped. Versioned authoring for the four Locations operational rule types exposed read-only in Batch 0 — **capacity rules, ratio rules (+ tiers), operating windows, and schedule/eligibility rules** — reusing the Phase 2 effective-dated primitives. **No migration:** the Phase 1 config-rule tables already carry `effective_start` / `effective_end` / `metadata` and RLS already permits scoped admin/ops writes.

### Versioning model (identical discipline to rate authoring)

- Each rule type has a logical **lineage** (rows sharing scope + dimension): capacity `(scope, age, capacity_kind)`, ratio `(scope, age, jurisdiction)`, operating window `(scope, weekday)`, schedule `(scope, age)`. Each row is one effective-dated version.
- **Supersede / change-later, never overwrite:** "edit" = new version row; the prior row's `effective_end` is closed the day before (`planSupersede`). These tables have **no status / supersedes / is_active column**, so the prior-version link lives in `metadata.supersedes_id` and lifecycle status (Current / Scheduled / Superseded / Retired) is **derived** by `effectiveDatedVersioning.ts`.
- **Retire** closes the effective window (non-destructive). **Void** hard-deletes a not-yet-started version and reopens its predecessor; refused once a version was ever effective.
- **Ratio tiers version WITH their parent rule.** Tiers carry no effective dates: a new ratio version gets its own fresh tier set (carried forward from the prior version unless a new tier set is supplied); voiding a ratio version removes its tiers (explicit + FK cascade).

### Runtime components

- **`lib/childcareOperational/config/configRuleAuthoringService.ts`** — write service for all four types. A private generic engine (`supersedeRow` / `retireRow` / `voidScheduledRow`) holds the versioning invariants once; thin per-type functions supply value columns + a lineage predicate (+ ratio tier hooks).
- **`app/api/admin/operational-config/{capacity-rules,ratio-rules,operating-windows,schedule-rules}/route.ts`** — `requireAdminOrOps`-gated POST routes dispatching `create | version | retire | void`.
- **`EffectiveDatedConfigurationEditor`** — extended with an optional `extraForm` slot (structured sub-form versioned with the row) so ratio **tiers** author inside the same editor. Additive and backward-compatible with Phase 2.
- **`components/adminV2/settings/locations/`** — `ConfigRuleAuthoringGroup` (generic: groups a category's rows into lineages and renders the shared editor per lineage + an add form), `RatioTierFields` (tier sub-form), `useLocationRuleAuthoring` (write hook). `LocationOperationalRulesPanel` now hosts inline authoring for all four categories (no drawers) and keeps the resolved-per-location inheritance preview; `LocationsConfigurationPage` passes `canMutate`.

### Inheritance & scope

Org default → Location → Program → Room precedence is unchanged (the authoritative `resolveConfigRule`). Scope is authored via a scope-type selector + a scope-target ID (org scope is the common case); a richer Program/Room picker is deferred but the services already accept all four scopes, so the data model does not block future Program/Room authoring.

### Tests

- `tests/childcareOperational/config/configRuleAuthoringService.test.ts` — create / version / retire / void for all four types; ratio tier create + version (explicit + carry-forward) + tier cleanup on void; **no-value-overwrite** (prior row value unchanged after a version, only `effective_end` closes); future version; void-scheduled + predecessor reopen; validation + scope/no-tier/duplicate-tier rejections.
- `tests/childcareOperational/config/configRuleAuthoringRoutes.test.ts` — role gate, 401, unknown-action, actor wiring, and version/retire/void dispatch across all four routes; ratio tier pass-through.
- `tests/adminV2/operationalConfigurationV1Batch0.test.ts` — Phase 3 posture: four routes export gated POST; panel hosts the shared editor with **no drawer pattern**; resolved preview retained; service writes only config-rule tables. The shared mock gained the five config-rule tables.

### What remains intentionally unbuilt (Phase 3)

Program/Room **scope picker** (id-based for now); date-specific closures/holiday calendar (operating windows bound weekly only); a unified resolved-preview for operating-window/schedule resolution (capacity + ratio are previewed today). Out of scope per directive: Posting, Payments, Subsidy, Financial Responsibility, GL authoring, Attendance UI, Focus Panel, Settings IA reorg.

---

## Phase 4 — Scope Picker + Configuration QA Polish (IMPLEMENTED)

Status: shipped. A usability/QA phase — **no new backend write domain, no migration.** It replaces raw scope-target-ID entry with a labeled scope picker, makes scope/resolved displays human-readable, and polishes the Financials + Locations authoring screens. Versioned/effective-dated authoring (Phase 2/3) is unchanged.

### Scope picker
- **`ScopePicker`** (`components/adminV2/settings/configurationRuntime/ScopePicker.tsx`) — reusable, labeled picker following the inheritance model **Org default → Location → Program → Room**. It shows human labels ("Austin Campus", "Toddler"), never UUIDs, and emits a structured `ScopeSelection`. `scopeSelectionToPayload` maps it to exactly the right scoped column (`site_location_id` / `program_category_id` / `room_location_id`); `isScopeSelectionComplete` guards submission.
- **`useScopeOptions`** (read-only loader) fetches `/api/admin/locations?hierarchy=1` + program categories and returns site/program/room options (site-disambiguated labels), a short `labelFor(id)` resolver for badges, and `ageGroupOptions` (program-category keys as labeled age groups — age groups are program categories, not a free-text taxonomy).
- Applied to: **Financials** `CreateRatePlanForm` (scope + age-group selects); **Locations** add forms for capacity / ratio / operating windows / schedule via `ConfigRuleAuthoringGroup` (the picker is composed into the add-form `extraForm`, alongside ratio tiers). The Phase 3 raw `scope_target_id` text entry is gone.

### Label-aware scope display
- **`describeScopeWithLabel(row, lookup)`** (pure) renders "Org default" / "Location: Austin Campus" / "Program: Toddler" / "Room: Toddler A", falling back to the generic override label when a target label is unavailable — so **no surface shows a raw UUID**. Used on the Financials plan queue + plan workspace and on every Locations rule timeline title.

### Resolved-preview improvements
- Locations "Resolved per location" now shows, per site: the resolved **capacity value + scope source label** (inherited "Org default" vs overridden), the resolved **ratio's tier selection** + source label, and an explicit **"no rule — fallback applies"** state. The Financials plan workspace keeps its resolved-rate-per-schedule-basis preview (rate rule selection on the current version).

### Screen polish
- Locations: grouped by rule type, clearer scope-source + effective-status labels, inline authoring preserved (no drawers), resolved-per-location preview retained.
- Financials: scope labels on the plan queue + workspace, version-timeline clarity retained, nested rate-rule grouping retained, resolved-rate preview retained. Charge Preview remains a labeled read-only inspector; **GL Codes / GL Mappings remain read-only** (no safe write backend).

### Tests
- `tests/adminV2/scopePicker.test.tsx` — `scopeSelectionToPayload` emits correct `scope_type`/ids per scope; `isScopeSelectionComplete`; render tests assert the picker shows human labels (not UUIDs) and hides the target select for org scope.
- `tests/adminV2/configScopePresentation.test.ts` — `describeScopeWithLabel` label/fallback behavior (never a raw UUID).
- `tests/adminV2/operationalConfigurationV1Batch0.test.ts` (Phase 4 block) — picker reused by both domains, scope-options loader is GET-only, create form + Locations panel use picker values (no `scope_target_id`), scope shown with labels, still no drawers / no forbidden financial writes.

### What remains intentionally unbuilt (Phase 4)
A searchable/typeahead scope picker (current is a labeled dropdown — fine at small/medium scale); a unified resolved-preview for operating-window/schedule resolution (capacity + ratio + rate are previewed); date-specific closures. Out of scope per directive: Posting, Payments, Subsidy, GL write/edit, Focus Panel UI, Settings IA reorg.

---

## Financial Configuration Convergence (IMPLEMENTED)

Status: shipped. Financials is reorganized from a table browser into a decision-oriented **configuration platform** — the home every future financial capability (Billing, Scheduling, Attendance, Processing, Posting, Payments, Subsidy, Accounting) consumes. **No new backend architecture / no migration**: real authoring reuses existing tables + the generic `org_settings.metadata` store; designed areas are framed surfaces with a clear roadmap.

### Decision-oriented IA
`/settings/financials` is grouped by the get-paid lifecycle (`FINANCIALS_CONFIG_GROUPS`): **What you sell** (Services, Rate Plans) · **Money rules** (Financial Policies, Charge Templates) · **Money movement** (Accounting, Posting, Payments) · **Who pays** (Financial Responsibility, Subsidy) · **Tools** (Charge Preview), plus Overview. Each area answers "what decision is the finance administrator making?"

### Real / backed (authorable or live preview)
- **Services** — a real, authorable catalog (what the org sells) persisted to `org_settings.metadata.financials.services` via a role-gated route + pure-validated store. No new table. The foundational financial object rates/templates/posting will attach to. (`financialServicesStore.ts`, `/api/admin/financial/services`, `ServicesConfigurationPanel`.)
- **Rate Plans** — existing versioned authoring; now exposes **proration method + billing cadence** (already on the schema) as effective-dated plan settings, making the Financial Policies claim real.
- **Charge Preview — redesigned**: operators select **Child → Enrollment Agreement → Service Period** (labeled dropdowns over `/api/admin/customer-members` + `/api/admin/child-enrollment-agreements`), no UUID entry. Still preview-only over the existing read API.
- **Accounting** — resolved **Charge Category → GL Mapping → GL Account** chain (`resolveGlMapping.ts`, pure) + read-only GL accounts/mappings. GL authoring deferred (no safe write backend).
- **Demo seed** — idempotent, admin-gated `/api/admin/financial/seed-demo` applies a representative dataset (Services, GL accounts/mappings, multi-version Rate Plans with historical/current/future) to the current org so screens are never empty. Pure dataset builder is unit-tested; the route skips anything already present.

### Designed (consistent surfaces, roadmapped, no runtime)
**Financial Policies, Charge Templates, Financial Responsibility, Posting, Payments, Subsidy** each render via the shared `DesignedConfigurationSurface`: the decision they own, the configuration structure that will live there, the downstream capabilities that consume it ("Consumed by"), and the backend roadmap. They feel intentional and show exactly where a future capability plugs in without a redesign. **No posting/payments/subsidy/responsibility runtime.**

### Tests
- `tests/financials/financialConvergenceUnits.test.ts` — charge-category labels/mapping keys; GL chain resolution (mapped/unmapped/inactive); services store pure helpers (slugify/validate/dedupe/parse); demo dataset shape (versions ordered, amounts tell a story, deterministic/idempotent).
- `tests/financials/financialServicesRoute.test.ts` — role gate + create/update/set_active dispatch.
- `tests/adminV2/financialConfigConvergence.test.ts` — grouped IA, page routes every area, Services real + inline (no drawers), Charge Preview operational selectors (no UUID entry), Accounting GL chain, designed areas consistent, **no writes to money tables**, seed admin-gated + idempotent.

### What remains intentionally unbuilt
Wiring rates to attach to a Service (Services is a catalog today; rate rules still key off schedule basis — recommended next backend pass); org-level policy/charge-template authoring (designed; persists to org config next); Posting/Payments/Subsidy/Responsibility runtime; GL authoring. No Focus Panel, Attendance UI, or Settings IA reorg.
