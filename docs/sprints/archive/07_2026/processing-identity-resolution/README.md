# Processing Identity Resolution Engine V1 — Architecture & Implementation Sprint

**Status: Frozen for V1 implementation** (architecture is implementation-authoritative; product-owner decisions incorporated). **Design baseline:** `origin/staging` @ `65afc8527…`; **promotion target:** latest `origin/staging`.
**B1a status: implemented locally — awaiting full sprint validation and promotion** — Canonical Identity Normalization Primitives and Compatibility Adapters (`web/lib/identity`).
**B0 status: implemented locally — awaiting full sprint validation and promotion** — Tenant security prerequisites (org-scoped identity RLS + `persons.org_id` FK). See migration `20260716120000_processing_identity_b0_tenant_security.sql`.
**Type:** Architecture RFC + frozen decision register + phased Cursor implementation plan.
**Owner:** Platform / Processing. **Created:** 2026-07-10. **Decision + freeze pass:** 2026-07-10.

> This is the sprint **named and explicitly deferred** by `docs/sprints/archive/07_2026/processing-form-workflow-finish-closeout.md`:
> *"Record identity resolution … is intentionally out of scope and remains the next separate sprint."*

## Scope in one line
Everything entering Alloy through an inbound channel passes through **one canonical Processing intake engine**: *Understand → Identify → Resolve → Recommend → Approve → Commit.* Sources submit **facts**; Processing decides what they **mean**; authoritative changes occur only through an **approved, immutable Commit Plan** executed via **semantic commands**. Processing owns inbound **information resolution** — it does not replace lifecycle/scheduling/billing/comms/business-process owners.

## Two identity domains — do not conflate
- **Record identity resolution (this sprint):** matching an inbound person/child/household against `persons`/`customers`/`customer_members`/`opportunities`.
- **Communications identity (separate, shipped):** the org's own send/receive channels (`communication_identities`) — never creates a person.

## Frozen V1 decisions (see [open-decisions](processing-identity-resolution-open-decisions.md))
| | Decision | Freeze |
|---|---|---|
| A | Person canonical; **Parent/Guardian = roles** (not entities); Child = `customer_members` (optional person backing); Family = `customers` container derived from relationships. Processing emits **semantic commands**, never table names | 🔒 (child-backing 🧩) |
| B | Participation via semantic `create_process_participation`; **`process_instances` forward, OCM legacy** — a command owns translation | 🧩 abstraction |
| C | Email/phone are **strong signals, not unique keys**; **no person-level uniqueness**; one canonical normalizer (E.164) | 🔒 (reverses prior email-unique lean) |
| D | Min-evidence thresholds for create (Person=name+contact/identity/relationship; Child=name+DOB/age/guardian/family-context; never empty Family; Lead=family+child+interest; participation=family+child+context+no-open-process); **no auto-commit of creation** | 🔒 product-owner finalized |
| E | Lead vs Enrollment recommendation rules; **reopen window = 180 days default, org-configurable, policy-driven (not hardcoded)** | 🔒 product-owner finalized |
| — | **Retention classes:** committed-lineage = life of record + org/legal; uncommitted/rejected/duplicate = 24 mo; raw OCR/transient = 12 mo; plans/approvals/attempts/audit = 7 yr; PII logs = only as long as needed. `retention_class` from foundation; purge jobs later | 🔒 product-owner finalized |
| F | **Whole-plan approval + per-op include flags**; edit voids approval | 🔒 |
| G | **Atomic identity groups** + sequenced dependents + async outbox; comms failure never rolls back identity | 🔒 |
| H | **Merge = propose-only in V1**; privileged execution Phase F | 🔒 |
| I | **Shadow public forms first; first executor cutover = Manual Create Lead**; forms commit second | 🔒 (revises "forms first") |
| J | Deterministic-first, human-authoritative; **no identity auto-commit in V1** | 🔒 |

## First Cursor slice
**B1a — Canonical Identity Normalization Primitives and Compatibility Adapters** (`web/lib/identity`: email/phone/name/dob normalizers + E.164 lookup variants + compatibility adapters + bounded **intake** call-site convergence + parity tests + docs). Branch `claude/proc-identity-lib-normalization`. **Non-destructive, no schema, independently mergeable.** **Candidate generation + confidence classification are NOT in B1a — they are B1b.** Security (**B0**) runs on a **separate parallel branch** and is never bundled with B1a. Full boundary at the end of [implementation-plan](processing-identity-resolution-implementation-plan.md).

**Slice order (frozen):** B0 ∥ **B1a** → B1b (candidate generation + match classification) → B2 (facts/evidence) → B3 (resolver persistence) → C1 (form shadow) → D0 (identity commands) → D1 (commit plan + approval) → D2 (executor) → D3 (operator review) → **D4 (Manual Create Lead cutover — first executor)** → D5 (public-form cutover) → E → F → G.

## Artifacts
| # | Artifact | Purpose |
|---|----------|---------|
| 1 | [current-state-audit](processing-identity-resolution-current-state-audit.md) | Evidence audit of the three intake substrates, gaps, legacy/duplication |
| 2 | [source-mutation-inventory](processing-identity-resolution-source-mutation-inventory.md) | Per-path: entry → matching → direct writes → idempotency → status → risk |
| 3 | [architecture-rfc](processing-identity-resolution-architecture-rfc.md) | **Implementation-authoritative** V1 architecture (frozen) |
| 4 | [data-model](processing-identity-resolution-data-model.md) | **7 typed tables** (reduced from 13) + phase gating + ERD |
| 5 | [migration-strategy](processing-identity-resolution-migration-strategy.md) | Gates G1–G10; rollout (shadow forms → Create Lead commit → forms commit) |
| 6 | [implementation-plan](processing-identity-resolution-implementation-plan.md) | Bounded Cursor slices + exact first slice |
| 7 | [test-strategy](processing-identity-resolution-test-strategy.md) | Unit / integration / 25 scenarios / shadow comparison |
| 8 | [risk-register](processing-identity-resolution-risk-register.md) | Likelihood/impact/detection/prevention/mitigation/rollback |
| 9 | [open-decisions](processing-identity-resolution-open-decisions.md) | **Decision register (A–J frozen)** + original-20 mapping |
| 10 | [doctrine-reconciliation](processing-identity-resolution-doctrine-reconciliation.md) | Docs to reconcile at closeout |

## Reading order
Decisions first: **9 (open-decisions)** → **3 (RFC)** → **4 (data-model)** → **5 (migration)** → **6 (implementation)**. Evidence base: **1 → 2**. Validation/impact: **7 → 8 → 10**. Every material claim cites exact repo paths; findings tagged **[C]** confirmed / **[I]** inferred / **[P]** proposed / **[D]** doctrine.

## Provenance
Seven parallel read-only trace streams + firsthand reads of the load-bearing contracts + July 2026 Processing/Forms doctrine, followed by a decision-finalization pass (this revision). No runtime code, schema, or migration modified.
