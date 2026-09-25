# §9 / §10 / §11 — What the account list must know to be interactive

Read from source at `a4fd9191`. No measurement here; this is what the code *requires*, which
bounds what any progressive settling would be allowed to do.

## §11 — Does position have to block the list?

**Structurally, today: yes. By necessity: no.**

`FinancialsAccounts.tsx:232` renders from
`subjects.data && position.data ? joinAccounts(subjects.data, position.data) : []`,
so until both endpoints land the list is empty. The client fetches them concurrently, so the
list's wait is `max(subjects, position)` — currently `max(≈790, ≈650–960)` ms, plus the client.

But `joinAccounts` (`lib/financials/workspace/accountsRail.ts:104`) iterates
**`subjects.subjects`** and nothing else. Position is looked up per subject and *decorates* the
row. Every property that makes a row findable, filterable and clickable — `customerId`,
`householdName`, `childNames`, `contactNames`, `programs`, `rooms`, `hasEnrollmentAgreement` —
comes from subjects. Position contributes only money: `outstandingCents`, `collectibleCents`,
`suppressionCents`, `varianceCents`, `charges`, `hasOrgScoped`, `currencyCode`.

So the row set is subjects'. Position cannot add, remove or reorder a row.

## §10 — The minimum truth for an interactive list

| Fact | Source | Needed to be interactive? |
|---|---|---|
| `customerId` | subjects | **Yes** — it is the click target |
| `householdName` | subjects (position carries a fallback copy) | **Yes** — it is how a row is recognised |
| `hasEnrollmentAgreement`, site ids | subjects | **Yes** — site scoping decides visibility |
| `childNames`, `contactNames` | subjects | **Yes for search** — an operator finds a family by child |
| `programs`, `rooms` | subjects → `readCurrentPlacements` | **Filter vocabulary only** |
| money columns | position | **No** — they are read, not operated |

## §9 — Which of those may settle progressively, and the one rule that binds it

Two candidates, and they are not equally safe.

**Money may settle — but only against a three-state contract.** `joinAccounts` already has a
`noActivity: true` branch that writes `outstandingCents: 0` for a household with no posted
charges. That is a *true* zero and must keep rendering as one. A household whose position has
simply not arrived yet is a different thing, and writing the same zero for it would be a
**fabricated balance** — the thing this slice is explicitly forbidden to do. So a progressive
list needs three states, not two, and they are the same three the Financials card already
distinguishes:

- **KNOWN** — position landed, figure rendered.
- **KNOWN ZERO** — `noActivity`, genuinely no posted charges. Renders `0`.
- **NOT YET KNOWN** — position outstanding. Renders the honest reserved state, never `0`.

**Filter vocabulary may settle**, because a chip that has not appeared yet removes no household
from reach: the list is still complete, still searchable by name and child, still clickable. The
one rule is that a filter control must not offer an *incomplete* vocabulary as if it were
complete — an empty facet set and a pending one are as different as a zero and an unknown.

## Why none of this is implemented yet

`programs` and `rooms` — the only purely-decorative facts on the list — are produced by
`readCurrentPlacements`, which the instrument now shows to be a **four-wave dependent chain**
(`pl_members` → `pl_placements` → `pl_instances` → `pl_programs` → `pl_rooms`) sitting inside
what reported as one `facets` span, the largest on the subjects branch.

That makes it the leading candidate for the pole and the cheapest thing to defer, since it is
filter vocabulary rather than list truth. **It remains a candidate.** Two repairs this slice were
argued exactly this way from exactly this kind of reading, both landed, both are gated, and
neither moved the deployed number. The instrument is in place to settle it; the next step is a
deployed sample, not a third repair.
