---
title: Thread 11A §7 — Core-blocking finding dispositions
status: sprint
---

# What was repaired, and what was deliberately not

Mounted on candidate `ef75c8fc1` (production, no HMR, hosted, guard ACCEPT).

| § | Finding | Disposition | Evidence |
|---|---|---|---|
| 7A | Partial allocation not disclosed | **REPAIRED** | `state=partial`, cell reads `Cert Certhouse · $57.00 unassigned`, title `Cert Certhouse $18.00 · Unassigned $57.00` |
| 7B | Household obligation could not be owed | **REPAIRED** | Household row resolves: `kind: resolved`, 2 allocations, net $75.00, unassigned $57.00 |
| 7C | Child-grain arrangement not authorable | **REPAIRED (locked, not yet mounted)** | scope control `responsibility-scope`, household default, `arrangementMemberId` sent |
| 7D | Share methods — only FIXED authorable | **DEFERRED** — see below | |
| 7E | Due-date policy had no caller | **REPAIRED** | resolver wired after the intent; `due_date` written on create and recalculate; 2 strategies + no-policy fallback locked |
| 7F | Four inert execution policy types | **WITHHELD FROM AUTHORING** | `inertStillShown=[]`; the six consuming types remain |
| 7G | Charge reversal presented as Credit | **REPAIRED** | one shared `financialRowConceptLabel`; correction lineage beats category on both hosts |
| 7H | Ledger row provenance inspection | **DEFERRED** — see below | |

## 7D — `SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED`

The authority supports **fixed**, **percentage** (basis points) and **remainder**. The operator panel
authors **fixed only**, and the panel says so in its own code.

**Decision: defer percentage and remainder.** Every responsibility scenario Core needs before Human
QA is expressible with fixed shares, and this pass proved them that way end to end — configure,
resolve, partial allocation, reallocate. Broadening the authoring surface is a real piece of work
(three methods, their interaction, and a preview that explains a remainder) and would be started, not
finished, in this batch.

**QA and documentation must say exactly this**: FIXED is operator-authorable; percentage and
remainder are accepted by the authority and not reachable from any surface. Neither may be described
as an operator capability.

## 7H — `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED`

Canonical discount provenance can exceed the Description preview. Description is **not** widened
again — that was the defect the preview replaced.

**Decision: keep the concise preview.** Building a row-inspection surface is disproportionate to
Core QA, and the reversal-identity repair in 7G removed the most misleading case (a reversal reading
as a Credit), which was the sharpest edge of this finding.

**QA and documentation must therefore test and describe only what the row actually exposes**: the
concept, the basis summary where it fits, the recurrence, and the responsible-party state — not a
full provenance inspection that does not exist.
