---
owner: platform
status: canonical
last_reviewed: 2026-10-02
supersedes: []
---

# Financials economic-writer regression

One command, before promoting any slice that touches a shared Financials economic writer:

```bash
cd web && npm run test:financials-economic-writers
```

## Why it exists

S1 and S2 changed `childcareChargeService`, `chargeLifecycleService` and `reductionCore` — authorities
that Financials shares with `operationalConsumption`. Both slices were certified against a regression
envelope of `tests/financials/**` plus access guards, and **neither reached
`tests/operationalConsumption`**, which consumes the same writers.

The cost was measured, not hypothetical: **63 failing tests across 16 suites** on the deployed commit,
including a NOT NULL violation in `reductionCore` that broke every reduction written through the
shared authority — vacation credit, policy reduction and manual credit alike. No CI check caught it,
because no required check runs the general test suite.

This manifest exists so the next slice does not have to *remember* that a writer has a second
consumer.

## What it covers

| domain | why it is in the envelope |
| --- | --- |
| charge lifecycle, charge actions, childcare charge service | the shared authority itself |
| tuition generation, generated auto-post | generated billing's path to posting |
| **operationalConsumption** generation, corrections, reversals, obligations | the consumer S1/S2 missed |
| reductions, discounts, discount forecast | economic effect is a charge through `reductionCore` |
| customer billing calendar, period materialization, period generations | S1/S2 binding |
| payments | consumes the shared charge authority |

## Deliberately excluded, with reasons

These are excluded because they are red for causes **proven on the base commit** with the candidate
removed, not because they are inconvenient. Each must be re-checked when its cause is repaired.

| excluded | cause | classification |
| --- | --- | --- |
| `tests/operationalConsumption/consumptionSimulateRoute.test.ts` | 6× `expected 403 to be 200`, 3× `403 to be 400` | `PRE_EXISTING_AUTHORIZATION_RED` |
| `tests/operationalConsumption/obligationsRoute.test.ts` | same 403 condition | `PRE_EXISTING_AUTHORIZATION_RED` |
| `tests/operationalConsumption/live/**` | require the shared cert stack; two carry a `financial_policy_id` FK condition from their own fixture cleanup | `LIVE_FIXTURE_STATE` |

The live suites additionally need migration parity on the shared cert stack. They surfaced the
`reductionCore` defect precisely because they run against a real database, which is an argument for
keeping them runnable rather than excluding them permanently.

## What good looks like

A slice reports **`Financials economic-writer regression: PASS`** instead of rediscovering twenty
suite names. If a writer gains a new consumer, add it here in the same commit that adds the consumer.
