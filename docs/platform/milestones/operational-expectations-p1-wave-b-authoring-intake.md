---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Operational Expectations — P1 · Wave B: Authoring Intake (implementation checkpoint)

**Status:** Canonical implementation record for **P1 Wave B**, 2026-07-14. Introduces **no
architecture, no ontology, no new package, no new gate**.

```
P1 Wave A: MERGED AND CLOSED
P1 Wave B: LOCALLY COMPLETE
P1 overall: IN PROGRESS / UNCERTIFIED
```

> **Authority.** P1 scope, contracts, gates, and completion criteria are authoritative in the
> [Engineering Realization §13 · §19 (P1)](./operational-expectations-engineering-realization.md); the
> frozen architecture is the [System Design §5 · §12 · §A](../core/operational-expectations-system-design.md).
> Waves are **implementation sequencing only**; **P1 certifies once, after all waves complete.** See the
> [Wave A record](./operational-expectations-p1-wave-a-ledger-substrate.md) for the full wave plan.

---

## 1. What Wave B is

Wave B establishes the **single supported write path** into the authored Expectation ledger — the one
intake that admits every authoring act, validates the frozen grammar before insertion, is retry-safe,
and emits one canonical **Authoring Act**.

**Governing rule (after Wave B):**
```
No supported caller writes operational_expectations directly.
Every supported authored ledger act enters through ONE intake.
The intake validates the frozen grammar before insertion.
The intake emits ONE canonical Authoring Act.
The intake does NOT yet decide Standing (Wave C).
```

### 1.1 Database capability vs supported behavior
```
Database capability (Wave B): a service-role process may insert an append-only row + Authoring Act
  atomically via author_operational_expectation(...).
Supported behavior with oe.ledger.author OFF (default): Facts-only; NO authoring; no partial row.
Supported behavior with oe.ledger.author ON: acts enter through the one intake, grammar-validated.
After Wave C: the intake admits authors only through Authority→Standing resolution.
```

## 2. The single authoring intake

`authorOperationalExpectation(input, context) → AuthoringResult`
(`web/lib/operationalExpectations/intake/authorOperationalExpectation.ts`; production wiring
`supabaseAuthoringGateway.ts` → `authorOperationalExpectationServer`).

- **Typed grammar input**, never raw columns / arbitrary JSON: `⟨Authority·Modality·Subject·Condition·
  TemporalFrame·[Beneficiary]⟩` + verb + footprint + idempotency key. Organization and actor come only
  from the **server-trusted `AuthoringContext`**, never from input. Recorded time is not an input.
- **Never throws** — every outcome is a typed `AuthoringResult`
  (`disabled | authored | rejected | conflict | failed`).
- **Reusable, domain-neutral**: API routes / server actions / imports / future AI proposals all delegate
  here — no duplicate write path, no domain-specific branch.

## 3. Sole write path & security boundary

- `authenticated` = **SELECT only** (Wave A); **no** client INSERT. Writes arrive only through the intake
  behind the service-role RPC `author_operational_expectation` (`SECURITY DEFINER`, `REVOKE … FROM
  PUBLIC`, `GRANT EXECUTE … TO service_role`). service_role is **infrastructure**, not the product
  authoring contract.
- Org + actor are server-trusted; predecessor reads are tenant-checked; raw DB errors are never exposed
  (typed `failed`). An unauthenticated/orgless caller is rejected `unauthorized`.

## 4. Feature flag `oe.ledger.author`

Per-feature module (`ledgerAuthoringFeatureFlag.ts`; env `OE_LEDGER_AUTHOR_ENABLED`, default **OFF**;
optional org opt-out via `org_settings.metadata.feature_flags["oe.ledger.author"]`; fail-closed on read
error). OFF → typed `disabled`, nothing written. A rollout control, not a permanent second mode.

## 5. Five verbs, modality closure, tuple grammar, semantic line, footprint

- **Five verbs** admitted with structural rules: `create` (no predecessor, roots a lineage);
  `revise/correct/replace/cancel` (predecessor required; transition typed `revision/correction/
  replacement/cancellation`; a **new appended row**, never a status mutation). Revision ≠ Correction is
  typed here; the distinct *behavior* is Wave D.
- **Modality closure** enforced in TS contract + runtime validator + the Wave A DB CHECK (defense in
  depth) — a sixth modality is rejected before insertion.
- **Tuple grammar** validated before insert: authority present; subject/condition structurally valid;
  Temporal Frame present + coherent window; footprint declares ≥1 fact-type; create-vs-predecessor shape.
- **Semantic line**: a Condition asserting a sensor/measurable/fact reference is rejected
  (`semantic_line_violation`) — the measurable binding is Config (P2), below the line.
- **Footprint** is required and stored (handed to P4); fan-out is not executed here.

## 6. Idempotency, recorded time, Authoring Act

- **Idempotency**: additive `idempotency_key` + `payload_fingerprint` + a partial unique index
  `(org_id, idempotency_key)`. Same key + same payload → the existing act (one row); same key + different
  payload → `conflict`; concurrent retries converge on one row (DB uniqueness + `FOR UPDATE`).
- **Recorded time**: `authored_at` remains **server-assigned** (Wave A trigger) and immutable; the intake
  never inserts it. Valid time (`valid_from`) is author-supplied and validated.
- **Authoring Act (atomic)**: `author_operational_expectation` inserts the ledger row **and** the
  `mutation_events` outbox event (`domain=operational_expectations`, `command_key=author_expectation`) in
  **one transaction** — no event without the committed row. Follows the house atomic-RPC/outbox
  convention (`execute_lead_status_mutation`). A best-effort, **non-fatal** `workflow_events` fan-out
  mirrors `leadStatus.ts` and is not the authoritative event.

## 7. Standing boundary (Wave C not begun)

The intake **stores** author class + authority claim and clamps standing to a **provisional**
non-binding value — `proposed`, or `model` for a `predicted` expectation. It **never** authors
`binding`; reaching the intake is not authorization. Final Authority→Standing resolution and
ratification are **Wave C**.

## 8. Migration & rollback

Additive, tenant-safe, idempotent, backward-compatible. With `oe.ledger.author` OFF, product behavior is
unchanged and no rows are authored. **Rollback:** disable the flag (stops all intake); authored history
is preserved (append-only, never deleted); optionally drop the RPC + idempotency index. No Wave A row is
altered or dropped.

## 9. P1 gates Wave B contributes to (none finally green here)

- **G-Modality-Closure** — intake rejects a sixth modality (authoring evidence); finally certified at the
  package certification stage.
- **G-Revision** — typed revision admission (behavior in Wave D).
- Contributes to **G-Acyclic** — every write is an authoring act through the one intake.

## 10. What Wave B explicitly does not do

Final Authority→Standing resolution · ratification · AI proposal admission · evaluation · Judgment · Gap ·
Current Work · clock/recurrence/replay/fan-out · effectors · Billing/Scheduling/Communications behavior ·
revision-replans/correction-unwinds semantics · configuration UI · P2 registry. No P1 gate is certified.

## Cross-references

- [Engineering Realization §13 · §19 (P1)](./operational-expectations-engineering-realization.md)
- [System Design §5 · §12 · §A](../core/operational-expectations-system-design.md)
- [P1 Wave A — Ledger Substrate](./operational-expectations-p1-wave-a-ledger-substrate.md)
