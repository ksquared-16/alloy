# DELEGATION_CEILING_UNRECOVERABLE_REVOCATION

**Status:** OPEN — needs a Director decision. Not repaired in the Access Administration Split.
**Introduced by:** `20260915130000_w18_delegation_ceiling.sql` (Access Delegation Ceiling V1, PR #980).
**Found by:** the Access Administration Split's regression reconciliation, 2026-09-15.

## The finding

W-18's invariant is `ADDED ⊆ ACTOR EFFECTIVE AUTHORITY`: a principal may grant only capabilities it
already holds. The rule is correct and closes a real escalation hole.

It has no floor. If a capability is revoked from **every role in an organization**, then no principal
in that organization holds it, and therefore **no principal can ever grant it back**. The capability
is unrecoverable through the product. Not by an administrator, not by the person who revoked it, not
by anyone — `replace_role_permission_grants` is the single operator-reachable writer, and it refuses
the restore with `delegation_ceiling:<key>`.

This is not theoretical, and it is not a slow leak. It was reproduced end-to-end:

1. `newOrgBootstrapAndRevocation.live.test.ts` deliberately revokes `reports.write` from `admin`,
   the only role in the certification tenant holding it — the test's own subject.
2. Its `afterAll` restores the tenant through the same canonical RPC.
3. After W-18 landed, that restore began failing with `delegation_ceiling:reports.write`, and nothing
   read the error, so the tenant was silently left short a capability.
4. Every subsequent run then failed the test's own precondition, and the personas suite's
   "an administrator holds every catalogued capability" failed alongside it.

The repair required a direct `INSERT` on `role_permission_grants` — the infrastructure path. There is
no product path.

## Why the self-lockout guard does not cover it

`replace_role_permission_grants` already refuses to remove **access administration** from the actor's
own only role (`self_authority_lockout`, re-keyed to `admin.roles.write` by the split). That guard
protects the ability to *operate the editor*. It says nothing about any other capability: an
organization can still revoke `fin.read`, `health.view` or `reports.write` from its last holder and
find the decision permanent.

## What is NOT proposed here

An origin-based or actor-based exemption in the RPC. `p_origin` is caller-selectable, and that is
precisely the hole W-18 closed; an exemption keyed on it would reopen it. The Director's instruction
on W-18 was explicit: *"Do not invent exceptions for convenience."* This record is not an exception.

## Options for the decision

1. **Accept it.** Full revocation is rare and deliberate, and recovery by migration is acceptable.
   Cost: an organization can permanently disable one of its own capabilities with no warning and no
   way back, and will discover it by being refused.
2. **Warn at the boundary.** The editor refuses, or confirms explicitly, when a save would remove the
   last grant of a capability anywhere in the organization. Does not change the ceiling; makes the
   irreversibility visible at the moment it is chosen.
3. **Give the ceiling a floor.** A seeded system role (or the seed function) may restore a catalogued
   capability that no role holds. This is a real widening of who may grant, and needs the Director to
   say so explicitly rather than being slipped in as a fix.

Option 2 is the smallest truthful move and does not touch the invariant. Recommended as the default
if no larger decision is wanted.

## Where it is recorded in code

`web/tests/access/live/newOrgBootstrapAndRevocation.live.test.ts` — the `afterAll` restore states
this finding at the site that discovered it, and uses the infrastructure path deliberately rather
than papering over the gap.
