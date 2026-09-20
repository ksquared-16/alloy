# Why Kelly cannot see the product — reachability audit

Diagnosis only. **No product mutation, no repair, no Human QA.** Kelly is right, the closeout was
premature, and the reasons are below.

## 0. The first thing that matters: Kelly is not testing the deployed build

| | Kelly's link | What was certified |
|---|---|---|
| host | `vacilandos-mac-mini…ts.net:3012` → `127.0.0.1:3012` | `staging.workwithalloy.com` |
| runtime | `npm run dev`, **`nodeEnv: development`**, started 13:56:50 | Vercel build `e29c223a8` |
| serves | this worktree's working tree, live | the merged commit |
| database | `ikaxilmwmrmbagoidedu` | `ikaxilmwmrmbagoidedu` — **the same** |

The database is shared, so the DATA findings below apply to both. The code path is not the
certified artifact, and no A–K claim was made against it.

## 1. Root causes — **R1 withdrawn, see below**

### R1 — WITHDRAWN. The chapters ARE navigable. **My audit was wrong.**

I reported that `/organization/financials` had "no door" and called it the highest-value defect.
That is false, and it was the wrong call on my part.

Each chapter tile carries an enabled button whose accessible name is **"Open Tuition"**,
**"Open Catalog"**, **"Open Policies"**, **"Open Payments"**, **"Open Accounting"**,
**"Open Simulator"**, **"Open Funding"**. Pressing them works:

| pressed | lands on | what is there |
|---|---|---|
| Open Policies | `?chapter=policies` | heading **"Discounts & commercial policies"** |
| Open Tuition | `?chapter=tuition` | **Tuition Plans**; billing frequency named |
| Open Accounting | `?chapter=accounting` | **Accounting calendar** panel, **11 Close controls** |

**Why I got it wrong.** My probe looked for a clickable *ancestor* of each chapter heading and for
`<a href>` elements containing `?chapter=`. The control is neither: it is a sibling `<button>` with
an `onClick`, one level outside the heading's ancestor chain. Both measurements were accurate and
the inference drawn from them was not. A second probe then searched for a control named exactly
"Policies", which never matches "Open Policies".

Sections 4–7 of the repair instruction are premised on this defect. **They should not be
executed** — there is nothing broken to repair, and changing working navigation on a false premise
would be the larger error.

What survives from this finding is much smaller and is a naming question, not a navigation one:
the tile is called **Policies**, and an operator hunting for the word *Discounts* has to open it to
discover that the chapter heading inside says "Discounts & commercial policies".

### R2 — Kelly's entry point shows a TUITION card that is not the Assignment · **real**

Measured with the correct rendered identity this time. On BOTH the household entry point and the
child panel:

```
retiredCardByRenderedIdentity : true      ← the retired card IS composed
retiredCardByRegistryKey      : false     ← the old selector, still useless
schedulingPresent (entry)     : false
schedulingPresent (child)     : true
```

The retired card renders as **"TUITION · 2 of 2 agreed · Certb Certhouse · Program preschool …"**.

So the household panel offers a card headed **TUITION** which is *not* the Assignment surface. The
Assignment card — which owns Billing Frequency, both Billing Periods, the discount forecast, Add
exception and "Who owes this — set responsibility" — is `scheduling`, and it appears only after
opening a child.

**This is the most likely explanation of Kelly's report.** He found a Tuition card at the top
level, it carried none of those things, and he reasonably concluded they were missing. The
published tenant layout still composes `billing_preview`, so retiring it from the code default
never moved this tenant.

### R3 — the retirement never took effect, and my certification said it did · **E, mine**

`AssignmentTuitionCard` is composed under registry key `billing_preview` but emits
`data-universal-card-key="assignment_tuition"`. Every probe asserted:

```js
billingPreviewRendered: Boolean(document.querySelector("[data-universal-card-key='billing_preview']"))
```

That selector **can never match**, so it returned `false` whether the card rendered or not. The
rendered card list contains `assignment_tuition` — **the retired card is still composed on this
tenant**. Retiring it from the code default does not move a tenant that renders from a published
layout.

"billing_preview ABSENT from normal composition" in `AK-RESULT.md` and `DEPLOYED-STATE.md` is
**false and must be withdrawn**.

### R4 — my probes polluted Kelly's Human-QA record · **fixture damage, mine**

**19 of the 20 commercial-policy exception rows on Kelly's test family were authored by my
certification probes**, with reasons like:

```
"A-K — first of a duplicate pair"
"A-K — second, same start, must be refused or supersede"
"H/I — excluded for the next period, to prove no row is written"
"§12 — governed this period, and already ended"
```

His child's Assignment therefore reads *"Excluded for this assignment · discount · ended
2026-09-19 — §12 — governed this period, and already ended"*. Kelly is reading my test scaffolding
as if it were product state. Assignment `79f8011d` is currently `excluded_by_exception` for that
reason alone.

## 2. Capability-by-capability

| Capability | Class | Where it actually is | Why Kelly missed it |
|---|---|---|---|
| Responsibility — Details/Accounts | **A** reachable | sidebar → Financials → Accounts → account → gear. Plain click worked; 11 account rows; gear present | not on the household panel; **0 arrangements exist**, so nothing to display |
| Responsibility — Assignment | **A** | the Assignment card reads **"Who owes this — set responsibility"** | only on the child panel (R2) |
| Discount configuration | **B** | Policies chapter | unreachable (R1) |
| Assignment discount forecast | **A**, data polluted | `DISCOUNTS` block on the Assignment card | only on the child panel (R2); shows my test exceptions (R4) |
| Prepaid | **B** naming | Financials card: **"Available $125.00"**, at the entry point | the word *prepaid* appears **nowhere** in the product |
| Billing Frequency / Period — display | **A** | "Billing frequency weekly · current period Sep 15–21, 2026 · next Sep 22–28, 2026" | only on the child panel (R2) |
| Billing Frequency — configuration | **B** | Tuition chapter | unreachable (R1) |
| Accounting Period administration | **B** | Accounting chapter: 1 active calendar, 12 periods, Close controls | unreachable (R1) |
| Deposit | **F** | Payments-phase | unchanged; available prepaid ≠ held money ≠ Deposit |

## 3. Prerequisite configuration census — Kelly's family

| Fact | State |
|---|---|
| accepted tuition terms | **present** on both assignments (gross 145000 and 18500) |
| commercial discount policy | **present** — `5df9fc6c`, 10% |
| accounting calendar | **present** — 1 active, 12 periods |
| available prepaid | **present** — 12500 cents; held 0 |
| reductions on the account | 51 |
| children / assignments | 2 / 2 |
| **responsibility arrangements** | **0 — the one genuine data gap** |

So this is overwhelmingly **not** missing configuration. It is missing doors (R1, R2), one false
claim (R3), my pollution (R4), and one absent fixture fact (responsibility).

## 4. Defects, separated by kind

**Actual product / IA defects**
1. `/organization/financials` chapters are not navigable — three capabilities unreachable.
2. The household entry panel composes the retired card and not `scheduling`.
3. "Prepaid" is never named in the operator's language; only "Available" appears.

**Certification defects (mine)**
4. `billing_preview` absence was asserted with a selector that cannot match — claim withdrawn.
5. Probes mutated the Human-QA family, 19 exception rows.

**Fixture gaps**
6. No responsibility arrangement on the designated family.

## 5. Recommended sequence — not executed

1. **Withdraw** the `billing_preview absent` claim from `AK-RESULT.md` and `DEPLOYED-STATE.md`,
   and re-measure with `[data-universal-card-key='assignment_tuition']`.
2. **Clean my exception rows** off the family through the governed end/supersede path — never by
   deletion, and never by direct SQL.
3. **Make the chapters navigable** — the single highest-value repair, and the one Kelly's report is
   really about.
4. **Decide the entry-point composition**: either compose `scheduling` at opportunity grain, or
   make the Children row action an obvious route to the child's Assignment.
5. **Name prepaid** in the surface that shows it.
6. **Seed one responsibility arrangement** on the designated family through
   `billing.configure_responsibility`.
7. Only then re-run the Human-QA walkthrough. The catalog stays `2026-09-20.3`, Human PASS **ZERO**.

## 6. The one-record Human-QA fixture

The existing family can become it through governed product actions alone — accepted terms,
policies, calendar and prepaid are already right. It needs: my exception rows retired, one
responsibility arrangement created, and a clean discount state. **No reseed and no direct inserts
are required.**
