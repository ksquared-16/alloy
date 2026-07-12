# Commercial Platform V1 — Canonical Architecture

**Status:** ✅ **SHIPPED & FROZEN** (V1 complete, 2026-07-03) — merged to `staging` via PR #65 (`06e5ad917`).
**Scope:** The commercial configuration platform an operator uses to define *what their childcare business sells and charges for*.
**Canonical:** This is the single source of truth for Commercial Platform architecture. It supersedes the pre-primitive [commercial-configuration.md](../modules/commercial-configuration.md) and consolidates the shipped state of the sprint proposals ([model-v2-reframing](../../sprints/active/commercial-model-v2-reframing.md), [language-bible](../../sprints/active/commercial-language-bible.md), [experience-01](../../sprints/active/commercial-configuration-experience-01-programs-tuition.md)).
**Detailed reference:** [ownership-model.md](ownership-model.md) holds the exhaustive per-table/API detail; this doc is the architectural overview and entry point.

> **Freeze notice.** Commercial Platform V1 is frozen. Future phases (Billing, Policies, Funding, Simulator) **consume these primitives — they do not redesign them.** Changing an entity's shape or ownership requires an explicit new sprint and a superseding doc, not an in-place edit.

---

## 1. Domain ownership (as shipped)

| Domain | Owns | Status |
|---|---|---|
| **Programs** | Programs, Program Offerings, Program Offering Variants | ✅ Shipped |
| **Commercial** | Commercial Products, Commercial Categories, Commercial Rates (tuition), Billing Frequencies, Revenue Categories | ✅ Shipped |
| **Accounting** | GL Accounts (chart of accounts), Revenue Category → GL Account mappings | ✅ Shipped (V1 mapping; posting deferred) |
| **Billing** | Charge generation, posting, deposit refund lifecycle, package consumption | 🔜 Future |
| **Policies** | Conditional rules — waivers, auto-apply, discounts, proration | 🔜 Future |
| **Funding** | Multi-payer — subsidy, voucher, corporate splits | 🔜 Future |
| **Simulator** | Consumes all of the above to model outcomes | 🔜 Future |

**Boundary rule:** Commercial *defines what a charge is*. Accounting *decides where it posts*. Billing *executes*. Policies *condition*. Funding *splits*. Simulator *reads*. No domain reaches across these lines.

---

## 2. Entity relationships

```
Programs domain
  location_program_categories (program_key)         ← a Program
      └─ program_offerings        (attendance type: Full Day, Part Day, Drop-In, …)
            └─ program_offering_variants  (quantity: 2 days/wk, 5 days/wk, or transparent default)

Commercial domain
  commercial_tuition_rates   (variant_id × cadence_key × payer_type × location_id)   ← matrix-priced tuition
  billing_cadences           (frequency option set: weekly, monthly, …)
  commercial_products        (the primitive: fee | addon | deposit, by behavior)
      ├─ category_id          → commercial_categories        (merchandising groups)
      └─ revenue_category_id  → commercial_revenue_categories (accounting reference)
  commercial_categories       (operator-managed product groups)
  commercial_revenue_categories (label + mapped_gl_account_id)

Accounting domain (existing primitive, reused)
  gl_accounts                (chart of accounts: code, name, type)
  gl_account_mappings        (semantic key → account; used by the posting resolver — V2 bridge)

Mapping chains:
  Commercial Product → Revenue Category → GL Account
  Tuition Rate       → Revenue Category → GL Account   (column present; UI wiring is V2)
```

### The two commercial spines
1. **Enrollment / Tuition** — matrix-priced: Program → Offering → Variant → **Commercial Rate** (`commercial_tuition_rates`), scoped by cadence × payer × location.
2. **Catalog** — everything else you charge for: **Commercial Products** (fees, add-ons, deposits) in one unified list.

Both spines reference **Revenue Categories**, which map to **GL Accounts**.

---

## 3. Commercial Product — the platform primitive

**Fee, Add-on, and Deposit are not three entities. They are one `commercial_product` differentiated by `commercial_type` + typed `behavior` jsonb.**

| `commercial_type` | `behavior` shape | Example |
|---|---|---|
| `fee` | `{ required: boolean }` | Registration, materials, late pickup |
| `addon` | `{ package?: { unit_count, unit_type, expires_days } }` | Extended care, lunch, 5-session pass |
| `deposit` | `{ refundable, apply_to_balance, due_timing }` | Enrollment deposit |

### Why it became the primitive
- ~80% of every fee/addon/deposit row was identical (name, scope, amount, effective dates, revenue category, cadence, active, metadata). The differences were **billing behaviors, not structure**.
- Unifying passed all three primitive tests: **shared identity**, **differences-as-values**, and **downstream simplification** — Billing gets one input contract instead of three.
- The `commercial_type` discriminator is **open**: future charge types (tuition credit, sibling discount, scholarship, late fee) become new type values + behavior blocks, **not new tables or new UI sections**.
- Tuition is the tell: `commercial_tuition_rates` is also a priced, scoped, effective-dated commercial thing — just matrix-priced. The long-term convergence is *Commercial Product with a pricing strategy* (flat vs matrix). Establishing the primitive now is what makes that convergence possible later. **(Convergence is deferred — not V1.)**

---

## 4. Configuration flow (operator's mental model)

```
1. Programs & Tuition
   Define programs → offerings (Full Day, …) → variants (5 days/wk, …) → set rates in the matrix.

2. Catalog
   "What else do I charge for?"  → Add item → pick behavior (Fee / Add-on / Deposit)
   → price, frequency, scope, category, revenue category.

3. Accounting
   GL Accounts (create/edit/archive chart of accounts)
   Revenue Categories (create, map each → GL account)
   Mapping Review (unmapped categories flagged; product → category → GL chain)
```

**Language doctrine:** the operator configures *their business*, not database records. Human labels only — "Frequency" not "cadence", "One-time / Monthly" not enum keys, "At enrollment" not `at_enrollment`, program labels not `program_key`. No `Service`, `Rate Plan`, `dimension`, `GL code`, or `obligation` in the UI.

---

## 5. Implementation status

| Capability | Status |
|---|---|
| Programs / Offerings / Variants | ✅ Shipped |
| Tuition rate matrix (variant × cadence × payer × location) | ✅ Shipped |
| Billing frequencies (option set) | ✅ Shipped |
| Commercial Products (fee/addon/deposit primitive + behavior) | ✅ Shipped |
| Commercial Categories (operator-managed) | ✅ Shipped |
| Revenue Categories | ✅ Shipped |
| GL Accounts (reuse existing `gl_accounts`, operable CRUD) | ✅ Shipped |
| Revenue Category → GL Account mapping + Mapping Review | ✅ Shipped |
| Catalog product references configured Revenue Category (no free-form GL) | ✅ Shipped |
| Bend Pine visual language (token bridge) | ✅ Shipped (Phase 0) |
| Charge generation / posting | 🔜 Billing |
| Conditional rules (waivers, discounts, proration) | 🔜 Policies |
| Multi-payer splits (subsidy, voucher, corporate) | 🔜 Funding |
| Outcome simulation | 🔜 Simulator |
| Tuition Rate → Revenue Category **UI wiring** | 🔜 next (column exists) |

---

## 6. Intentionally deferred (do NOT build without a new sprint)

- **Tuition ↔ Commercial Product convergence** — tuition stays Program→Offering→Variant→Rate. Long-term it may become a Commercial Product with matrix pricing; not V1.
- **Billing execution** — charge generation, posting, deposit refund lifecycle, package consumption.
- **Policies** — conditional application, waivers, discounts, proration.
- **Funding** — multi-payer split logic. (`payer_type` exists on rates to support it later; no split logic built.)
- **Simulator** — consumes all primitives to model revenue outcomes.
- **`gl_account_mappings` bridge** — optionally route Commercial revenue categories through the existing posting resolver (V2).
- **Legacy table removal** — `commercial_fees/addons/deposits` remain transitional; their destructive removal is a separate, explicitly-approved PR.

---

## 7. Migration history (staging `ikaxilmwmrmbagoidedu`)

| Version | Migration | What |
|---|---|---|
| 20260630120000 | commercial_tuition_rates | Tuition rate table |
| 20260630130000 | commercial_tuition_not_offered | `not_offered` semantics |
| 20260702000001 | commercial_billing_cadences_seed | Frequency option set |
| 20260702000002 | commercial_tuition_rates_v2 | Rate refinements |
| 20260702000003 | program_offering_variants | Variant model (offering→variant re-root) |
| 20260702000004 | rate_effective_dates | Effective dates on rates |
| 20260710000001 | commercial_fees_addons_deposits | Legacy 3-table fees/addons/deposits |
| 20260710000002 | commercial_fees_addons_deposits_v2 | Free-text types, effective dates, packages |
| 20260711000001 | commercial_products_primitive | **Commercial Product** + Commercial Categories + backfill |
| 20260712000001 | commercial_revenue_categories | Revenue categories |
| 20260713000001 | commercial_accounting_v1 | (superseded) — created duplicate `commercial_gl_accounts` |
| 20260713000002 | commercial_accounting_v1_reuse_gl_accounts | **Correction** — reuse `gl_accounts`, drop duplicate |

**Ledger note:** several of these were applied out-of-band via `psql` and reconciled into `supabase_migrations.schema_migrations` on 2026-07-13 (backup: `_ledger_bak_20260713`). **Do not run `supabase db push --include-all`.** See [ownership-model.md](ownership-model.md#migration) for the full ledger-alignment record. Legacy `commercial_fees/addons/deposits` are transitional; `commercial_gl_accounts` was corrective-removed because `gl_accounts` already existed.

---

## 8. Roadmap — remaining Commercial work

```
✅ Commercial Platform V1 (Programs, Tuition, Catalog, Categories, Frequencies,
   Revenue Categories, GL Account integration) — SHIPPED & FROZEN

🔜 Billing      — charge generation, posting, deposit lifecycle, package consumption
🔜 Policies     — waivers, auto-apply, discounts, proration
🔜 Funding      — multi-payer splits (subsidy / voucher / corporate)
🔜 Simulator    — consumes all primitives to model outcomes
```

Each future phase **builds on** the V1 primitives above. Billing is next.

---

## 9. Security model (RLS)

Every Commercial V1 table is an **operator-facing, org-scoped configuration table** and uses the platform's standard **org-scoped Row-Level Security** — the identical 5-policy shape shared by `commercial_tuition_rates`, `program_offerings`, `program_offering_variants`, `gl_accounts`, and `location_program_categories`. There is one policy style across the platform; Commercial does not introduce a variant.

**The 5-policy doctrine** (via `has_org_role(org_id, ARRAY[...])`):

| Policy | Command | Roles allowed |
|---|---|---|
| `<t>_select_org` | SELECT | owner, admin, ops, manager |
| `<t>_insert_org` | INSERT (WITH CHECK) | owner, admin, ops |
| `<t>_update_org` | UPDATE (USING + CHECK) | owner, admin, ops |
| `<t>_delete_org` | DELETE | owner, admin |
| `<t>_all_service_role` | ALL | service_role (`true`/`true`) |

**Why this model — table by table:**

| Table | Classification | Security | Rationale |
|---|---|---|---|
| commercial_products | Operator-facing config | RLS (5-policy) | Operators configure catalog products; org-scoped, must not leak across orgs |
| commercial_categories | Operator-facing config | RLS (5-policy) | Operator-managed merchandising groups |
| commercial_revenue_categories | Operator-facing config | RLS (5-policy) | Operator-managed; maps to GL accounts |
| commercial_tuition_rates | Operator-facing config | RLS (5-policy) | Already conformant (shipped correct) |
| program_offerings | Operator-facing config | RLS (5-policy) | Already conformant |
| program_offering_variants | Operator-facing config | RLS (5-policy) | Already conformant |
| commercial_fees / addons / deposits | Transitional (legacy) | RLS (5-policy) | No longer UI-written, but hold org data — hardened for defense-in-depth and consistency |
| gl_accounts / gl_account_mappings | Accounting-owned | RLS (5-policy) | Owned by Financials; already conformant — not modified here |
| Billing cadences | Platform config infra | RLS (via `option_sets`/`option_set_items`) | Not a Commercial table — cadences are seeded into the shared option-set system, already RLS-secured; out of Commercial's scope |

**Access model:** the admin API always uses the **service-role client** (`createAdminClient` → `SUPABASE_SERVICE_ROLE_KEY`, which has `BYPASSRLS`), so RLS is transparent to admin workflows. RLS is **defense-in-depth**: it guarantees that even if a table were reached with an `authenticated` or `anon` key via PostgREST, rows are gated by `has_org_role`, preventing cross-org access. No table is left "API-only without RLS" — that was the V1 gap this audit closed.

**Audit correction (2026-07-14):** the newer catalog tables (`commercial_products`, `commercial_categories`, `commercial_revenue_categories`, `commercial_fees`, `commercial_addons`, `commercial_deposits`) shipped **without RLS** while their siblings had it. Migration `20260714000001_commercial_catalog_rls_hardening.sql` brought them to the standard 5-policy set. No policy-style divergence introduced.

## 10. Related documents
- [ownership-model.md](ownership-model.md) — exhaustive per-table / per-API reference + migration ledger record.
- [commercial-operating-model.md](../core/commercial-operating-model.md) — business-model doctrine (what, not how).
- [operational-commercial-integration.md](../core/operational-commercial-integration.md) — Operational Consumption ↔ Commercial contract (feeds Billing).
- [commercial-configuration.md](commercial-configuration.md) — ⚠️ superseded (pre-primitive); kept for history.
- Sprint rationale (shipped): [model-v2-reframing](../../sprints/active/commercial-model-v2-reframing.md) · [language-bible](../../sprints/active/commercial-language-bible.md) · [experience-01](../../sprints/active/commercial-configuration-experience-01-programs-tuition.md).
