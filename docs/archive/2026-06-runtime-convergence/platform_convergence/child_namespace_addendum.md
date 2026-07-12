# Child Namespace Addendum (naming only)

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/child_namespace_addendum.md`
**Status:** Bounded addendum — **clarifies naming only.** Does **not** reopen the Child Model decision.
**Frozen (do not revisit):** [`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION. Person / Customer Member / OCM / `inquiry_child` roles are settled.
**Companions:** [`entity_relationship_reference_model.md`](./entity_relationship_reference_model.md), [`field_catalog_execution_plan.md`](./field_catalog_execution_plan.md).
**Scope:** No code, no migrations, no implementation. This addendum fixes *which name means what* and *which names appear where*.

> Note: `field_catalog_phase0_report.md` is referenced by the task but is **not present on `origin/staging`**; this addendum relies on `field_catalog_execution_plan.md` and `field_catalog_convergence_audit.md` for the refKey-drift facts.

---

## 1. Canonical names (the decisions)

| Meaning | Canonical name | Nature |
|---|---|---|
| **Operator-facing label** | **Child** (plural "Children") | User-facing display only |
| **Durable model / entity** | **`customer_member`** | Internal — durable child/household-member record (optionally linked to `persons`) |
| **Enrollment participation** | **OCM** (`opportunity_customer_members`) | Internal — the child's participation in an opportunity |
| **Technical / config projection** | **`inquiry_child`** | Internal — field-catalog `entity_type` projection over OCM |
| **Layout context label** | **enrollment-child context** | The layout pattern (relationship_section / repeater / widget) through which OCM-scoped child fields appear |

These five names are **the only sanctioned vocabulary** for child concepts. Anything else is drift.

---

## 2. User-facing vs internal

**User-facing (operator UX) — exactly one word:** **Child** / **Children**.
- All operator surfaces (labels, drawers, queues, settings) display **Child**, regardless of which internal model backs the data.

**Internal only (never shown in UX):** `customer_member`, `opportunity_customer_members` / **OCM**, `inquiry_child`, and any table/column/refKey names.
- Per the Child Model decision, **raw table names are never exposed**. `inquiry_child` is a config/catalog identifier, not a product-facing entity.
- "enrollment-child context" is an **internal architecture term** (used in docs/reviews), not a UX label.

---

## 3. Deprecated name in new layout docs: `child_inquiry.*`

`child_inquiry` is a **legacy layout refKey namespace** (e.g. `child_inquiry.desired_start_date`). It drifts from the registry `entity_type` (`inquiry_child`) and from durable child fields (`child.*`).

- **Do not introduce new `child_inquiry.*` refKeys** in any new LayoutDoc, default layout, or curated list.
- Treat `child_inquiry.*` as **deprecated-on-write**: flag it in convergence review; prefer the canonical refKeys in §4.
- Existing `child_inquiry.*` keys are **not hard-renamed** now — they bridge by alias (§5).

`inquiry_child` (the catalog `entity_type`) and "enrollment-child context" (the layout pattern) are **not** deprecated — they are canonical internal names. Only the `child_inquiry.*` **refKey namespace** is deprecated.

---

## 4. RefKey convention — how to avoid `child_inquiry.*` drift

New layout refKeys follow the registry-aligned form `{entity_type}.{field_key}` (singular entity type matching the catalog), per `field_catalog_execution_plan.md` §"Stable refKey convention". Two child namespaces, chosen by **source of truth**, never a third:

| Use this refKey | When the field is… | Backed by |
|---|---|---|
| **`child.*`** (e.g. `child.name`, `child.date_of_birth`) | a **durable child** attribute (operator-facing Child) | `customer_member` (optionally `persons`) |
| **`inquiry_child.*`** (e.g. `inquiry_child.desired_start_date`, `inquiry_child.program_room_cohort_key`, `inquiry_child.outcome_status_key`) | an **OCM-scoped participation** field, surfaced via **enrollment-child context** | OCM (`opportunity_customer_members`) |
| ~~`child_inquiry.*`~~ | — | **deprecated** → use `inquiry_child.*` |

Rules:
- **Durable child fields → `child.*`.** **OCM participation fields → `inquiry_child.*`.** Never mint a new `child_inquiry.*`.
- OCM-scoped (`inquiry_child.*`) fields appear in layouts **only through an enrollment-child context** block (relationship_section / repeater / widget) — never as standalone child columns and never exposing OCM names (per the relationship/reference doctrine and the Child Model decision).
- A refKey is an **internal identifier**; its operator-facing label is still **Child**.

---

## 5. Bridging existing code without immediate migration

This is a **naming convention**, not a rename event. Existing `child_inquiry.*` refKeys and curated lists keep working:

- **Alias-on-read.** Normalize `child_inquiry.* ≡ inquiry_child.*` at the refKey-parse / value-resolution layer (the existing parser, e.g. where `resolveItemValue` / catalog refKey parsing already runs). Old keys resolve via the alias; no stored data changes.
- **Deprecate-on-write.** New layout docs, defaults, and curated entries use the §4 canonical refKeys. Convergence review flags new `child_inquiry.*`.
- **No migration now.** No data migration, no renaming of existing field-definition keys, no schema change. The `field_catalog_execution_plan.md` task that maps `child_inquiry → inquiry_child` remains the eventual convergence step; until it lands, the alias bridges.
- **Curated lists stay curated until catalog adoption.** Where `child` / `child_inquiry` groups still return curated code lists (flag-gated preview), they may keep current keys behind the alias; new entries use canonical names.

Net: old keys bridge silently; new keys are canonical; nothing must migrate today.

---

## 6. One-line summary

> Show **Child**. Store the durable record as **`customer_member`**, the participation as **OCM**, and the config projection as **`inquiry_child`**. In layouts, use **`child.*`** for durable child fields and **`inquiry_child.*`** for OCM fields via **enrollment-child context** — never new **`child_inquiry.*`**, which bridges by alias until the planned cleanup.

---

*Naming addendum only. Does not reopen the Child Model decision; introduces no entity, runtime, or migration.*
