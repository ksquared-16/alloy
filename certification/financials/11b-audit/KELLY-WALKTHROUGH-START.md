# Where to start the Financials walkthrough

## Use this, not the dev server

**Start at:** `https://staging.workwithalloy.com/workspace/work-unit/enrolled-children`

The `:3012` link on the tail-net is an `npm run dev` server running from an agent worktree. It is
useful for looking at work in progress and it is **not** the accepted QA target: it recompiles on
every file change, its code is whatever a lane happens to have checked out, and nothing measured
on it is certification evidence. Use deployed staging.

Wait until `/api/build-info` reports the SHA named in the run summary before starting — a
walkthrough against the previous build proves nothing about this one.

## The map — four places, and what lives in each

### 1 · The household (where you land)

Six cards: Process, **Financials**, Children, Household, Attendance, Health & Safety.

The **Financials** card is the account at a glance:

- **Balance** — what the family owes
- **Available prepaid** — money already received and not yet applied. A separate figure, never
  netted into Balance. On this family it reads **$125.00**.
- **Details →** opens the full ledger

There is deliberately **no standalone Tuition card** here any more. Tuition belongs to an
Assignment, and an Assignment belongs to a child.

### 2 · A child's Assignment — tuition, billing and discounts

From the **Children** card, open a child by clicking the **arrow control on their row** — the one
reading `custom →` or `full_time →` beside the name. Measured on the deployed build:
**clicking the child's name itself does nothing** (no navigation, no panel). Use the row arrow.

Their panel adds an **Assignments** card, which is where the commercial setup lives:

- the tuition options and the accepted price
- **Billing frequency**, with the **current** and **next** billing period spelled out
- **Who owes this — set responsibility**
- **Discounts** — what is expected to apply, and **Add exception** to exclude a policy for this
  family, with a reason
- why an option did not apply, when one didn't

### 3 · Financials → Accounts — responsibility and the ledger

Sidebar → **Financials** → **Accounts** → open an account.

- **Responsible party** and the **Manage responsibility** gear
- the ledger, its lenses (all, charges, credits, funding, payments) and its filters
- the same **Available prepaid** figure as the card

### 4 · Organization → Financials — configuration

Each tile has an **Open …** button.

| Tile | What is inside |
|---|---|
| **Tuition** | Tuition Plans, and where weekly/monthly recurrence is configured |
| **Policies** | *Discounts & commercial policies* — the tile itself lists "Discount and deposit rules" |
| **Accounting** | The accounting calendar: current period, open/closed states, and Close. Closing is final — reopening is not an action in Alloy |

## Three words that are not interchangeable

- **Available prepaid** — received, unapplied, and free to settle anything.
- **Held money** — received and deliberately not available.
- **Deposit** — money taken for a purpose, with a release condition. Payments owns its lifecycle;
  it is not in this walkthrough.

## Status

Engineering readiness only. **Human QA is 0 of 44** — nothing in the catalog has been marked
passed, and this run did not walk it for you.


## Verified on the deployed build

Merge `5f6065aa7b5479bdb48c8883fd25f0310c9bbf99`, deployed as `gitSha`
`5f6065aa7b5479bdb48c8883fd25f0310c9bbf99`, branch `staging`, `nodeEnv` `production`, Supabase
`ikaxilmwmrmbagoidedu`. Published tenant layout v164.

Figures you should see on this family: Balance **$1,412.87**, Available prepaid **$125.00**,
Certa **$185.00/weekly** accepted with **$18.50** expected to apply, Certb **$1,450.00/monthly**
with **$145.00** expected to apply. Responsibility is a household arrangement, Cert Certhouse,
**$18.00**, from **Sep 18, 2026**, open-ended.

Full evidence: `certification/financials/11b-deployed-qa/DEPLOYED-HUMAN-QA.md`.
