# Conversation Platform — Executive Summary

**Date:** 2026-07-31 · **Phase:** 0 complete · **Audience:** leadership
**Status:** awaiting acceptance; Phase 1 not started

---

## Why this sprint happened

Alloy had communications features — an inbox, a composer, templates,
announcements, preferences — built incrementally across several sprints by
different tracks. Each worked. None of them agreed with the others.

The Conversation Platform V1 initiative was chartered to unify them into one
runtime. Before committing to a five-phase build, we ran a discovery pass across
thirteen workstreams to find out what actually existed.

Discovery found more than duplication. It found **production safety defects** —
endpoints that could send messages or charge cards without authentication,
credentials that outlived their authorization, and a message-eligibility gate
that did not actually gate anything.

Building a platform on top of those defects would have made them permanent. So
Phase 0 was inserted ahead of Phase 1: a bounded production-safety track, with an
explicit rule that it must not turn into the platform build.

## What Phase 0 accomplished

Twenty-four commits. Eleven changes an attacker or user can observe. Seven
foundations built and tested but not yet consumed. Four database migrations,
replay-certified locally and applied to no shared environment.

**Phase 0 was not platform delivery, and this summary should not be read as
claiming otherwise.** The thirteen workstreams remain almost entirely
unimplemented. What Phase 0 bought is a floor that is safe to build on.

## Major risks eliminated

| Risk | Before | After |
| --- | --- | --- |
| **Unauthenticated card charging** | `POST /admin/payments/run` could execute a charge with no credential | Requires a dedicated secret; fails closed when unconfigured |
| **Unauthenticated SMS sending** | Two dispatch routes accepted any caller | Both require a workflow secret, checked before any lookup |
| **SMS oracle** | Six of nine send sites fired on *rejection* branches — supplying only a contact id produced a message | Rejection branches send nothing |
| **Home-access disclosure** | Assignment texts contained customer phone, street address, entry method and access notes, gated by a 5-digit code | Removed; the message states the limitation instead |
| **Brute-forceable acceptance** | The 5-digit code had no attempt limit | 5 tries / 15-minute lockout, plus replay suppression |
| **Long-lived credentials on children's photographs** | Seven-day signed URLs | Capped at 15 minutes everywhere |
| **Credential persistence** | A signed URL was written into shared person metadata, making one actor's expiry-bound credential durable and readable by all | No longer persisted; resolved per request, per actor |
| **Path-guessable documents** | Signing authorized on the storage path | Authorizes on the database row; path guesses fail closed |
| **Ignored opt-outs** | Inbound STOP/START/HELP were not processed | Honored and acknowledged |
| **Broken announcement targeting** | The live table shape did not match what the API wrote | Repaired to the canonical shape |

Two points of honesty about severity. Live verification showed the tenant is
**pre-production** — seven messages total, zero opted-out people. Several defects
were therefore *latent* rather than causing active harm, and an earlier
assessment of mine that overstated this was corrected. Separately, storage was
found to be **fail-closed** already (private bucket, RLS enabled with no
policies), so no storage redesign was warranted and none was done.

## Major architectural discoveries

Four findings that change how the platform should be built.

**1. The enforcement floor was not where everyone thought.**
`executeCommunicationsSend` looked like the send gate. It is a wrapper with four
independent bypasses — most simply, one route accepts a free-text destination
with no person reference, so a row-level check has nothing to check. The real
choke point is `enqueueCanonicalOutboundMessage`, which covers ten of fourteen
send paths. Phase 0 moved enforcement there. **Four paths still bypass it**, and
closing those is Phase 1 work, not a detail.

**2. Classification is an authoring fact; eligibility is a live fact.**
Whether a message is marketing or transactional is decided when it is written and
never changes. Whether a recipient may receive it depends on their state at
dispatch time. Conflating the two is why the previous gate was inert. The runtime
now takes an immutable eligibility snapshot at enqueue and revalidates live
conditions at dispatch — two layers, deliberately.

**3. The platform spans two runtimes, so the contract must be data.**
Authoring is TypeScript; dispatch is Python. Neither can import the other. Shared
vocabulary now lives in versioned JSON contracts that both sides load, with
parity tests on each side. This is the seam, and it is permanent by design.

**4. Correct-looking authorization can still be wrong.**
Late in the sprint, an inventory pass caught a route that called the
authorization helper correctly, returned errors to unauthorized callers, and had
passed commit review — while handing *authorized* callers a seven-day credential
minted **before** the check ran. Two of Phase 0's own published claims were false
at that moment. The lesson is structural: **claims about convergence must be
enforced by tests, not asserted by review.** They now are.

## Remaining work

Phase 0 deliberately left things undone. The significant ones:

- **Four send paths still bypass the enqueue gate.** Until they are converged,
  eligibility enforcement is strong but not universal.
- **Classification columns exist but nothing is required to populate them.**
  Instrumentation counts how often a category is defaulted rather than supplied.
- **The template *preview* endpoint uses a different renderer from the send
  path.** Parity is proven by unit test, not by wiring — a template can still
  preview differently from how it sends.
- **Most avatar surfaces have not adopted the per-request photo resolver**, so
  they show initials rather than photographs.
- **The legacy GHL cleaning vertical is contained, not resolved.** A separate
  decommissioning recommendation is written and waits on one operational check
  inside GoHighLevel.

Full detail: the Technical Debt Register and the Convergence Matrix.

## Why the Conversation Platform is ready for Phase 1

Three reasons, in order of importance.

**The floor is safe.** No unauthenticated write path remains in the
communications or payments surface. No credential outlives its authorization. A
platform built now inherits a defensible security posture rather than
institutionalizing defects.

**The shape of the problem is known and written down.** Phase 1 does not need to
rediscover where the send paths are, which renderer is canonical, or why the old
gate was inert. That knowledge is in this package, and the important invariants
are held by tests that fail when someone regresses them.

**The migration risk is understood and low.** Four additive migrations,
certified by clean replay, upgrade replay and idempotent rerun against a local
stack. No column dropped, no row deleted, no one-way door. Rollback is reverting
code; the schema can simply stay.

**The promotion caveat has been cleared.** This summary originally reported a
28-migration backlog and three orphan ledger versions blocking `db push`. That
figure was inherited from a stale note; the backlog had already been applied on
2026-07-27. A repair sprint on 2026-07-31 found the real blocker was a single
dashboard-minted orphan ledger version, reconciled it to its canonical
repository twin, and restored promotion: repo and ledger now agree at 298/298
and `db push` reports "Remote database is up to date". Staging is promotable.

## The one thing to hold onto

Phase 0's most valuable output is not a fix. It is the discovery that **the
system's real enforcement points were not where the code's naming suggested.**
Every future phase should assume the same is true elsewhere until an inventory
proves otherwise — and should leave behind a test, not a claim.
