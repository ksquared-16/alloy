# §9 / §10 / §11 — Which facts may settle after the list is interactive

Proven from product semantics at `b52dd3df8`, not assumed. Every claim below names the code that
decides it.

## §9 — Programs and rooms are filter vocabulary, not row truth

Four independent checks, all agreeing:

1. **They do not decide membership.** `filterAccounts`
   (`lib/financials/workspace/accountQueue.ts:93`) narrows on them only when set:
   `if (filter.programId && !row.programs.some(...)) return false`. The default filter is
   `NO_ACCOUNT_FILTER = { search: "", programId: null, roomId: null, state: null }`, frozen, and
   `FinancialsAccounts.tsx:214` opens with exactly it.
2. **They are not even rendered at first paint.** `filtersOpen` starts `false`; the program and
   room selects live inside that panel.
3. **They are not searchable.** `searchableNames(row)` is household name + child names + contact
   names. An operator finds a family by name or child, never by classroom.
4. **The vocabulary is derived from the rows themselves.** `facetOptions` builds each dropdown from
   the cohort in hand, so a facet that has not arrived yields a shorter list — never a wrong row.

**Classification: FILTER VOCABULARY / COLUMN METADATA. Eligible to settle progressively.**
The one binding rule: a filter control must not offer an *incomplete* vocabulary as if it were
complete. An empty facet set and a pending one are as different as a zero and an unknown.

## §10 — Position: every visible value it supplies

`joinAccounts` (`accountsRail.ts:104`) iterates `subjects.subjects` and looks position up to
decorate each row, so position cannot add, remove or reorder a row. What it supplies:

| Value | Used for | Classification |
|---|---|---|
| `outstandingCents` | the row's money, and `accountState` | **HONESTLY DEFERRABLE** — never as zero |
| `collectibleCents`, `suppressionCents`, `varianceCents` | money, and `accountState` | **HONESTLY DEFERRABLE** — never as zero |
| `charges`, `hasOrgScoped` | the row's caption | HONESTLY DEFERRABLE |
| `currencyCode` | formatting | HONESTLY DEFERRABLE |
| `householdName` | a *fallback* only; subjects is the owner | not required from position at all |

**Nothing position supplies is required before first interaction.** Row identity, ordering,
membership, search and click target are all subjects'.

## §11 — The three-state contract, and the trap that makes it mandatory

`accountState` (`accountsRail.ts:166`) is derived **entirely** from position money:

```
if (outstandingCents > 0)  return "outstanding";
if (suppressionCents > 0)  return "with_agency";
if (varianceCents !== 0)   return "variance";
return noActivity ? "no_activity" : "settled";
```

This is sharper than the zero problem already named, and it is the reason the contract cannot be
optional. A progressive row that leaves the money at zero does not merely show a wrong number — it
falls through every branch and renders the household as **"Settled"**. An account with $2,023.87
outstanding would wear a Settled chip until position landed, and would be *excluded* from the
Outstanding state filter while it did.

So the three states must reach the state chip and the state filter, not only the figures:

- **KNOWN** — position landed. Figure and chip render.
- **KNOWN ZERO** — `noActivity: true`, genuinely no posted charges. Canonical zero, chip
  `no_activity`. This is a real answer and must keep rendering as one.
- **NOT YET KNOWN** — position outstanding. Reserved presentation. **Not** zero, **not**
  `settled`, and the state filter must not silently claim such a row is or is not a member.

The same distinction the Financials card already draws between KNOWN ZERO and UNAVAILABLE.

## What this does NOT yet say

Whether any of it is worth doing. That is the measurement's answer, and the measurement is the
reason the instrumentation was promoted. This file settles only what a repair would be *allowed*
to do if the evidence points at it.
