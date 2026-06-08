# Child Model Convergence — Architecture Decision Audit

**Path:** `docs/platform_convergence/child_model_convergence_audit.md`
**Date:** 2026-06-06
**Type:** Architecture audit only. No code, no migrations, no implementation proposal, no redesign.
**Purpose:** Remove ambiguity about `inquiry_child` before runtime convergence begins.
**Companions:** [`field_catalog_convergence_audit.md`](./field_catalog_convergence_audit.md), [`runtime_convergence_inventory.md`](./runtime_convergence_inventory.md), [`layout_contract_v1.md`](./layout_contract_v1.md).

---

## FINAL DECISION (ratified) — Child Model doctrine

This is the binding outcome of the audit. It governs the companion docs (layout contract, runtime mapping, field-catalog execution plan).

**Keep `inquiry_child` at the data/runtime level; do not promote it as a product-facing layout configuration concept.**

1. **Keep `inquiry_child` as a technical/config projection** over `opportunity_customer_members` (OCM). Do not delete or sunset it now. Do not break existing **waitlist, readiness, lifecycle, or child-grain queue** dependencies that rely on it.
2. **Do not make `inquiry_child` the primary product-facing layout concept.** It is plumbing for OCM-scoped fields, not a product entity an operator "designs a layout for" as a standalone thing.
3. **Durable child truth lives on the Child / `customer_member` record** (optionally linked to `persons`). This is the durable identity the product and layouts treat as "the Child."
4. **Enrollment participation truth lives on OCM** (`opportunity_customer_members`) — the child's candidacy within a specific opportunity. OCM is the **enrollment participation layer only**, not a durable child identity.
5. **Layout configuration prefers the durable Child / Customer Member concept.** OCM-scoped fields may appear in layouts **only through an enrollment-child context** — a relationship section, repeater, or widget bound to the enrollment ↔ child participation — never as a free-standing "Inquiry Child" entity layout.
6. **Never expose raw table names** (`opportunity_customer_members`, OCM) to users.
7. **No separate "Inquiry Child" product entity. No separate inquiry-child runtime or presentation system.** `inquiry_child` remains the config/field-surface alias; it does not get its own product surface, drawer-as-entity, or parallel runtime.

The supporting analysis below (and the §RECOMMENDATION) stands; this section is the authoritative summary applied across the convergence docs.

---

## 0. Method & a correction to earlier assumptions (read first)

This audit was ground-truthed against **`origin/staging`**, not the local feature-branch checkout. That distinction matters: the working branch is ~978 commits behind staging, and a first-pass code search of the *checked-out tree* wrongly concluded that `inquiry_child` and OCM "exist only in documentation." **That conclusion is false.** On `origin/staging` (the authoritative current state) both are fully implemented:

- **Table:** `public.opportunity_customer_members` — `supabase/migrations/20260430133000_opportunity_customer_members_foundation.sql` (+ `…outcome_status_key`, `…20260519221706_add_inquiry_child_desired_start_date`, `…20260520120000_inquiry_child_desired_start_and_field_defs`, `…20260529120000_inquiry_child_field_label_convergence`, `…20260601150000_backfill_safe_ocm_lifecycle_statuses`).
- **Registry/code:** `web/lib/fields/inquiryChildFieldRegistry.ts` plus ~20 runtime modules (`inquiryChildOcmPlacementDisplay.ts`, `inquiryChildFieldEdit.ts`, `inquiryChildCustomFieldValues.ts`, `OpportunityInquiryChildrenSection.tsx`, `AddInquiryChildModal.tsx`, `addInquiryChildActionClient.ts`, …) and contract tests.
- **Allowlist:** `field-definitions` API uses `FIELD_DEFINITION_ENTITY_TYPES` which **includes `inquiry_child`**.

So the question is not "is it real?" (it is, and it is load-bearing) but "**what kind of thing is it, and should it persist as a first-class concept?**"

---

## 1. Current runtime meaning of each concept

| Concept | What it is at runtime | Authoritative source |
|---|---|---|
| **`person`** | Durable, org-wide **identity** record for any human (parent, guardian, child, staff). `persons` table: `first_name/last_name/full_name/preferred_name/email/phone/date_of_birth/status_key/archived_at`. Deduplication anchor. | `persons` (prod_baseline + migrations) |
| **`customer_member`** | Durable **household member** record: a person's membership in a `customer` (household). `customer_members`: `customer_id` (FK→customers, CASCADE), `person_id` (FK→persons, SET NULL, optional), `display_name/first_name/last_name/dob/relationship/status_key/is_active`. When `relationship='child'` (org label override renders `customer_members` as "Child/Children"), **this is the durable child record within a household.** | `customer_members` |
| **`opportunity_customer_member` (OCM)** | Durable **junction / participation** row: *this household member (child) in this enrollment inquiry (opportunity)*. `opportunity_customer_members`: `opportunity_id` (FK→opportunities CASCADE) × `customer_member_id` (FK→customer_members CASCADE), UNIQUE per `(org_id, opportunity_id, customer_member_id)`, carrying inquiry-scoped attributes: `desired_program_type`, `desired_schedule_type`, `desired_start_date`, `fit_status`, `outcome_status_key`, `location_id`, `program_room_cohort_key`, `notes`. A consistency trigger enforces `customer_member.customer_id == opportunity.customer_id`. | `opportunity_customer_members` |
| **`inquiry_child`** | **Operator-facing `entity_type` (a projection / configuration surface) over OCM** — *not a table*. Defined verbatim as *"a configurable field surface backed by `opportunity_customer_members`… operator-facing entity_type: `inquiry_child` (never expose raw table names in UX)."* It is the stable name through which child-in-inquiry fields are configured (native OCM-column manifest + custom `field_definitions`/`field_values`), laid out, and driven through lifecycle/readiness. | `web/lib/fields/inquiryChildFieldRegistry.ts` |

**One-line model:**
`person` (identity) → `customer_member` (durable child-in-household) → `OCM` (child's participation in an `opportunity`/enrollment) — and **`inquiry_child` is the operator-facing entity_type name for that OCM participation row.**

---

## 2. Classification

| Concept | Classification | Rationale |
|---|---|---|
| `person` | **Identity entity** (durable) | Canonical human identity; dedup target; `archived_at` soft-delete. |
| `customer_member` | **Business/identity entity** (durable) | The durable "Child" (or guardian) record within a household; org-labelled "Child"; optional `person_id` link. |
| `opportunity_customer_member` (OCM) | **Operational entity** (durable junction) | Represents a child's participation/candidacy in a specific enrollment; owns inquiry-scoped operational state (program/schedule/start/fit/outcome/placement). |
| `inquiry_child` | **Projection / configuration entity_type** over OCM — **not a base entity, not a throwaway artifact** | A deliberate, load-bearing operator-facing alias so child fields are configurable through the field catalog without exposing the raw `opportunity_customer_members` table name. It is presentation/config, not storage. |

**The genuine "naming artifact" is elsewhere:** three child-ish handles coexist — `child` (lifecycle palette entity key), `inquiry_child` (config/field entity_type → OCM), and `customer_member` (durable record, UI-labelled "Child"). The documented grain mismatch ("Child vs inquiry_child grain"; lifecycle `child` palette reads/writes `inquiry_child`/OCM paths via `lifecycleEntityFromFieldDefinitionEntityType`) is the real terminology tension — **not `inquiry_child` itself.**

---

## 3. Which tables own the truth

| Truth | Owning table | Notes |
|---|---|---|
| Human identity | `persons` | Durable, org-wide. |
| Durable child / household member | `customer_members` | The lasting "Child" record; survives across inquiries; optional `person_id`. |
| Child-in-inquiry participation + inquiry attributes | `opportunity_customer_members` (OCM) | Program/schedule/start/fit/outcome/placement for this opportunity. |
| Enrollment / inquiry | `opportunities` | The enrollment record. |
| `inquiry_child` | **No table** | Projection over OCM; custom fields persist in `field_definitions` + `field_values` keyed `entity_type='inquiry_child'`; native fields are OCM columns. |

Key consequence: **a child's durable identity is NOT owned by `inquiry_child`/OCM.** Durable identity is `customer_members` (+ optional `persons`). OCM owns only the *participation*, and `inquiry_child` owns only the *configurable presentation* of that participation.

---

## 4. Runtime systems depending on each concept

| System | Depends on `inquiry_child` (projection) | Depends on OCM (table) | Depends on `customer_member` / `person` |
|---|---|---|---|
| **Field catalog / Settings → Fields** | **Yes** — `entity_type='inquiry_child'` allowlisted; native OCM-column manifest (`INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS`) + custom `field_definitions`; reserved-key guard (`isReservedInquiryChildFieldKey`). | Yes (native columns) | Custom child fields also merge from `field_definitions`. |
| **Layouts** | **Yes** — Layout V2 child / child_inquiry groups are directed to read `entity_type: inquiry_child` (today still partly `CURATED_FIELDS`). | Indirect | — |
| **Lifecycle / readiness** | **Yes** — Child palette + Required Information V2 readiness evaluator bind to `inquiry_child`/OCM; `outcome_status_key`, OCM lifecycle statuses. | Yes | Parent/guardian via person. |
| **Queues / waitlist** | **Yes** — placement labels, OCM placement display, candidate/child-grain (`enrichInquiryChildrenPlacementLabels`, `inquiryChildOcmPlacementDisplay`, `program_room_cohort_key`, waitlist candidate presentation). | Yes (rows are OCM-derived) | Household context via customer. |
| **Forms / drawer** | **Yes** — `OpportunityInquiryChildrenSection`, `AddInquiryChildModal`, `inquiryChildFieldEdit`, `inquiryChildCustomFieldValues`. | Yes | Person open from inquiry child (`inquiryChildPersonOpen`). |
| **Tasks / actions** | **Yes** — `addInquiryChildActionClient`, `submitAddInquiryChildFromDrawer`, registry actions; action preflight (move to waitlist, schedule tour, approve enrollment). | Yes | — |
| **Communications** | Indirect — comms target person/opportunity; child participation gates readiness → actions that trigger comms. | Indirect | Yes (person). |
| **Documents** | Indirect — documents attach to opportunity/person; not `inquiry_child`-keyed. | Indirect | Yes. |

`inquiry_child` is depended on **broadly across the configuration & lifecycle plane** (catalog, layouts, lifecycle, readiness, queues/waitlist, forms, tasks). OCM is depended on as the **data plane** beneath it. Communications/documents depend only **indirectly** (via opportunity/person).

---

## 5. If `inquiry_child` disappeared tomorrow — what breaks (be specific)

Distinguish two very different deletions:

**(a) Remove the OCM table (`opportunity_customer_members`)** — catastrophic:
- No representation of *which children are in an inquiry*, or their `desired_program_type / desired_schedule_type / desired_start_date / fit_status / outcome_status_key / location_id / program_room_cohort_key`.
- **Waitlist & placement break** (candidate/child-grain rows, placement labels, cohort).
- **Per-child readiness breaks** (Required Information V2 evaluates child fields on OCM).
- **Child-grain queues break**; **enrollment lifecycle actions break** (approve enrollment, move to waitlist, record tour outcome reference OCM state).
- Inquiry drawer "Children" section, Add-Inquiry-Child action, and child field editing break.

**(b) Remove only the `inquiry_child` entity_type name (keep OCM)** — degrades configurability:
- **Settings → Fields loses the child surface**; custom child fields (`field_definitions`/`field_values` keyed `inquiry_child`) become unreachable for configuration.
- **Layout V2 child groups lose their source** and regress to hardcoded `CURATED_FIELDS`.
- **Lifecycle Child palette loses its field bindings** (`lifecycleEntityFromFieldDefinitionEntityType` has nothing to map).
- The only alternatives are (i) expose the raw `opportunity_customer_members` table name in operator UX — **explicitly rejected** by the registry contract — or (ii) revert to pre-convergence hardcoded child fields, **the exact state this sprint exists to eliminate.**

Conclusion: the **data** survives without the *name*, but the **convergence goal (config-driven child fields/layouts/lifecycle) does not.** `inquiry_child` is the configuration handle that makes child presentation governable.

---

## 6. Can the platform operate as Person → Customer Member / Child → Opportunity → OCM, without `inquiry_child` first-class?

**At the data layer: yes — that chain already is the model.** `persons`, `customer_members`, `opportunities`, and `opportunity_customer_members` are the real tables; `inquiry_child` adds no storage.

**At the configuration/presentation layer: not without regression.** Something must be the stable, operator-facing handle for "child fields within an inquiry," because:
- The field catalog, Settings, Layout V2, lifecycle palette, and readiness all key off an `entity_type` string, and
- The contract forbids exposing the raw table name (`opportunity_customer_members`) in UX.

`inquiry_child` *is* that handle. Removing it forces either raw-table exposure or hardcoded fields. So the chain operates, but `inquiry_child` is the seam that keeps OCM **configurable** rather than hardcoded. It is first-class **as a projection entity_type**, not as a table.

---

## 7. Is `inquiry_child` A / B / C / D?

- **Not A** (permanent business *entity*): it has no table and owns no durable identity; durable truth is `customer_members` (+ `persons`).
- **Not B** (temporary runtime projection): it is not temporary — it is the stable, current, deliberately-named configuration surface; nothing schedules its removal.
- **Not C** (legacy naming problem): `inquiry_child` itself is intentional and load-bearing. (The naming problem is the *`child` vs `inquiry_child` vs `customer_member` "Child"* triplication — adjacent to, not identical with, `inquiry_child`.)
- **→ D — Something else: a durable, intentional operator-facing `entity_type` PROJECTION over the OCM junction table.** It is a "configuration/presentation entity": the UX-safe name for *a child within an enrollment inquiry*, decoupled from the raw table name, through which fields/layouts/lifecycle/readiness are configured. Storage lives in OCM (native) + `field_definitions`/`field_values` (custom).

---

## RECOMMENDATION

### KEEP `inquiry_child`

Keep it **as what it already is** — a projection / operator-facing `entity_type` over `opportunity_customer_members` — and do **not** promote it to its own table, and do **not** sunset it.

**Evidence (current architecture, not a future redesign):**
1. **It is implemented and load-bearing on staging**, not a doc artifact: OCM foundation + 5 follow-on migrations; `inquiryChildFieldRegistry.ts` + ~20 runtime modules + contract tests; allowlisted in the field-definitions API.
2. **Truth ownership is already correct and would not change:** durable identity in `customer_members`/`persons`; participation + inquiry attributes in OCM; `inquiry_child` owns only configuration/presentation. Sunsetting it does not simplify the data model (it has no table to drop).
3. **Sunsetting regresses the convergence goal:** it would orphan child field configuration (Settings → Fields), Layout V2 child groups, the lifecycle Child palette, and per-child readiness — forcing either raw table-name exposure in UX (contract-forbidden) or a return to hardcoded child fields.
4. **It satisfies the design constraint** that operator UX never exposes raw table names — exactly the role a projection entity_type should play.
5. **Broad, real runtime dependency** across catalog, layouts, lifecycle, readiness, queues, waitlist, forms, and tasks (§4) — removal is high-blast-radius with no offsetting benefit.

**Bounded clarifications that accompany KEEP (per §FINAL DECISION; terminology/doctrine only — not implementation):**
- Document `inquiry_child` canonically as a **projection entity_type over OCM**, not a base entity, so it is never mistaken for a durable child identity.
- **Do not promote `inquiry_child` as the primary product-facing layout concept.** Layout configuration prefers the durable **Child / Customer Member**; OCM-scoped fields appear in layouts only via an **enrollment-child context** (relationship section / repeater / widget), never as a standalone "Inquiry Child" entity layout, and never by exposing the raw OCM table name.
- Resolve the **`child` (lifecycle) vs `inquiry_child` (config) grain naming** so both converge on one operator-facing term (the documented "Child vs inquiry_child grain" gap).
- Hold the line that **durable child identity stays in `customer_members` (+ optional `persons`)**; any future durable "child profile" fields belong there, while **inquiry-scoped** child fields remain on OCM via `inquiry_child`.

**Net:** `inquiry_child` is not a historical accident to remove; it is the configuration seam that makes the OCM participation layer governable. Keep it as a projection, keep durable child truth in `customer_members`/`persons`, and converge the surrounding `child`/`inquiry_child` naming. Runtime convergence may proceed on that basis.

---

*End of Child Model Convergence Audit. Architecture audit only; reflects `origin/staging` as of 2026-06-06.*
