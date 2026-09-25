# FINANCIALS_OPEN_COLLECTIONS_CHARGE_CAP_CORRECTNESS

**Status:** OPEN — carried, deliberately not repaired.
**Found:** during the account fact bundle acquisition slice, while moving the open-collections read
onto the bundle.

## The finding

`buildFinancialsCardVM` asks for open collection attempts over
`chargeIdsForReads.filter(Boolean).slice(0, 200)`.

That `.slice(0, 200)` is a URI-length guard. It exists because the charge ids used to travel in the
query string of a PostgREST request, and an over-long URI came back `414` with the error discarded.
On an account with more than 200 charges it silently stops looking: an open attempt on charge 201
is not found, and the surface reports fewer in-flight collections than exist.

The account fact bundle makes the transport constraint obsolete — the ids never enter a URI now,
and the function already returns every open attempt for the account.

## Why it was NOT repaired here

Removing the cap changes **which charges participate**, and that can change what an operator is
shown about money in flight. That needs its own correctness proof — which attempts appear, on which
charges, against a specimen with more than 200 charges — and it does not belong inside a slice whose
whole claim is that it changed transport and nothing else.

So the cap is preserved exactly, with the reason recorded beside it in
`buildFinancialsCardVM.ts`, and the repair is carried here.

## What the repair needs

- a specimen account with >200 charges and at least one open attempt beyond the 200th;
- before/after counts of open attempts, per charge;
- confirmation that nothing else keyed off the truncated id list;
- a gate that reddens if the cap returns.
