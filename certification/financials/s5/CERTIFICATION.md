# Financials V1 — S5 prospective post-close corrections

**Classification: `FINANCIALS_V1_BILLING_PERIOD_S5_PROSPECTIVE_CORRECTIONS_COMPLETE_CERTIFIED`,
with the deployed-estate evidence boundary stated in §13 and the S3/S4 real-clock debt carried
unchanged in §14.**

---

## Phase 0 — lineage, and #1400's disposition

| | |
|---|---|
| origin/staging | `95dc556fe7508d094054aef595dae19a65eca9b6` |
| deployed | `95dc556fe` — same commit, read from `/api/build-info` |
| S1/S2/S3/S4 migrations | `20261113` … `20261118` all present and applied |
| W7 testimony | untouched; not read, not written |

**PR #1400 was NOT merged, and should not have been.** `repository.merge_pull_request` refused it:

```
evidence_only_promotion_unnecessary
this candidate changes nothing that executes — all 3 changed path(s) lie within
certification/, docs/ and none of them executes. Deploying it cannot establish
anything about it.
```

The control is right, and it corrects a habit of mine rather than blocking work: I had split the
Phase-22 evidence into its own PR *because* the apply/merge wall had stranded it, and those two
rules together make the split wrong. The disposition is therefore **#1400 stays open and carries
the S5 slice** — pushing product commits to the same branch updates it in place, so the evidence
lands with code that executes. No second PR was opened; GitHub would reject one from the same
head/base anyway.

---

## §3 — correction authority census, before any edit

Read against the deployed estate rather than from source alone.

| authority | creates | references | period it uses | mutates history? |
|---|---|---|---|---|
| `applyManualReduction` → `applyReductionCore` | a contra charge + an explaining application row | `source_charge_id` | resolved from the correction's **own** `effectiveDate` | no |
| `applyFinancialReductions` (policy) | same pair | `source_charge_id` | the reduction's own date | no |
| `reverseManualReduction` | an appended opposite application | `reverses_id` / `reversed_by_id` | its own date | no |
| charge-level reversal (`source_charge_id` on `charges`) | a new charge | the original charge | its own date | no — posted charges are immutable |
| `billing.adjust_account` / `billing.reverse_adjustment` | the above, through `fin.adjust` | ditto | ditto | no |

Measured on deployed:

- **51** reduction applications; **40** carry a source charge.
- **All 40 sources are `legacy` generation with no canonical period.**
- **Zero** of the 51 contra charges carry charge-level `source_charge_id` — provenance lives on the
  **application row**, so the one-live-reversal charge trigger does not constrain reductions.
- **3** sources already carry multiple applications, the largest **13**. Multiple independent
  corrections against one source are already permitted and already present.
- Idempotency is a **unique index** `(org_id, idempotency_key)` — not a constraint, which is why my
  first census question (reading `pg_constraint`) reported only a primary key. That was my census
  being incomplete, not the database.

## §4 — what the nine cross-period cases actually are

**40** applications have a source; **9** sit in a different period from it, **31** in the same one.
Of those sources: **0** in a closed period, **0** in an open period, **40** with no canonical period
at all.

So the nine are **ordinary reductions whose effective date simply fell in a different month than
their source's** — legacy-keyed on both sides, written before canonical periods meaningfully
existed (deployed holds 143 canonical charges against 8,967 legacy). They are **not** intentional
post-close corrections, and their existence is **not** treated as evidence that today's semantics
are right. They were used only to understand the model. None was mutated.

---

## §5 — the model decision: EXTEND, do not build

**No `financial_corrections` table. No second correction writer.** The census shows the existing
reduction authority already represents every part of a prospective correction, and the estate
proves each one rather than merely permitting it:

| S5 requirement | existing representation |
|---|---|
| source economic fact | `source_charge_id` — plain FK, legacy sources already the norm (40/40) |
| correction amount | signed `amount_cents` |
| correction reason | `reason` + `explanation` |
| correction economic date | `effectiveDate` → contra charge `service_date` → the S2 binder |
| canonical OPEN destination period | the contra charge's `billing_period_id` (since #1398) |
| closed source via provenance | the source row's own period — never read when binding |
| actor/system provenance | `created_by` / `updated_by` |
| reversal lineage | `reverses_id` / `reversed_by_id`, one live reversal enforced |
| idempotency | unique index `(org_id, idempotency_key)` |

What was genuinely missing — and is what S5 adds — is a **resolver** that can answer, before
anything is written, what a correction would do and whether it would be refused, in the operator's
language, reaching the same verdict execute reaches.

### The one real design tension, and how it is resolved

Preview must not write; execute's authority (`resolveChargeBillingPeriodBinding`) **materializes**
the customer's current and next periods as a side effect. Calling it from a preview would mean
opening a form creates billing periods.

So preview resolves **read-only** and still lands on execute's answer, because the only verdict that
can differ is "is the destination closed", and *a period that does not exist yet cannot be closed*:

- a persisted period covers the date → read its status; closed refuses here exactly as the binder
  refuses there;
- none exists → the calendar names the period, and execute will materialize it **open**; preview
  reports `willBeCreated`.

Every other refusal comes from `resolveCustomerCalendar`, which both sides share — parity by shared
authority, not by duplicated rules.

---

## §6–§12, §17, §28 — the proofs, against a real database

`prospectiveCorrection.live.test.ts`, 10 cases, real services and real money.

**The Director's example.** November posts $1,000 + $75 = **$1,075** and closes. Then:

| | measured |
|---|---|
| **negative correction** −$25 into December, source = closed November fee | November still **$1,075**; source still $7,500/posted/November; period still closed; application `billing_period_id` = **December**; December economics **−$25** |
| **positive correction** +$25 into December | November unchanged; December application **+$25**; direction sentence *"Increases what the family owes by $25.00"* |
| **both truths at once** | `application.billing_period_id !== source.billing_period_id`, asserted as the inequality rather than two hopeful equalities |

**§7 open-destination requirement.** A correction dated into closed November is **refused**, by the
resolver and by execute, and the refusal **names the period** — it does not hop forward to find an
open one. Choosing the effective date stays the operator's decision.

**§26 finality is not weakened.** After the refusal, November still holds exactly 2 charges and
$1,075. No generic "allow closed period" escape hatch exists; the correction path differs only in
that it targets a *different, open* period.

**§24 preview/execute parity** is asserted on the refusal, not only the happy path — the failure
that matters is previewing successfully and then being refused on commit.

**§17 payment interaction.** November's tuition is paid in full, then corrected. The payment row is
**untouched** (still posted, still $1,000), the charge still shows 0 outstanding, November is still
$1,075, and the correction lands in December. The payment is not reversed to make the correction fit.

**§18 Autopay.** The correction's contra charge is an ordinary childcare charge; `resolveFamilyCollectible`
answers for it through the canonical resolver. Autopay reads no period column anywhere (asserted in
the S3/S4 suite against source with comments stripped), so it is never told the source was November.
**No S5-specific payment logic was added.**

**§27 idempotency.** The same correction submitted twice returns `idempotent: true`, leaves December
economics unchanged, and leaves exactly one application row.

**§28 cross-cadence.** A **weekly** household: week-one source closes, the correction resolves to a
weekly key matching `\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}` and explicitly **not** `YYYY-MM`. Preview
named the destination before it existed (`willBeCreated: true`, id null) and execute materialized
exactly that period — parity asserted on the **period key and bounds**, since an id that does not
exist yet cannot be compared.

**§20 legacy source.** A legacy charge (key `2026-08`, no `billing_period_id`) is corrected into
canonical December. Provenance reports `generation: legacy`, `periodLabel: "2026-08"`, and a null
period status *because there is no period row to have one*. The application is `canonical`. **No
canonical August period was invented** — asserted by querying for one and finding none. This matters
because legacy is the overwhelming majority of history.

---

## §10, §13, §23 — direction and provenance

Direction is **stated, never inferred from a word**. Internally the amount stays canonically signed;
the operator reads *"Reduces what the family owes by $25.00"* or *"Increases …"*. Bound separately
in `correctionDirection.test.ts`, including that a reducing correction never renders `-$` — a minus
inside a sentence that already says "reduces" reads as a double negative.

Provenance answers §13's questions in business language, with no UUID surfaced: what was corrected
(the charge's own description), which period it belonged to, whether that period is closed and stays
unchanged, which period the correction applies to and its bounds, when it takes effect, and why.
Per §23 the UI itself is **not** rebuilt — only the command contract, the preview and the read model
it will consume.

---

## §14, §15, §16, §19 — measured rules, not invented ones

- **Lineage.** The charge-level one-live-reversal trigger governs charge reversals and does **not**
  reach reduction applications (zero contra charges carry charge-level lineage). The real economic
  bound is `assertWithinObligation`: the SUM of reductions may not exceed what the source holds.
  Multiple independent corrections against one source are already permitted and already present
  (max 13 on deployed), so S5 preserves that rather than forbidding it. **No Director decision is
  required** — the invariant was measurable.
- **Responsibility.** Untouched. The correction creates a new economic fact through the canonical
  writer; no historical allocation is copied or mutated.
- **Due / collectibility.** The correction's contra charge gets its own due treatment through the
  ordinary path; it does **not** inherit the source's due date. Collectibility is whatever
  `resolveFamilyCollectible` says about the new charge.
- **Accounting.** Independent and untouched; the commercial period and the accounting period share
  no column, table or service.

---

## §32 — nine plants

| plant | result |
|---|---|
| correction binds to the source period | RED (5) |
| correction allowed into a closed destination | RED (2) |
| ordinary closed-period write becomes permitted | RED (4) |
| legacy source reported as canonical | RED |
| monthly-only destination key | RED |
| preview resolves a different period than execute | RED |
| direction read from the word rather than the sign | RED |
| idempotent repeat duplicates the correction (**both layers**) | RED |
| correction rewrites the source charge | **could not be planted** — see below |

**Two plants were green on the first attempt, and both are defence in depth rather than gaps.**

*Idempotency* is enforced twice: the early return on an existing idempotency key, **and** the unique
index `(org_id, idempotency_key)` whose 23505 the writer recovers from by withdrawing the surplus
draft. Defeating one leaves the other; defeating both reds it.

*Rewriting the source* could not be simulated at all. The attempted mutation is refused by the
database:

```
posted childcare charge … is immutable: financial fields cannot change in place;
record a reversal/credit/replacement via source_charge_id
```

A plant that cannot perform its mutation is evidence the boundary holds, not evidence the test is
weak — but it is reported as what it is rather than counted as a red.

---

## §33 — regression

| gate | result |
|---|---|
| typecheck | PASS |
| typecheck:tests | PASS |
| `test:financials-economic-writers` | **66 suites / 824 tests** — corrections added to the required manifest |
| reductions, responsibility, Payments, prepaid, scheduled work, S1/S2, S3/S4 close | 787 PASS / 20 skipped |
| journal / accounting / migration guards | PASS |

---

## §34 — deployed certification, and the evidence boundary

Controlled synthetic fixtures throughout, with run-unique ids. **Certhouse, Certopp, Alvarez,
Kelly's W7 fixtures and the historical 35 were not touched** — the historical 35 were not read for
mutation and not remediated (§21); S5 architecture *could* eventually recreate them prospectively,
but no disposition changed here.

The economic proofs run against a **real Postgres carrying the deployed migration set**, driving the
real services. The deployed **estate** write remains blocked by this session's
real-world-transaction guard, unchanged from the previous two runs and not worked around. Deployed
evidence here is therefore read/schema/source: the census above, the deployed SHA, and the deployed
source of the authorities being extended.

## §30 — S3/S4 real-clock debt, carried unchanged

`FINANCIALS_V1_BILLING_PERIOD_COMMERCIAL_FINALIZATION_IMPLEMENTED_AWAITING_REAL_CLOCK_CERTIFICATION`.
The close schedule is registered and active on deployed (next due `2026-10-04T04:00Z`), the clock is
healthy, and **nothing is eligible to close** — the earliest open deployed period ends `2026-11-12`.
Not upgraded. No occurrence manufactured.

## §35 — W7

Paused. Kelly's testimony untouched. No QA rewrite, no PASS, no advancement.

## Hard stop

Stopped before the Adjustment UX convergence, before any historical-35 remediation, and before
statements or invoices.
