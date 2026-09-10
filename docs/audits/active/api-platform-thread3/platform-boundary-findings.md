---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — resource, command and event boundary findings (Phase 1)

Against promoted staging `4f21979e6bec`. Point-in-time discovery, not doctrine. Nothing here
designs an API.

---

## 1. Resource boundary — the single-record read *is* the view model

Alloy has **no resource layer for its core records**. `GET /api/admin/entity/{type}/{id}` — the
single-record read for person, location and household, and one of only 14 routes in OpenAPI — is
shaped by the surface that asked for it:

- it takes `?surface=drawer|overview|full`, so the response shape is a function of the caller's UI
- it accepts the literal id `"new"` and returns a create-mode sentinel
- it gates on a primitive named `assertEntityDrawerRecordReadable`
- it injects presentation into the payload at roughly fifty sites: `_status_display`,
  `_location_label`, `_frequency_label`, `display_total_cents`, and so on

The `_` prefix is the codebase's own admission that these are not columns. Both classes ship in one
body.

**Verbs are incomplete across the core records.** Only `customer-members` has a GET-one. Household
has no create and no retire. `persons` has archive columns and no archive route. Child has **no
single identifier** — one endpoint declares `customer_members.id` "the durable attention subject,
NEVER `person_id`", while the child drawer requires a `persons.id`, and that column is nullable.

### Ranking

**Strong** — `entity_layouts` (versioned draft→published with optimistic concurrency, the
best-formed resource sampled) · `child_attendance_events` · GL and ledger tables ·
`commercial_products` · `announcements` · `communication_templates` · `schedule_patterns` ·
`child_placements` · `schedule_assignments` · `child_enrollment_agreements` · field definitions

**Weak, needs reshaping** — `persons` · `locations` · `customers` · `customer_members` ·
communication threads and messages · `charges` and `financial_journal_entries` (real tables with
**zero HTTP exposure**)

**Not a resource** — every queue payload · the Focus Panel model shipped over HTTP by
`/api/admin/durable-record` · all `*-bootstrap` and `*-bundle` responses · every `/view-models/*`
route · `child-participation` · `scheduling?view=…` · both `card` routes · several settings
derivatives

The platform already says so where it matters most: `web/lib/queues/types.ts` states queue rows are
*"preview projections for lane rendering — not authoritative records"*. Queue item ids are
synthetic (`processing:{id}`, `communications:{id}`, `synthetic-waitlist:{id}`), and the Focus Panel
wire model carries `onClick?: () => void` — a JavaScript closure in a payload.

**Tenancy is not RLS.** Every admin route uses a service-role client; isolation rests on
hand-written `org_id` predicates. The `locations` and `customers` RLS policies do not reference
`org_id` at all.

### One correctness finding, incidental to the API question

`childPlacementService` and `scheduleAssignmentService` both throw
*"Operational placement changes must use supersede…, not update-in-place"*. Yet
`applyChildParticipationEdit` updates `child_placements` and `schedule_assignments` **in place**,
bypassing both guards. Two doors, two different histories.

## 2. Command boundary — a capability layer with the enforcement seam deliberately closed

The Operational Command Runtime is well built and was clearly designed for more than buttons: an
`origin` enum that already includes `"api"`, code-owned handlers config cannot override, snapshot
invariants that fail loudly, delegation proven to happen exactly once.

But `authorizationEvaluated: false` is a **literal type**, and the invariant checker fails any
snapshot claiming otherwise. The runtime cannot record that authorization was asked. Per-action
checks exist in 7 of 27 definition files. Full detail in
[`trust-boundary-findings.md`](./trust-boundary-findings.md) P0-3 and P0-4.

Other UI-shaped assumptions a non-UI caller would hit: **confirmation is a client assertion the
server never verifies** (outside a three-key destructive allowlist, omitting the confirmation object
entirely passes the gate); **subject authority depends on which UI placement the caller claims**;
audit is declared on all 27 definitions and emitted by 2, best-effort, outside the mutation's
transaction; there is **no transport-level idempotency**; and success paths call
`revalidateTag`, which is Next.js render-cache invalidation and inert for any other caller.

**Verdict:** an internal UI execution system with a genuine capability boundary drawn inside it —
but the boundary is a *classification* layer, not an *enforcement* layer.

**Correction to Thread 2:** the `requiresEntityId` transport bug is **fixed** at this baseline. The
sibling `/preflight` route still carries it.

## 3. Event substrate — facts are strong, delivery does not exist

There is **no outbound event delivery infrastructure at all**: no subscription registry, no delivery
table, no retry, no outbound signing. Every HMAC in the repository is inbound verification.

| Class | Stores |
|---|---|
| Authoritative fact (trigger-enforced append-only) | `child_attendance_events`, `staff_presence_events`, `operational_expectations`, `processing_facts` |
| Mutation outbox | `mutation_events` |
| Projection trigger / internal notification | `workflow_events` |
| Provider receipt | `payment_provider_events`, `communication_delivery_events` |
| Audit record | `processing_commit_attempts`, comms audit streams |

Three structural findings:

1. **No store has a sequence number.** Every event table uses random uuid primary keys. There is no
   monotonic cursor anywhere, so **no store supports a resumable "everything after X"** — timestamps
   with uuid tiebreakers cannot order concurrent inserts. This alone forecloses replay.
2. **The best-typed store has no reader.** `mutation_events` carries a real state-transition
   envelope with an `origin` CHECK that already contemplates `api`, written only inside
   `SECURITY DEFINER` RPCs. Its migration header names downstream consumers. They do not exist.
3. **The widely-read store is the weakest.** `workflow_events` has untyped payloads, no CHECK on
   `event_type`, and is **actively deleted** by six cleanup paths.

The two attendance/presence fact stores are the only credible external-event candidates, and they
would need ordering plus the entire delivery tier.

## 4. OpenAPI — a gate artifact, not a coverage artifact

Hand-authored, **one commit, never edited since 2026-06-28**. 14 paths, 20 operations, all
`/api/admin/*` — 2.3% of routes, zero public. That is by design: policy is to generate only for
routes that already emit the standard envelope and have contract tests.

- **Security:** one scheme, a session cookie, applied globally. The `INTERNAL_CRON_TOKEN` the real
  system uses is not modelled.
- **Schemas:** the envelope is rigorous; the contents are not. Nine of eighteen 2xx bodies bottom
  out in `additionalProperties: true`, and `execution_result` — the most important field in the
  command API — has no `type` at all.
- **Errors:** the strongest part. All 20 operations document non-2xx responses with a shared
  `ApiError` and correlation-id headers.
- **Commands:** no enum of valid action keys, so an SDK could only expose
  `execute(actionKey: string, payload: any)`.
- **Events:** none. OpenAPI 3.1's `webhooks` key is available and unused.

**Could it generate a safe external SDK? No**, for three independent reasons: it would generate a
compiling client that types half its returns as `any`; **no test compares a real response to a
declared schema** (contract tests check that a route file exists and exports the method, never that
it returns the declared shape); and the only auth scheme is a same-origin cookie.

## 5. The pattern across all four

The same shape recurs: the runtime classifies capabilities precisely and enforces authorization
nowhere; the best-typed event store has never had a reader; the spec models the envelope rigorously
and the payload not at all; and the resource layer is a view model.

Each is a well-built classification layer whose enforcement or consumption layer was scheduled and
not yet built. That is defensible sequencing — the hard modelling is genuinely done, and done well.
But it means the readiness signals available here (a complete registry, a valid spec, passing
contract tests) measure the layer that exists, not the one an external caller would depend on.
