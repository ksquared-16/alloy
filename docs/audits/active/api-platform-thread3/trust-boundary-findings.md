---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — trust-boundary findings (Phase 1 discovery)

Against promoted staging `4f21979e6bec`. **Point-in-time investigation, not doctrine.**

Thread 3 asked what would be required to expose Alloy externally. The most important answers turned
out not to be about external APIs at all. Three findings below are **live defects in the current
product**, reachable today by an authenticated operator.

Nothing here was fixed. Discovery deliberately stops at proof — see *Why nothing was repaired*.

---

## P0-1 · Cross-tenant write: request body overrides the session's organization

`web/app/api/admin/analytics/snapshots/run/route.ts:39`

```ts
const orgIdFilter = typeof body.org_id === "string" ? body.org_id : orgId;
```

The session branch pins `orgId = ctx.orgId` at `:26` and requires `role === "admin"` at `:23`. Line
39 then lets the request body override it **unconditionally** — the override is not confined to the
cron branch. `createAdminClient()` at `:41` bypasses RLS.

**Reachable by:** an `admin` of any tenant. POST `{"org_id":"<another-org-uuid>"}` and
`runMetricSnapshotsForOrg` executes against that org — reading its metric definitions, evaluating
them against its tenant data, writing snapshot rows into it, and returning its definition keys in
`errors[]`.

**The correct pattern already exists two directories away.**
`web/app/api/admin/metrics/snapshots/write/route.ts:40-50` reads `body.org_id` **only** on the cron
branch and pins `ctx.orgId` otherwise. That is the fix, and it is already written.

## P0-2 · Cross-tenant write: PATCH by id with no organization filter

`web/app/api/admin/pricing/matrix/[id]/route.ts:37-43`

```ts
const supabase = createAdminClient();
await supabase.from("pricing_matrix").update(updates).eq("id", id)
```

`pricing_matrix.org_id` is `NOT NULL`. The update filters on `id` alone, on a service-role client,
with no `assertRowOrg` and no org predicate. The only gate is `getAdminContextCached()` at `:10` —
not even admin-only.

**Reachable by:** any portal-eligible user of any tenant, who can rewrite another tenant's prices
given a row id.

The same shape is reported for `pricing-modes/[id]`, `pricing-dimensions/[id]` and
`pricing-dimension-values/[id]`; all three tables carry `org_id NOT NULL`.

The canonical helper for exactly this — `web/lib/admin/assertRowOrg.ts` — is used by 66 route
files. These are not.

## P0-3 · Money actions execute with no permission check

`web/lib/adminV2/actions/definitions/financialChargeActions.ts` and `financialPaymentActions.ts`
contain **zero** permission references. Their siblings do:
`tuitionGenerationActions.ts` requires `fin.write`.

The route gate is `requireAdminOrOps()` (`web/lib/adminAuth.ts:124-130`), which despite its name
**checks no role** — it resolves the light org context and returns on portal eligibility alone.

**Reachable by:** any portal-eligible member of an org, for `charge.post`, `charge.reverse`,
`payment.record`, `payment.refund`, `payment.collect_card`.

`billing.generate_tuition` requires `fin.write` to *create* a draft charge, while `charge.post` —
which makes that charge **owed** — requires nothing. This is a live gap in the current UI-only
product, independent of any external API.

## P0-4 · The command runtime cannot express an authorization decision

`web/lib/platform/commands/runtime/commandRuntimeTypes.ts:165-166`

```ts
authorizationEvaluated: false;   // literal type, not boolean
authorizationGranted: null;      // literal type, not nullable
```

The invariant checker *fails* any snapshot claiming otherwise. The seam is reserved and closed on
purpose — but it means no layer of the runtime can record that authorization was even asked.
Per-action checks exist in **7 of 27** definition files; the rest rely on the route gate above.

Today this is survivable because the only door is a same-origin cookie route with no CORS. A
non-UI caller removes the UI as the de facto authorization layer, and what remains is P0-3.

---

## The architectural finding: application identity does not exist

Zero migrations define `api_keys`, `service_accounts`, `integration_credentials` or `oauth_clients`.
The **only** non-human identity in the schema is `attendance_kiosk_devices`.

Alloy must eventually distinguish six concepts. Today it models three well, one partially and
unsafely, and one not at all:

| Concept | Modeled? |
|---|---|
| Authenticated principal | **Yes**, cleanly |
| Authorized capability | **Yes**, where declared — but only 34 of 797 handlers declare one |
| Actor identity | **Yes** — and the kiosk proves device ≠ person |
| **Application / integration identity** | **NO — absent from the platform** |
| Execution origin | **Partially, and client-asserted** — a request body may claim `origin: "api"` |
| Provider provenance | Yes, but in a disconnected subsystem that shares the word "provenance" with an unrelated one |

The consequence is concrete: an integration calling Alloy today must present an *operator's*
session, so every row it writes is attributed to a human who did not do it.

## Correction to an inherited Thread 2 claim

Thread 2 recorded that `integration_api` "fails open by silently remapping provenance". **That is
wrong in its load-bearing part**, and the correction matters because a fail-open provenance channel
would be a severe defect.

- `resolveAttendanceProvenance` is strictly **fail-closed**: it throws on an unknown channel, on a
  missing user, and on an anonymous non-human producer. All three are tested.
- The remapping is in a different, earlier function — `operatorChannelForSurface` — which can return
  only `staff_workspace` or `operator_console`. **`integration_api` is unreachable from a request
  body by any path.**
- The persisted row is **truthful**: `actor_user_id` comes from the session, never the body.

The real defect is adjacent and smaller: a client-supplied string does select between two
equal-authority operator channels, which contradicts the module's own
`CLIENT_ASSERTABLE_CHANNELS = []` doctrine. And a caller asserting a provenance channel is neither
honoured nor refused — it is discarded with a `200`, which is a correctness trap for the first
partner integration.

**Severity: latent gap, not an exploitable defect.** Reaching the remapping requires an
already-authenticated admin/ops session, and that principal can already write attendance facts
legitimately.

## Why nothing was repaired

The mission's stop condition applies: *stop and report if a security defect appears exploitable and
fixing it would exceed a bounded repair.*

P0-1 is a one-line change. P0-2 spans four routes. P0-3 spans two definition files and a
misleadingly-named gate helper. Together they need tests that lock the legitimate callers —
including the cron branch, which passes `org_id` across tenants **by design** — and that is
implementation work with its own certification, not a discovery artifact. Repairing them inside a
discovery run, without those tests, would risk breaking the legitimate cross-tenant path while
appearing to fix a security bug.

These are filed for implementation sequencing, and P0-1 through P0-3 should be sequenced **ahead of
any external API work**, because they are defects in the product as it stands today.
