# The progressive Details floor is blocked on a product decision, not on engineering

Measured, implemented, and then **set aside** — because shipping it would override a recorded,
gated product decision that says the opposite, and that is Kelly's call rather than mine.

## What the measurement found

Deployed `2ed2a31e6`, account-selection milestones (cold, from the click):

| milestone | P50 |
|---|---|
| selected row | 113 ms |
| **Details floor geometry** | **1,194 ms** |
| usable floor | 1,196 ms |
| first financial meaning | 1,197 ms |
| ledger | 1,198 ms |

The row commits in ~113 ms. Everything else waits for one thing: the account's deep read
(`/api/admin/financials/card`, landing ~1,177 ms).

Two incidental findings, both good news:

- **A's truth does NOT survive under B.** Selecting a different account cleared the previous 116
  ledger rows and its six KPI figures within 150 ms — `key={account-${selected}}` discards the
  subtree. §11's latest-account-wins already holds.
- **But whose floor is on screen was not observable**: the floor carried no account identity
  attribute at all, so the property could only be inferred from row counts.

## The conflict

`FinancialsCard.tsx:4606` gates the Details surface on `vm && reconciliation`. That guard is not
incidental — it is held by a test, **`F44 · no visible partial Details`**, whose rationale reads:

> *"Details opens, a ledger-shaped surface appears, and it is then replaced by the real ledger.
> Every previous pass attacked a symptom — the entrance animation, the skeleton's honesty, **the
> reserved region** — and the operator kept seeing two Details. The fact is structural: a Details
> destination may not be RENDERED until the deep read its ledger depends on has resolved."*

It asserts specifically that no `<FinancialsDetailCard hydrating` may be constructed.

This instruction's §5 and §8 ask for exactly that: mount the floor immediately, with the ledger
region in an honest pending state.

I built it, and it works — the canonical floor already carries `hydrating` (full shape, em-dash
figures) and `ledgerPending` (the ledger draws its **columns** and says it is reading, stating **no
rows at all**, so there is nothing to rewrite). `hydratingFinancialsEvidence()` still exists and is
imported by `FinancialsCard` but **never used** — an orphan of the branch that was removed.

I judged that `ledgerPending` answers the double-load objection, because the objection was the rows
rather than the shape. **But F44's own text names "the reserved region" as a symptom-fix that was
already tried and still failed.** That is evidence against my judgement, from the people who
watched operators use it. I am not willing to delete that gate on my own reading.

## The third option the gate assumes, which does not exist on this host

F44 tolerates the strict guard because of a companion assertion: the card *"reads ahead so it is
usually ready"* — an idle prefetch started while the compact card is on screen.

**That prefetch never runs in the Accounts workspace.** It is guarded by
`if (!hostSuppliesProjection || provisioned?.state !== "ready") return;`, and
`FinancialsAccountDetail` supplies no `operationalProjection`. So on this host the read begins when
the account is selected and the operator waits the full ~1.1 s — the premise that makes the strict
guard acceptable elsewhere is simply absent here.

## The decision

1. **Override F44 for the Accounts floor** — ship the pending floor (built, gated, set aside in
   stash `d3ed9396`, with its 11 gates held at
   `scratchpad/detailsFloorPending.test.ts.pending`). F44 would be narrowed to the Focus Panel,
   where its reasoning was gathered. Risk: the double-load complaint returns.
2. **Keep F44 and make the read-ahead real on this host** — give the Accounts workspace the
   projection/prewarm the gate already assumes, so the read is usually in flight before the click.
   Respects the recorded decision; the win depends on how much earlier the read can start.
3. **Accept the wait** and close the slice.

Option 2 is the one I would recommend: it pursues the instruction's objective — selection becomes
useful immediately — through the mechanism the product already chose, instead of re-litigating a
decision that was made against measured operator behaviour.

Nothing was shipped. No gate was weakened. The tree is green.
