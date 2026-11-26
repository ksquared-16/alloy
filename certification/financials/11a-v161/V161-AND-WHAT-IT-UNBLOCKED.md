---
title: Thread 11A — v161, the mount, and the one thing still missing
status: sprint
---

# v161 published, the card mounted, and the block moved

Candidate **`b93e3cf8d`** · production · no HMR · hosted `ikaxilmwmrmbagoidedu` · QA guard **ACCEPT**.
Engineering mounted measurement. **Human QA PASS remains ZERO.**

## 1 · The publication

| | |
|---|---|
| from | v160 · `3bc7f601-ceec-4cd6-937b-e26fcea4ddfc` |
| to | **v161** · `cd3edf93-d224-4009-9c00-fa1798d544a8` |
| create / publish | `201` / **`200`** |
| placement | `{ card: "billing_preview", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 }` |
| projections written | **both** — `grid.areas` and `rows` |
| existing areas | all six unchanged, at their original coordinates |
| `scheduling` | untouched |
| sections | unchanged; `billing_preview` already `visible` from v160 |

Append-only: a new draft cloned from the published v160, published as the next version. No historical
row edited.

`metadata.focusPanelLayout.grid.areas`

**before** `business_process · financials · children · household · attendance · health_safety`
**after** the same six **+ `billing_preview`**

## 2 · The lock that makes this class of failure loud

A published Focus Panel Summary doc carries two records of one composition, and the runtime renders
`metadata.focusPanelLayout`. A card authored **visible** in `sections` and absent from that layout
passed every existing validator, published with a 200, and was drawn by nothing — silently.

Publication now compares the two lists and refuses a document that contradicts itself
(`focusPanelPublicationIntegrity.ts`, enforced in the publish route where it already says *a
published doc must be renderable*). The rule names no card.

**The plant is v160 verbatim** — the real six areas at their real coordinates beside a real visible
section. The first assertion is that the plant still passes `parseLayoutDoc`, because that is the
whole defect. Then the route is driven: **400**, `Cannot publish a self-contradictory layout`, and
`publishLayout` **was never called**. Removing the route's call reddens it; neutering the rule
reddens three more.

v161 itself went through that check and was accepted — the validator refuses the contradiction and
not the repair.

## 3 · The mount

| | |
|---|---|
| document the panel received | **v161**, `cd3edf93…`, HTTP 200 |
| mounted card keys | `business_process · financials · children · household · attendance · health_safety · assignment_tuition` |
| occurrences | **exactly one**; `duplicates = []` |
| own body | `data-assignment-tuition` inside the card host |
| other cards | unchanged — Financials still renders its full rich anatomy, Process unchanged |

The host key is `assignment_tuition`, hard-coded by the component; the runtime/registry key is still
`billing_preview`. Both are the same card. My first probe counted the wrong key and read zero — the
card was there.

## 4 · Loading: it did not become a serialization dependency

| moment | measured |
|---|---|
| first card commit | **17 ms** |
| pricing read start | 6331 ms |
| pricing read end | 6549 ms (218 ms) |

`/api/admin/financial-config/opportunity/…` starts **six seconds after** the panel has already
painted, and nothing waits on it. The card owns its own data; no producer was added.

## 5 · The card could not see the child's own family — repaired

It resolved its opportunity as `subject.type === "opportunity" ? subject.id : null`, true only on a
case-grain panel. The enrolment Work Unit is child-grain: the lens sets a child subject and carries
the family opportunity's truth beside it.

Measured on first mount: **zero** `/api/admin/financial-config` requests. The card rendered
*"No assignment on this record to price."* — reporting its own blindness in the exact words an
assignment-less family legitimately uses.

Repaired to ask `resolveFocusPanelMutationOpportunityId`, the panel's own answer to the same
question, and to refuse that helper's subject-id fallback: a child id in an opportunity route is a
wrong answer, and no answer is the right one. After the repair the read is issued (§4 above).

## 6 · What is still missing, and it is not the panel

**This family has no assignment.** `/api/admin/financial-config/opportunity/e56e72d5…` answers
`{"enrollments": [], "assignments": []}`, and `buildOpportunityTuitionViews` returns `[]` only when
there are no `opportunity_customer_members` rows for the opportunity. The Children card renders both
enrolled children as `unlinked:46105cd4…` and `unlinked:e408fa51…`, and that prefix means exactly
this: a household child member **not represented in any OCM-linked inquiry row**.

So *"No assignment on this record to price."* is now the **honest** answer on this subject, and
`enrollment.pricing.accept` has nothing to bind to — it writes an effective-dated
`enrollment_pricing_terms` row **against an assignment**.

No operator control on the Focus Panel creates one. This is fixture state, not a defect in the
pricing surface.

`RECURRING_TERMS_ASSIGNMENT_ABSENT` — new, and the sole remaining blocker of §7–§17.

## 7 · Two things the plan expected to build already exist

**Weekly billing frequency** — present, cadence `Weekly`, **Active**, 1 plan using, read back after a
fresh navigation to `?chapter=tuition&setup=frequencies`. Nothing was created; creating a second
Weekly would be configuration damage.

**Weekly tuition rates** — the commercial catalog holds 36 rates, `{monthly: 31, weekly: 5}`. All
five weekly rates are active `private_pay`:

| variant | rate | effective from |
|---|---|---|
| `796c7633…` | $225.00 | 2026-07-22 |
| `90404c9c…` | $215.00 | 2026-07-22 |
| `d6d7e795…` | $200.00 | 2026-07-22 |
| `e1b5e8e5…` | $250.00 | 2026-07-22 |
| `e1b5e8e5…` | $100.00 | **null** |

**A configuration hazard, recorded not repaired**: variant `e1b5e8e5…` carries two active weekly
rates, one of them with no `effective_start`. Two applicable options on one variant is what
`resolveAssignmentPricingOptions` calls **ambiguous**, and an ambiguous resolution is a real answer
the card renders — but it is unlikely to be what the tenant meant, and it should be settled before a
human QA fixture depends on weekly pricing.

So the recurring chain is **not** blocked by configuration. It is blocked by one missing assignment.
