---
owner: platform
status: canonical
last_reviewed: 2026-09-11
supersedes: []
---

# 10 — Slice B.4: incremental sync and the administrative foundations

**Status: PARTIAL.** The backend deliverables are implemented and certified. The
Integrations product UI is **not built**, and the reason is recorded below rather
than worked around.

## Why the UI was not built

Part 21 requires mounted browser evidence, and exit criterion 24 requires it to
pass. **`ALLOY_WORKTREE_SLOT` is unset in this lane**, so a dev server and a
browser automation run are heavy validation the watchdog terminates — the same
constraint that has blocked `tsc` here since Thread 1 and that forces every
typecheck through the broker.

Shipping an operator surface that manages machine credentials **without** the
browser proof the instruction mandates would mean asserting a certification that
was never performed. So this slice built the layer the UI must sit on — the parts
that are certifiable headlessly — and stopped.

Everything below is real and tested. Nothing claims a surface that does not exist.

## Implementation paths

| Concern | Path |
|---|---|
| `updated_since` (G-12 closed) | `supabase/migrations/20260911130000_external_locations_updated_since.sql` |
| Watermark parsing | `web/lib/platform/external/collection.ts` |
| Administrative audit | `web/lib/platform/admin/administrativeAudit.ts` + `20260911140000_administrative_audit_attempted.sql` |
| Internal operator authorization | `web/lib/platform/admin/integrationsAdminAuth.ts` |
| Installation health | `web/lib/platform/admin/installationHealth.ts` |
| Scope presentation | `web/lib/platform/external/scopePresentation.ts` |
| Certification | `web/tests/platform/external/b4Foundations.test.ts` |

## Incremental sync

`GET /api/v1/locations?updated_since=<ts>` — **strictly after**, composing with
cursor, filters and the boundary. The boundary clauses are unchanged and still
evaluated first, so an incremental read can never reach a location a full read
could not.

Two decisions worth their reasoning:

- **A timestamp without a timezone is refused, not assumed.** The same string is a
  different instant to a partner in another timezone; silently choosing UTC would
  skip or re-deliver rows at every boundary.
- **Strictly greater, not greater-or-equal.** A caller checkpoints the newest
  watermark it received; `>=` would re-deliver that row on every subsequent call
  forever. The overlap a partner needs is one *they* choose by rewinding, which
  the guide instructs — because `updated_at` is wall-clock and not transactionally
  ordered.

**The deletion gap is documented, not papered over.** `updated_since` cannot
report a removed row. The developer guide says so plainly and tells integrators to
reconcile disappearances with a full bootstrap. Deactivation is different and is
visible.

## Administrative audit — B.1's open question, resolved

B.1 recorded that best-effort audit is right for authentication success and wrong
for consequential administrative acts. `withAdministrativeAudit` resolves it by
**inverting the order**:

1. Write a durable `attempted` row **before** the act.
2. Perform the act.
3. Finalize to `allowed` or `error`.

If step 1 fails, the act **never happens** — nothing changed, and refusing is safe
and honest. The naive alternative (act, then audit, then fail the response)
produces the worst available outcome: the credential exists, the operator is told
it does not, and nothing records either fact.

> **Invariant: no consequential administrative act can occur without a durable
> record of the attempt already existing.**

A finalize that fails leaves the `attempted` row, which tells an investigator the
act was begun, by whom, against what.

## Internal operator authorization

Two permissions, exact-match, resolved through real grants rather than a role
literal — the pattern Thread 3 found Alloy is eliminating.

| Permission | Operations |
|---|---|
| `integrations.read` | list installations, view one, view activity |
| `integrations.manage` | create installation, edit access, create/rotate/revoke credential, suspend, disconnect |

**The two sides of the trust boundary never touch.** A public scope says what an
external application may do; an internal permission says what an Alloy operator
may do. A test asserts no public scope appears as an internal permission or vice
versa. Minting a credential is granting machine authority to software — at least
as consequential as granting a person a role, and gated accordingly.

## Installation health

Four states, derived on read, never stored — a persisted status is a second truth
that drifts.

| State | Meaning |
|---|---|
| `healthy` | Recent successful requests |
| `needs_attention` | No active credential, expired credential, or all recent requests failing |
| `inactive` | Suspended or revoked — **deliberate, not a fault** |
| `no_recent_activity` | Never used, or idle |

**Idle is not unhealthy.** A nightly integration is silent for twenty-three hours
by design. `no_recent_activity` is its own state so an operator is never told to
fix something working as intended. No score, no inference.

## Scope presentation

`locations.read` becomes **"Locations — View your sites and the rooms within them.
No addresses or access codes are shared."** Every entry *derives* from
`PUBLIC_SCOPES`; this layer adds words and never authority, and a test proves
every catalog scope has words so the two cannot drift.

An unrecognised scope renders as itself, marked unrecognised, and is treated as a
**write** — so an unknown grant can never be presented to an operator as a
harmless read.

## The finding that most affects Thread 5

**A third external credential system landed on staging from another lane while
this slice ran.**

`20260911120000_attendance_integration_producers.sql` adds
`attendance_integration_producers` (its own hashed credential),
`attendance_integration_producer_sites` (its own site boundary) and
`attendance_integration_mappings` (its own external-ID correlation).

What is **right** about it: it resolves into the same `NonHumanProducerAuthority`
the attendance gate already takes, so it is not a second *authorization* model,
and it is careful work — org read from the row, digest selected on, never
compared.

What is **divergent**: it is a second external **credential** store, a second
external **resource boundary**, and a second external **ID correlation** system —
the last being precisely the "separate external identity mapping system" the
Thread 4 handoff told Thread 5 not to invent. Its own header records that it has
**no rotation**, which the Developer Platform credential has.

**Why this is still cheap to converge:** it is **library-only — no `/api` route
exists**. It is a domain ingestion capability, not a live competing HTTP surface.

**Why it matters to this slice specifically:** an Integrations surface built over
`app_installations` alone would show an operator "no integrations" while an
attendance producer was actively ingesting. That is a product lie, and it is the
strongest argument for converging before the UI is built rather than after.

**Recommendation, not a decision:** the two should converge on the Developer
Platform's installation + credential + `integration_resource_refs` model, with
attendance producers becoming installations holding an attendance write scope.
That is a Director-level call affecting two lanes, so it is filed rather than
acted on.

## Generic platform gaps

| # | Gap |
|---|---|
| **G-14** | **Two external credential systems now exist** (plus the kiosk device credential, which is legitimately domain-specific). See above. |
| G-15 | **No `integration_resource_refs`.** Thread 4 ratified it; nothing has built it, and the attendance lane filled the vacuum with its own. |
| G-16 | **No deletion feed.** `updated_since` cannot report removal for any resource. |
| G-12 | **Closed** by this slice. |

## What B.4 did not deliver

Deliverables 3–15 and 18 — the Integrations collection, creation flow, detail,
location editor, credential UX, state operations, activity surface, documentation
entry, API reference surface, and browser certification. All are UI or depend on
it, and all need a slotted lane.

## Recommended B.5

1. **Resolve G-14 first.** Building the Integrations UI over a model that is about
   to absorb a second credential system means building it twice.
2. **Then the UI, in a slotted lane**, against the foundations this slice
   certified — authorization, audit, health and scope presentation are done and
   tested, so B.5 is genuinely a product slice rather than a security one.
3. Admin API endpoints, then the collection, then installation detail.

Not in B.5: mutations, Classroom Coach, identity-heavy resources. **SEC-0c, SEC-0
and the idempotency layer remain prerequisites before any external mutation.**
**D-1 remains unanswered.**
