---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — Doctrine Convergence Certification

**Status:** Canonical convergence record (2026-07-13). Certifies that the Alloy documentation corpus
carries **one consistent ontology** after the frozen Operational Expectations two-ledger architecture.
**Scope:** documentation only — no architecture change, no implementation change, no new concepts. The
frozen architecture is [`../operational-expectations-system-design.md`](../operational-expectations-system-design.md).

> **What changed, in one sentence.** The word **"Expectation" is now reserved for the authored
> Operational Expectations ledger** (intended truth); the derived truth-flow layer formerly called
> **"L3 Operational Expectations"** is renamed **"L3 Operational Projections,"** and **Law 2** is
> rewritten from *"Expectations are derived"* to *"Projections are derived / Expectations are
> authored."*

---

## 1. Every conflicting doctrine

The conflict surface was narrow and concentrated. Two conflict classes were found; a third class
(false-positive mentions) was verified and deliberately left untouched.

### Class A — the Law-2 conflict (Expectation-as-derived doctrine)

| Doc | Lines | Conflict | Disposition |
|---|---|---|---|
| `core/operational-truth-flow-doctrine.md` | L3 heading, mermaid, axis flow, §"four ratified laws" (Law 2), capability table, "what not to do", update-trigger | **Anchor.** L3 named "Operational Expectations — derived"; **Law 2** = "Expectations are derived / non-authoritative." Direct inverse of the frozen authored ledger. | **Rewritten in place** + reconciliation note. Law 2 rewritten. |
| `core/operational-ux-doctrine.md` | 16, 218 | Truth-flow axis printed as "…Intent → Expectations → Facts…"; parenthetical "Expectations are derived/non-authoritative." | Axis relabeled to "…→ Projections → Facts…"; parenthetical rewritten. |
| `rfcs/operational-expansion-phase1.md` | 40, 112, 122, 211, 221, 235, 252 | Derived category **"Expectation (L3)"** coexisting with a distinct **"Projection"** primitive; "Law 2 (expectations derived)". | Reconciliation note + derived-"Expectation" renamed **"Projection (expected-state, L3)"**; the distinct "Projection" primitive **preserved**. |
| `modules/attendance-system.md` | 12, 48, 53, 58, 118, 121, 140 | "compared against L3 Expectations"; "Expectation read models"; heading "Expectations vs Facts"; "materialized expectation." | Concept prose → **Projection**; heading → "Projections vs Facts." Code identifiers preserved (see §4). |
| `modules/financial-platform-domain.md` | 14 | Layer model "…L3 Expectations…". | Relabeled "L3 Projections" + disambiguation clause. |
| `modules/billing-financials-platform.md` | 12 | "targets L3 Expectations (expected tuition/revenue)". | Relabeled "L3 Projections". |
| `audits/active/operational-expansion-architecture-audit-2026-07.md` | 19, 29, 205 | Active audit prints "L3 Expectations (derived)" in prose, table, and mermaid. | Reconciliation note + label renamed "L3 Projections (derived)." (Historical body otherwise intact.) |

### Class B — terminology-map absence

| Doc | Conflict | Disposition |
|---|---|---|
| `governance/glossary.md` | No canonical definition of the two-ledger terms; the map that fixes "Expectation vs Projection" did not exist. | **Added** an "Operational Truth (two-ledger ontology)" section (the authoritative terminology map). |

### Class C — verified NON-conflicts (deliberately not changed)

| Doc(s) | "expectation" usage | Why left as-is |
|---|---|---|
| `foundation/capability-model-doctrine.md` | "API-first **expectation**" (×9) | Plain English ("the expectation for new modules"); not the ontology term. |
| `modules/business-process-execution-platform.md` | "**readiness expectations**", `readiness_expectations` field | A distinct Business-Process stage concept + a code/config field name — **not** L3 derived state and **not** the authored ledger. Renaming a config field is implementation, out of scope. Flagged in §4 as a reserved local term. |
| `operator/operator-story.md`, `operator/card-interaction-expansion-doctrine.md` | "experience expectations", "back behavior expectations" | Plain English. |

---

## 2. Exact reconciliation

### 2.1 The rewritten Law 2 (verbatim, now canonical in `operational-truth-flow-doctrine.md`)

> **2. Projections are derived / non-authoritative — Expectations are authored.** L3 **Projections**
> are computed from L1+L2 (and L4 for forecasting); materialized snapshots are permitted only as a
> clearly non-authoritative, recomputable cache — never a system of record. The word **"Expectation"
> is reserved for the authored Operational Expectations ledger** (intended truth, "what SHOULD / WILL
> be"), which — like the Operational Facts ledger — **is authoritative and is not derived from any
> other layer.** Never treat an L3 Projection as an Expectation, and never treat the Expectations
> ledger as a derived projection.

### 2.2 The layer rename

- `L3 Operational Expectations (derived)` → **`L3 Operational Projections (derived)`** — everywhere:
  the layer heading, the mermaid node, the two-axis flow (`Configuration → Intent → Projections →
  Facts → Consequences`), the capability-mapping table header, the "what not to do" guardrail, and
  the update-trigger line.
- The **"Expected X" quantities** (expected attendance/occupancy/staffing/ratios/tuition/subsidy/
  revenue) are retained as the *names of projected values*; they are Projections. Only the **layer
  noun** changed.

### 2.3 The RFC's dual taxonomy (handled without collapsing rows)

The RFC listed **Expectation** and **Projection** as two distinct derived categories. To avoid a
lossy merge, the derived **"Expectation (L3)"** category was renamed **"Projection (expected-state,
L3)"**; the pre-existing generic **"Projection"** primitive (Operational-Calculations descriptor)
was left untouched. Both are now clearly Projections (derived state).

### 2.4 Additive reconciliation notes

Per house governance pattern, each edited doctrine carries a dated **"Reconciliation note (2026-07-13,
Operational Expectations two-ledger freeze)"** blockquote linking the frozen system design, so the
change is auditable and self-explaining in place. `last_reviewed` bumped to `2026-07-13` on every
edited governed doc.

---

## 3. Cross-document consistency report

**Convergence targets (edited): consistent.**

| Doc | Status | Result |
|---|---|---|
| `core/operational-truth-flow-doctrine.md` | canonical | ✅ Law 2 rewritten; L3 = Projections; note added |
| `core/operational-ux-doctrine.md` | canonical | ✅ axis + parenthetical converged |
| `rfcs/operational-expansion-phase1.md` | canonical (body: frozen/approved) | ✅ note + expected-state Projection rename; primitive preserved |
| `modules/attendance-system.md` | canonical | ✅ comparison contract = Projections vs Facts |
| `modules/financial-platform-domain.md` | canonical | ✅ layer model = L3 Projections |
| `modules/billing-financials-platform.md` | canonical | ✅ variance target = L3 Projections |
| `governance/glossary.md` | canonical | ✅ two-ledger terminology map added |
| `audits/active/operational-expansion-architecture-audit-2026-07.md` | active audit | ✅ note + label rename |

**Listed areas with no derived-Expectation usage (verified consistent by absence — nothing to
rename, no contradiction present):**

| Area | Doc | Result |
|---|---|---|
| Record System | `core/record-system.md` | ✅ 0 hits — consistent |
| Entity Model | `core/entity-model.md` | ✅ 0 hits — consistent |
| Status & State | `core/status-and-state-system.md` | ✅ 0 hits — consistent |
| Configuration | `modules/configuration-platform.md` | ✅ 0 hits — consistent |
| AI | `modules/ai-platform.md` | ✅ 0 hits — consistent |
| Surface Builder | `experience/surface-composer.md` | ✅ 0 hits — consistent |
| Current Work | `operator/current-work-surface.md` | ✅ 0 hits — consistent (Current Work = surface over unresolved gaps; may later add a forward-reference to the gap derivation — not a conflict) |
| Platform Capabilities | `foundation/platform-capabilities.md` | ✅ 0 hits — consistent (uses "virtual projections" correctly) |
| Product Roadmap | `foundation/product-roadmap.md` | ✅ 0 hits — consistent |
| Release History | `foundation/release-history.md` | ✅ 0 hits — consistent (already frames Operational Fact contract correctly) |
| Business Processes | `core/business-process-system.md` | ✅ 0 derived-Expectation hits — consistent |

**Full-tree scan (all `docs/**`, excluding archive/sprint/historical):** no surviving
"Expectations are derived," "L3 Expectations," or "Intent → Expectations" doctrine statement remains.
The only matches are the intentional reconciliation/warning text.

---

## 4. Updated terminology map

Canonical, locked. Also recorded in `governance/glossary.md`.

| Term | Meaning | Authority |
|---|---|---|
| **Operational Facts** | Authored ledger — **observed** truth, "what IS." | Authoritative ledger |
| **Operational Expectations** | Authored ledger — **intended** truth, "what SHOULD / WILL be." Tuple ⟨Authority · Modality · Subject · Condition · Temporal Frame · [Beneficiary]⟩; modality ∈ {required, prohibited, intended, committed, predicted}. | Authoritative ledger |
| **Judgment** | Derived comparison between Facts and Expectations. | Derived |
| **Gap** | Derived operational difference; read-only. | Derived |
| **Projection** | Derived operational state / read model (the former "L3 Operational Expectations"). Includes "Expected X" values, **Scheduling** (projection over committed expectations), **Forecasting** (projection over predicted expectations). | Derived |
| **Billing** | Financial **Projection** + financial **effector**. | Derived + effector |

**Retired usages (must not reappear):** "Operational Expectations (derived)", "L3 Expectations",
"Expectations are derived", "Intent → Expectations → Facts."

**Reserved / carve-outs (intentionally not renamed):**

- **Code identifiers** — `scheduleExpectationCore.ts`, `fetchScheduleExpectations`,
  `buildScheduleExpectations`, `loadOperationalExpectationInputs.ts`, `fetchExpectedVsActual.ts`,
  `expectations/*`. These denote **L3 Projections**; renaming them is an **implementation** concern,
  explicitly out of scope for this documentation pass. Documented as such in every touched doc.
- **`readiness_expectations`** (Business Process stage config) — a distinct concept (what must be true
  for subjects at a stage) and a field name; not the ontology term. Left as-is.
- **"Expected X" value names** — retained as the labels of specific Projections.

---

## 5. Final certification

**Certified (2026-07-13):** the Alloy documentation corpus contains **one consistent ontology**.

1. ✅ **Single meaning of "Expectation."** Across all canonical docs, "Expectation" refers only to the
   authored Operational Expectations ledger. No document uses it for derived state.
2. ✅ **Single meaning of "Projection."** Derived operational state is uniformly "Projection." The
   former L3 label is gone from doctrine.
3. ✅ **Law 2 rewritten** and consistent with the two-ledger, authored-Expectations architecture; the
   truth-flow axis, both orthogonal-axis references (truth-flow + UX doctrine), the capability table,
   the RFC, the module layer-headers, and the active audit all agree.
4. ✅ **Terminology map exists** and is canonical in the glossary.
5. ✅ **No architecture or implementation was changed.** Only documentation converged; code
   identifiers preserved; no new concepts introduced.

**Residual, tracked as implementation follow-ups (NOT doctrine conflicts):**

- Code symbols under `web/lib/childcareOperational/expectations/*` still carry `Expectation` names.
  They mean L3 Projections. A rename is optional cleanup, owned by implementation, and does not affect
  ontological consistency.
- `foundation/platform-capabilities.md` does not yet list **Operational Expectations** (authored
  ledger) or **Operational Facts** as capabilities. That is an *addition* pending the capability's
  build, not a *contradiction*; adding it was out of scope for a rename/convergence pass.

**This certification is invalidated if** any doc reintroduces "Expectation" for derived state, Law 2
is re-altered, or a new capability doc places the Expectations ledger below the derivation line.
