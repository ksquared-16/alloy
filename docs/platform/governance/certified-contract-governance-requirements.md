---
owner: platform
status: proposed
last_reviewed: 2026-09-06
supersedes: []
---

# Certified Contract Governance — requirements handoff

**Status:** Proposed (September 2026). Requirements only. This document deliberately builds nothing.

**Purpose:** State what the Placement / Waitlist certified contract needs from a machine-readable
Certified Contract registry, so that the Vacilando Certified Contract Governance mission can build
**one** general mechanism rather than each lane inventing its own.

## Why this is a handoff and not an implementation

The Placement / Waitlist contract is currently **NOT GOVERNED**, and that verdict is correct today.
It is worth being precise about why, because three things are routinely mistaken for governance:

| Artifact | What it actually is | What it is not |
|---|---|---|
| `docs/system/adminv2-runtime-performance-doctrine.md` § Placement / Waitlist certified contract | **Documentation.** A 10-invariant table, tiers, evidence artifacts | Nothing parses it. No tool reads a markdown table |
| `web/tests/orchestration/placement/**`, `certification/placement-invariants/**` | **Controls.** They genuinely fail when the property breaks | A control proves a property today; it does not attach an obligation to future work |
| `scripts/certify-trust-db.sh` → `.github/workflows/trust-db-certification.yml` | **Enforcement, for those specific tests** | Enforcement of a named suite is not governance of a contract. It cannot answer "which contract does this change touch, and what must it prove?" |

None of these alone — nor all three together — is Certified Contract Governance. Governance is the
mechanism that, given a **change**, determines the **obligations it inherits**. Nothing in this
repository does that today: `subsetsFor()` exists in `runtimeCertification.mjs` but no CI workflow,
git hook, or toolkit command invokes it.

**A local placement-only registry would be the wrong fix.** It would satisfy this lane and leave the
platform with one bespoke registry per subsystem — the same duplicate-ownership failure the runtime
doctrine forbids in product code. The registry belongs to Vacilando, once.

## What the registry must let governance determine

For any candidate change, governance must be able to answer these without human interpretation:

| Question | Field required | Placement's answer today |
|---|---|---|
| Which contract does this change touch? | `contract_id` + trigger paths (globs or reachability) | *absent* — would be `placement.waitlist.v1`; triggers `lib/orchestration/placement/**`, `lib/queues/candidateGrainWaitlistQueue.ts` |
| What must it prove? | `required_subset` per trigger | waitlist *(delegated)*, work-unit |
| At what depth? | `tier` (1 fast / 2 local browser / 3 deployed acceptance) | 1, 2, 3 — see doctrine § Tiers |
| Against what? | `baseline` reference | `scripts/runtime-certification/baseline.json` |
| Which laws may never regress? | `hard_invariants[]`, each bound to the control that asserts it | 10 invariants, currently markdown table rows only |
| What proves it ran? | `evidence_artifact` path | *absent* — no artifact contract exists |
| What is the answer? | `verdict` vocabulary + who may issue it | computed at runtime, never persisted |

## Requirements

1. **One registry, platform-wide.** Not per subsystem. Contracts are entries, not files.
2. **Machine-readable and schema-validated.** The repo already has the right shape in
   `web/scripts/routeCapabilities.declared.json` — a declared registry with a ratchet, enforced by
   `checkRouteCapabilities.mjs` at prebuild and by a test. Certified contracts should be no weaker.
3. **Vacilando consumes it.** A registry nothing reads is documentation with braces. Governance must
   consult it when evaluating a change, and a change touching a registered contract that certifies
   nothing must be **uncertified**, not exempt.
4. **Every hard invariant names the control that asserts it.** A declared invariant with no control
   is inert, and inert invariants get quoted as evidence. The runtime harness now enforces this
   locally (`INVARIANTS_ASSERTED_HERE` / `INVARIANTS_DELEGATED`, with certification failing on
   drift); the registry needs the same property across contracts.
5. **Delegation must be expressible.** Not every obligation is discharged by the same runner.
   `waitlist` is routed to the runtime harness but certified by
   `certification/playwright/waitlist-manual-position-truth.cert.spec.ts`. A registry that cannot
   say "this subset is certified elsewhere, by that runner" will push lanes back into either
   silently passing or duplicating a second producer of the same verdict.
6. **Do not duplicate certification logic in Vacilando.** Runtime Performance owns *what good means*
   and *how to measure it*. Governance owns *when future work must prove it*. The registry carries
   references and verdicts, never a second implementation of the measurement.

## Placement contract, ready to register

The obligations below are stated once here so the governance mission can ingest them without
re-deriving them. They are already documented in
`docs/system/adminv2-runtime-performance-doctrine.md` § Placement / Waitlist certified contract and
asserted by the controls named there. **This table is not a registry** — it is the payload a
registry would carry.

- **contract_id:** `placement.waitlist.v1`
- **triggers:** `lib/orchestration/placement/**`, `lib/queues/candidateGrainWaitlistQueue.ts`
- **tiers:** 1 — vitest + `certification/placement-invariants/run.sh` (in `scripts/certify-trust-db.sh`,
  run by `.github/workflows/trust-db-certification.yml`); 2 — `npm run cert:runtime:local`;
  3 — `waitlist-manual-position-truth.cert.spec.ts` on deployed staging
- **hard invariants and their controls:** the table in the doctrine, one control named per row
- **known non-conformance:** deployed waitlist mutation certification is **AVAILABLE**
  (operator-invoked), not automatically scheduled — governance should treat an operator-invoked tier
  as a weaker guarantee than a scheduled one, and say so in the verdict

## Until then

The verdict stays **PLACEMENT CERTIFIED CONTRACT — NOT GOVERNED**. It should be upgraded only when a
machine-readable registry exists *and* Vacilando demonstrably attaches these obligations to future
placement-affecting work — not when this document is merged.
