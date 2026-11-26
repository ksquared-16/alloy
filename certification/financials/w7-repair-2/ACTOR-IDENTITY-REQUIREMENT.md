# A user who moves money must resolve to a named human — the requirement, the enforcement point, and what is left

**Director's decision (W7-F002):** "A user permitted to create financial activity must be capable of
resolving to a recognizable human identity for the financial audit trail. The steady-state product
must NOT accept 'Created by a person whose name is not on file' as normal financial attribution."

## The requirement, in one place

`web/lib/financials/identity/financialActorIdentity.ts`. One resolution path:

    auth.users.id → user_person_links (status = active) → persons → a human name

and six statuses, because every unmet case implies different work: `named`, `no_actor`,
`not_linked`, `person_missing`, `person_unnamed`, `unreadable`.

**Not paths, by construction:**

* **Email**, in either direction. The bridge's own migration refuses `persons.email = auth.users.email`
  and it is right: email is mutable, unique by no constraint in this schema, and shared in practice.
  A wrong link puts one operator's name on another operator's financial act and nothing announces it.
* **The auth account's own display name.** `user_metadata.full_name` is still *displayed* — a weak
  name beats no name on a screen, and it is what the panel read before — but it does **not** satisfy
  the requirement and deliberately does not touch `requirementMet`. Reporting it as met would close
  the gap on screen and leave it open in the data, which is the shape of the original defect.

The Details panel now carries both answers: whatever name it has, and — when the requirement is
unmet — a sentence naming the unmet requirement and where it is closed. `describeChargeOrigin`'s
unnamed sentence changed from "Created by a person whose name is not on file" to "Created by an
operator the ledger cannot name", which says what is absent instead of merely that something is.

## Measured state of the estate

`gar_58a6eea3af6f8e` (census artifact beside this file):

| fact | value |
|---|---|
| distinct financial actors (charges + reductions) | 4 |
| with an active person link | **0** |
| resolving to a named person | **0** |
| users holding a money-capable org role (`owner`/`admin`/`ops`) | 13 |
| money-capable roles actually in use | `admin`, `ops` |
| named, unarchived persons available to link | 31 |
| `user_person_links` rows of ANY status | **0** |

## Why the estate is in that state: the bridge had no writer

`user_person_links` has existed since `20260911100000_user_person_identity_link.sql`. A
repository-wide search finds **one reader** (`resolveLinkedPersonId`) and, before this slice, **zero
writers** — no API route, no operator surface, no service. The table's own migration says a link "is
an explicit, recorded, revocable act or it does not happen", and nothing in the product performed
that act. So the requirement was unsatisfiable, not merely unsatisfied.

This slice adds the narrowest possible writer, in Access's namespace and behind Access's own gate:

* `GET /api/admin/access/person-links` (`admin.users.read`) — which accounts are linked, which
  money-capable accounts are not, and which named persons could be linked. No email and no display
  name is returned for an unresolved account; only its id and its roles.
* `POST /api/admin/access/person-links` (`admin.users.write`) — records one link. Both ids are
  required from the caller, a `note` is required, an unnamed or archived or cross-org person is
  refused, and both cardinality collisions are reported as refusals rather than faults.

It introduces no identity model, no invitation flow, no account lifecycle and no operator UI.

## The smallest compatible enforcement point

**It is the grant, not the mutation. `user_roles` acquiring a money-capable role.**

Why not the mutation boundary: refusing a financial write because the actor's identity was never
linked strands a real person mid-transaction for an administrative omission they cannot fix from
that screen — and with 13 money-capable users and 0 links, it would stop the tenant's billing
outright. That is not an enforcement point, it is an outage.

Why the grant: it is the exact moment a user becomes *able* to move money, it is performed by
someone who can also link the person, and refusing there costs nobody a transaction. A user who
never acquires the capability never becomes an unattributable financial actor.

`MONEY_CAPABLE_ORG_ROLES` and the predicate an enforcing path needs are exported from the Financials
module for that path to call. Financials does not reach into `user_roles` itself.

## Cross-lane Identity/Access work, named explicitly

1. **Grant-time enforcement.** `user_roles` refuses, or warns and records, a money-capable grant to a
   user with no active person link. Owner: Access. This is the enforcement point above.
2. **An operator surface for linking.** The route is the act; a Director mid-walkthrough should not
   have to call an API to close an identity gap. Owner: Access. Natural home is the Users surface,
   beside the role editor that grants the capability.
3. **Revocation.** The table models `revoked` with its own actor and timestamp, and this slice writes
   only `active`. Revoking a link is a real administrative act and is not implemented.
4. **Backfill posture for the 31 named persons.** Deciding which of them is which of the 13 accounts
   is one human decision per account. It must not be inferred, and this slice does not infer it.

## What is NOT claimed

That the deployed tenant's attribution is now named. It is not: the product can now record the
decision, and the decision has not been made for any account. Each one is a single `POST` with the
two ids and a reason — see the run report for the exact call — and until then the Details panel says
so honestly rather than printing a name it does not have.
