# Financials 11B — deployed human-QA readiness

Measured on the deployed staging build, by clicking. No test ids were used as navigation, no
`?chapter=` was typed, and no API response is offered as proof that a capability is discoverable.

## Build under test

| | |
|---|---|
| merge SHA | `5f6065aa7b5479bdb48c8883fd25f0310c9bbf99` (PR #1118, merge commit, `MERGED` 22:23:36Z) |
| candidate | `18fdf05b9754eb0294ba3dc658d683af380873ae` — merged unamended |
| deployed `gitSha` | `5f6065aa7b5479bdb48c8883fd25f0310c9bbf99` |
| `gitBranch` | `staging` |
| `nodeEnv` | `production` |
| `vercelEnv` | `preview` — unchanged from the pre-merge build `9aed3032b`, so this is staging's normal identity, not a regression |
| `vercelDeploymentId` | `dpl_9JTgz4xxrXq6jPuyrrQDFkKikYYj` |
| Supabase | `ikaxilmwmrmbagoidedu` |

Deploy landed 22:30:13Z, about seven minutes after the merge.

## Published tenant layout — v164 holds

`billing_preview` occurs **0 times** in the entire published document. Both projections agree:

- `sections` (8): business_process, financials, children, household, health_safety, attendance, scheduling, milestones
- `metadata.focusPanelLayout.grid.areas` (6) and `.rows` (6): identical sets, `placementsWithoutSection: []`

`scheduling` and `milestones` are child-grain sections and are correctly not placed on the
household entry grid.

## Focus panel composition, deployed

Entry point renders exactly:

    business_process · financials · children · household · attendance · health_safety

`standaloneTuitionByRenderedIdentity` (`assignment_tuition`) — **false**. The registry key
`billing_preview` — also absent. Absence is measured by the RENDERED identity, because the registry
key is the selector that let a false absence claim into this record once already.

## A–N, all fourteen walkable

| | path | measured |
|---|---|---|
| A | Assignment tuition | Certa `$195.00/weekly` recommended, `Overridden $185.00/weekly from 2026-09-01`; Certb `Accepted $1,450.00/monthly from 2026-09-01` |
| B | Billing Frequency | `weekly` (Certa), `monthly` (Certb) |
| C | Current / Next period | Certa `Sep 15–21, 2026` → `Sep 22–28, 2026`; Certb `September 2026` → `October 2026` |
| D | Responsibility | Assignment: "Who owes this — set responsibility". Accounts: gear → canonical read-back |
| E | Discount forecast | Certa `$18.50 expected to apply`; Certb `$145.00 expected to apply` |
| F | Exception affordance | `Add exception` present on both |
| G | Financials Summary | entry card, `Balance $1,412.87` |
| H | Financials Details | `Available prepaid $125.00` |
| I | Accounts | 11 rows, 5 lenses (all, charges, credits, funding, payments), manage-responsibility gear |
| J | Multi-child Add | `Certa Certhouse` once, `Certb Certhouse` once, Household explicit |
| K | Available prepaid | `$125.00`, positive, separate from Balance |
| L | Tuition / billing config | Open Tuition → Tuition Plans, billing frequencies |
| M | Discounts / policies config | Open Policies → "Discounts & commercial policies", 10% policy visible |
| N | Accounting periods | Fiscal 2026, Calendar month, CURRENT, Open/Closed states, 12 Close controls |

## Prepaid naming — the code repair, now deployed

Named "Available prepaid" on all three surfaces: Summary `$125.00`, Details `$125.00`,
Accounts `AVAILABLE PREPAID $125.00`. The bare "Available $" form is gone from the summary card
(`bareAvailable: false`). `Balance $1,412.87` stays separate and un-netted.

AVAILABLE PREPAID ≠ HELD MONEY ≠ DEPOSIT: held money and deposits were deliberately left unrenamed.

## Organization Financials tiles

All seven tiles carry a real `BUTTON` open control. The Policies tile names discounts **before**
it is opened:

> Policies — How operational events affect financial execution. **Discount and deposit rules** ·
> Commercial policy eligibility · Organization-scoped policy authoring · **Open Policies**

## Accounting copy matches capability

> Closing a period is final — reopening one is not an action in Alloy.

Both halves rendered on the deployed calendar panel, beside 12 Close controls.

## Discount fixture — the active answer is clean

Zero ACTIVE certification exceptions. The 10% policy resolves against each child's accepted
tuition: 10% of `$185.00` = `$18.50` (Certa), 10% of `$1,450.00` = `$145.00` (Certb). Each figure
was read from that child's own Assignment section, with the subject derived from the section being
measured, so one child's number cannot be reported against the other.

Ended history remains readable and is not the active answer.

### Two counting corrections made during this smoke

1. `document.querySelectorAll("[data-exception-live]")` returned 1, which reads as "one active
   exception". It is not. The attribute matches on PRESENCE, and its value is `"false"` — it sits
   on the single ended row. Active exceptions are **zero**. A count of an attribute is not a count
   of the thing the attribute describes.
2. A first pass used `[data-account-row]` and `[data-account-lens]`. Neither exists in the product.
   Accounts read 0 rows, and the responsibility check silently degraded into substring matches
   against the whole page — which looked green. Re-measured with the real selectors
   (`[data-financials-account-row]`, `[data-financials-lens]`,
   `[data-financials-manage-responsibility]`) and scoped to the account surface.

## Responsibility, canonical read-back

Behind the gear, scoped to the arrangement panel:

    scope = household
    Applies to Household — the whole account: Certa Certhouse, Certb Certhouse
    Cert Certhouse  $18.00 · from Sep 18, 2026 · saving supersedes it

Open-ended. No arrangement was created. Note: the panel renders the amount as `$18.00` without the
word "fixed"; the fixed-amount semantics are carried by the arrangement, not by that label.

## Observed, not repaired: the child NAME is a dead click

On the Children card each child exposes two controls — the name (`Certa Certhouse`) and a row
action (`custom →`, `full_time →`). **Only the row action opens the child's panel.** Clicking the
name changes nothing: same URL, no dialog, no `scheduling` card, six cards unchanged.

The Assignment human path works, because the row action is ordinary visible navigation. But an
operator who clicks the child's name — the obvious target — gets silence. This is outside the
scope of this run (no new Financials development) and is reported, not fixed. Kelly's map below
names the control that works.

## Responsive

1280 / 1440 / 1680: six cards, no standalone Tuition, prepaid named, `horizontalOverflow: false`,
overflow 0px at every width.

## Human QA

ZERO / 44 PASS. Catalog 2026-09-20.3, unchanged. Nothing here marks a scenario passed — that is
Kelly's act.
