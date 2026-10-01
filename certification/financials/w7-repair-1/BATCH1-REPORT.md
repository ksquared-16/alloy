# W7 Human QA — Repair Batch 1, on the deployed repaired build

Deployed revision under test: **`2ec96caaa3df`** (PR #1374 merged, both prior repairs verified
present in the staging tree). QA storage-state refreshed via `gar_cf7ea1f1abb776` before every
mounted pass. Every write below went to a **disposable demo household (Certopp Family)** — never
Certhouse, never the Alvarez rows.

---

## 1 · Discounts — the blank drawer is gone (Accounts) · **PROVEN**

Opened from Financials → Accounts on the deployed build. The drawer renders content, not a blank
body:

```
{"present":true,"state":null,"childRows":2,"policies":0,"bodyLen":260,
 "body":"DISCOUNTS CC Certa Certhouse Sibling discount (QA specimen) · 10% Expected $18.50 …"}
```

Two child rows with priced expectations. Reproduced across three separate mounted runs.
Evidence: `discounts-accounts.png`, `mounted-proof.json`.

## 2 · Discounts from the Focus Panel — **BLOCKED, see finding F3**

Could not be exercised: the Focus Panel's Financials card did not reach a usable state in three of
five observations (below). This half of the instruction is **not proven** and is not claimed.

---

## 3 · THE BLANK ACCOUNTS SCREEN — **REPRODUCED, REPAIRED, GUARDED**

**Reproduced.** Opening `Add` from an account in Financials → Accounts drew the command over an
**empty right pane** — see `after-add-charge.png`, where the account list is on the left, Certopp
Family is selected, and the pane that should hold the account is a blank bordered box. In the DOM,
held for the full 30s it was watched:

| | before Add | after Add |
|---|---|---|
| `data-financials-detail-account` | `fcaa839f-…` | **absent** |
| ledger rows | 1 | **0** |
| body text | 4,469 chars | 3,178 chars, frozen |

**Cause.** Details is the *floor* of the Accounts host (`detailsAreTheSurface`), but every command
branch in `FinancialsCard` returned straight out of the component. In the Focus Panel that is
correct — the resting surface there is the compact card. In the workspace the right pane **is** the
account, so returning the command alone left nothing behind it.

**Repair.** Commands are collected rather than returned, and the dispatch renders the floor beneath
them. `financialsSurfaceRole` already distinguished floor from command for the scrim — it had never
been given a floor to describe. The floor's own guard asked whether Details was also the *top*
layer; being the floor is enough (`detailFloorWanted`).

**Guarded** by `tests/financials/commandKeepsAccountFloor.test.ts`, proven binding with three
plants — the command returning alone again, the floor wanted only while on top, and one command
escaping the collector — each red, restored green.

---

## 4 · A charge that resolves to nothing — **NEW FINDING, REPAIRED, GUARDED**

Found while reproducing §3. The command's **default** charge type, `Enrollment fee (waived)`,
resolves to **$0.00**; `Add charge` was offered as an ordinary enabled primary; pressing it
returned **409** from `/api/admin/actions/execute` and put this in front of the operator:

> The charge was refused. The system reported "amount_not_resolvable".

`writeTemplateDraftCharge` requires `amountCents > 0`, so the command could have known — the
resolver's figure was already on the specimen, just not in cents, and a formatted string cannot
tell a **resolved zero** from an **unresolved preview**. The specimen now carries
`previewGrossCents`, the commit is refused *in front of* the button with the reason stated, and
`amount_not_resolvable` gains operator copy for the governed and enrolment paths that can still
reach it. Zero only — `null` is NOT YET KNOWN and blocking on it would refuse every charge.

Guarded by `tests/financials/chargeResolvingToNothingIsRefusedFirst.test.ts` (7 assertions).

---

## 5 · Service Date — **EVIDENCE GATHERED, product question raised**

The canonical control is **already deployed**: `AddChargeCommand` renders `AlloyDateInput`
(`testId="addcharge-event-date"`), and a mounted scan found **zero** `input[type=date]` anywhere on
the command. So the picker half of this finding appears already answered on `2ec96caaa3df`.

What the mounted pass *did* surface, on the default template:

- **Service date is not editable at all** — it renders as a static value, because the control is
  gated on `t.occursOn === "event_date"`. For a period-billed template that is arguably right, but
  it means "Service Date" is a label over a number the operator cannot act on.
- **`Due` reads "Configured policy"** — and that string is **hardcoded in the adapter**
  (`adaptAddChargeSpecimen`), on a field the type documents as `charges.due_date`. The preview
  returns `Occurs` and `Billable` dates and **no due date at all**, so there is no value being
  hidden — but the operator is told a mechanism where they asked a question.
- **`Billing period` renders as a single date** (`Oct 1, 2026`), not a period.

I have **not** changed these: whether `Due` should state a date, name the policy, or not exist is a
product decision, and inventing a due date would be exactly the fabrication this surface forbids.
Raising it for your call.

---

## F3 · NEW FINDING — the Focus Panel Financials card does not reliably resolve

On `/workspace/work-unit/enrolled-children` (subject Certb Certhouse), the Focus Panel's Financials
card sat at `data-financials-empty="loading"` with a pulsing skeleton while **every neighbouring
card hydrated normally** — Enrollment, Household and Children all fully populated in the same
frame. See `focus-panel-stuck.png`.

The hard measurement: **120 seconds, zero `/api/admin/financials/card` requests, zero console
errors.** The card never issued its read.

Observed 3 stuck / 1 resolved / 2 inconclusive across six mounted passes, so it is **intermittent**.
I probed a `requestIdleCallback`-starvation theory (the card loads through idle scheduling; one
probe polled on `raf`) and the A/B was **void** — my own check read "no skeleton" as "resolved"
when the card had not yet mounted. I am **not** claiming a cause.

What is established and relevant: `focusPanelMountableCards` builds financials as a
**self-fetching** shell, while the card's bootstrap is gated on `hostSuppliesProjection =
context.operationalProjection != null` — a host-level question, not a per-card one. If the
projection lands without a `cards.financials` entry, `provisioningAccount` stays true and the
bootstrap effect never runs. That is consistent with the zero-request observation, but I have not
proven it is what happened, and I have not changed it.

**This blocks the Focus Panel half of instruction §2.** It is reported open, not repaired.

---

## 6 · W7 PRESERVATION — **PROVEN** (`gar_30de36ebf9c9a4` → `tha_961c499f463ed4`)

Read-only census of the deployed acceptance store, `alloy_deployed_primary`, after the repair
deployed. Query `w7-preservation-census.sql`, hash `d94562f9…1d776`; answers in
`w7-preservation-census.sql.results.json`.

**Kelly's testimony survived the deploy intact.** Exactly one row exists for
`add_charge_honours_review_boundary`:

```json
{"result": "fail", "classification": "PRODUCT_DEFECT",
 "deployed_revision": "ea596e6152358d1d2be80f676955f2f8a3ae39be",
 "environment": "staging", "scenario_definition_version": "2026-09-30.1",
 "has_observation": true, "observation_chars": 122}
```

and the preservation question answers itself:

```json
{"rows_total": 1, "fail_rows": 1, "pass_rows": 0,
 "product_defect_rows": 1, "distinct_revisions": 1, "preserved": true}
```

It is still a FAIL, still PRODUCT_DEFECT, still carries the tester's own 122 characters, and is
still bound to **`ea596e61…`** — the build it was given, not the build that answers it. **No pass
row exists for this scenario on any revision.**

**W7 has not advanced.** `core_financials_director_qa`: 4 answered — **0 pass**, 1 fail, 0 blocked,
3 not_run. The store holds testimony about four distinct revisions with rows intact on each, so
nothing was rewritten in place.

Every scenario not passing, for the batch to be aimed at:

| scenario | result | classification | revision |
|---|---|---|---|
| `add_charge_honours_review_boundary` | fail | PRODUCT_DEFECT | `ea596e61…` |
| `plan_vs_actual` | blocked | FIXTURE_DRIFT | `a78f1e3f…` |
| `financial_subject` | not_run | — | three revisions |

---

## Validation

- `typecheck` — PASSED (broker, two runs).
- Financials suite, covering files — all green, including the three pinned guards whose anchors
  moved with the rename.
- 18 `tests/financials/live/**` reds are **environmental and pre-existing**: every one traces to
  `column financial_responsibility_arrangements.charge_id does not exist` on the shared local cert
  stack, which has not applied `20261018120000_charge_scoped_responsibility.sql`. None names any
  file this batch touched. Staging has the column — which is why the deployed mounted pass worked.

## Not done, and why

- **Responsibility inheritance, mounted end-to-end.** The disposable account's default template
  resolves to $0.00, so no preview split was produced to assert against; selecting a chargeable
  type needs the custom `AlloySelect` driven open. Not proven — not claimed.
- **Calendar icon convergence**, **Ledger Details provenance**, **Alvarez presentation** — not
  reached. On provenance specifically: `FinancialsChargeDetail` surfaces **no** `created_by` at
  all today, and of the four origin columns named in the instruction only `job_id` and
  `source_charge_id` exist on `charges`; there is no `schedule_id` or `subscription_id`. That
  shapes the honest provenance model and is worth settling before it is built.
