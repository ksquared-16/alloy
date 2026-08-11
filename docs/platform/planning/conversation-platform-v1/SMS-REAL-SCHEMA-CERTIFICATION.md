---
owner: platform
status: evidence
last_reviewed: 2026-08-10
---

# Inbound SMS — real Alloy schema certification

Run against the controlled certification database (`alloy-cert`), not a throwaway
Postgres, holding `exclusive-certification-db` and a stack lease. Both released
cleanly afterwards; the stack was left up because another session held a lease.

Migrations were **forward-applied only** — no destructive replay, no tenant seed,
no wipe — because a second worker (`wt5-epp-runtime-convergence`) was on the shared
tenant. Holding the permit authorises destruction; it does not oblige it.

## Applied

| Migration | Result |
|---|---|
| `20260810120000_inbound_provider_identity_uniqueness` | applied, ledger recorded |
| `20260810140000_communication_inbound_ingress` | applied, ledger recorded |

Ledger went from 313 to 315 applied migrations.

## Proven against real rows

| Property | Result |
|---|---|
| Both migrations re-run as no-ops (replay idempotency) | PASS |
| Index exists on the real table, scoped to `direction='inbound'` and `org_id` | PASS |
| Duplicate inbound MessageSid rejected | PASS (`unique_violation`) |
| **Outbound duplicates with the same provider id still accepted** | PASS (2 rows coexisted) |
| Ingress accepts a message with **no org at all** | PASS |
| Ingress duplicate rejected | PASS (`unique_violation`) |
| `routing_disposition` CHECK rejects invented states | PASS |
| RLS enabled, zero policies | PASS |
| `authenticated` sees **0** ingress rows | PASS |
| `anon` — **permission denied** | PASS (stronger than zero-rows) |
| Canonical inbound messages unaffected | PASS |

Fixtures were narrowly scoped (`SM_CERT_*`) and removed; zero left behind.

## Method note worth keeping

A first isolation attempt used bare `SET LOCAL ROLE`, which Postgres rejects
outside a transaction with only a WARNING. The role never changed, the query ran
as superuser, RLS was bypassed, and the check reported **2 rows visible to the
tenant role** — a false failure that would equally have been a false PASS had the
expectation been inverted. Role-based RLS checks must be wrapped in
`BEGIN; SET LOCAL ROLE …; … COMMIT;` or they prove nothing.

## Second checkpoint — unread authority + duplicate exclusion (2026-08-10)

Pending set was computed from the ledger, not assumed. It was **five**, not two:
three migrations from other sprints that had reached staging but never the cert DB
(`20260807140000`, `20260807170000`, `20260807210000`) plus this sprint's two. All
five forward-applied; **zero pending** afterwards (320 applied / 320 branch
versions).

| Property | Result |
|---|---|
| `communication_unread_count` installed, SECURITY DEFINER, `search_path` pinned | PASS |
| EXECUTE granted to `authenticated` + `service_role` only | PASS |
| Supporting partial index present on the real table | PASS |
| Replay is a safe no-op | PASS |
| 350 genuine + 40 superseded + 25 outbound → **350** | PASS (past the old 300 cap) |
| 100 marked read → **250** | PASS |
| Second operator still sees **350** (per-user read model) | PASS |
| Another org sees **0** | PASS |
| 390 inbound rows still stored (history retained) | PASS |

Fixtures were scoped to one thread and removed.

### Ledger hazard found

Two branch files share version `20260807090000`
(`business_process_publish_idempotency` and `membership_profile_atomic_create`).
`supabase_migrations.schema_migrations` is keyed by version, so it can only ever
record one of them — the other is invisible to any "is it applied?" check,
including this one. Not caused by this sprint and not fixed here; recorded because
a pending-set computation that dedupes by version will silently under-report.

## Not covered here

- **Task 4 provenance against real data.** Implementation and focused tests pass,
  but provenance was not exercised end-to-end through the webhook on real rows.
- **STOP hold enforcement end-to-end.** The decision layer is proven; the
  enqueue-to-block path against a real ingress row is not.
- Both are browser-certification scope.

## WS2 follow-up — stale provenance (recorded, not implemented)

Provenance selects the most recent outbound on the endpoint pair with **no recency
boundary**, so a very old outbound can capture an unrelated new inbound SMS.

Existing candidates were inspected before inventing anything:
`communication_threads` has `archived_at`, `attention_state`, `assignment_state`,
`sla_state`, `last_message_at`. **`archived_at` is schema-only** — it appears in a
type definition and is never consulted by any Communications read path, so there is
no existing authority that closes a conversation.

No arbitrary time window was added. Recorded as a WS2 Conversation Identity
follow-up: adopt a real conversation-closure authority, then let provenance respect
it.

## Configuration Integrity follow-up (recorded, not implemented)

`communication_provider_bindings.inbound_to_e164` has no uniqueness constraint, so
one provider destination may be claimed by several organizations. Invariant to
establish: **one active provider destination identity → one tenant ownership
boundary.** The SMS runtime now handles the ambiguity safely instead of guessing,
so this is not urgent.

## Block A — browser certification (2026-08-11)

Run against the local certification stack (`ALLOY_CERTIFICATION=1`, no provider
credentials, nothing leaves the machine), holding the browser-certification
permit and a stack lease. `NEXT_PUBLIC_SUPABASE_URL` verified local before any
evidence was captured.

A parent's message arrives the way a parent's message arrives: a signed Twilio
form POST to the backend webhook, verified against a synthetic local-only token
the spec signs with. Nothing is injected into the database — the properties under
certification belong to that seam, not to the tables under it.

**11 of 11 passed.**

| Scenario | Result |
|---|---|
| A-0 unsigned webhook refused (403) | PASS |
| A-1 resolved parent → unread, correct Person, body, time, SMS | PASS |
| A-2 redelivered webhook is one reply, not two | PASS |
| A-3 unknown sender retained, named honestly, stays replyable | PASS |
| A-4 same-org ambiguity stays ambiguous, safe language, no ids leaked | PASS |
| A-5 destination no org owns → quarantined, body withheld from the projection | PASS |
| A-6 same sender to a different Alloy destination stays separate | PASS |
| A-7 Path 1 — resolved conversation opens with the person's name and history | PASS |
| A-8 Path 2 — operator opens and answers an unidentified parent; `thread_id` only | PASS |
| A-9 STOP hold refuses truthfully; refusal durable as `blocked`, never `queued` | PASS |

### What certification found that tests had not

Four defects survived every unit test and were only visible from the browser.

1. **Wrong surface.** `comms_v2_command_center` defaults ON, so the operator
   Inbox is `CommandCenterShell`, not `InboxPanel`. `/adminV2/messages` redirects
   to `/admin/messages` and answers 403. The reply wiring had landed on a screen
   nobody opens.
2. **The purpose gate refused every thread reply.** No purpose listed
   `canonical_thread`, so `validatePurpose` blocked the send before eligibility.
   Recipient resolution, the route contract and the eligibility gate were all
   real and all had passing tests — the path had never sent a single message.
3. **The STOP hold could not match.** `canonicalSend` never passed the provider
   destination, so `fromAddress` reached eligibility as null. The hold matches on
   the endpoint PAIR, so with half the identity missing it could not fire on any
   canonical send. A reply to a number that had just texted STOP was queued.
4. **Stale household data.** The workspace branch tested only `runtime.vm`, which
   retains the previous household. Switching to an unidentified conversation
   rendered another family's name, children, preferences and history under it.

Also closed: a STOP from a sender whose conversation the tenant owns but whose
Person is unknown had no enforcement anywhere. The ingress hold covers messages
belonging to no organization; the preference path needs a Person. That middle
case was harmless only while such conversations could not be answered — this
slice made them answerable, so the hold is now endpoint-scoped and read from a
keyword the inbound seam stamps, with a later START releasing it.

### Method notes worth keeping

- **A constant body defeats idempotency-based assertions.** `comms_reply` keys on
  (thread, content), so a fixed string returns the message an EARLIER run sent —
  `duplicate`, `ok: true` — which reads exactly like a hold that failed while
  nothing was dispatched. Certification bodies must be unique per run.
- **A refused send must be present, not absent.** Per BLOCKED-SEND-VISIBILITY the
  attempt is recorded as `status='blocked'`; asserting its absence asserts the
  opposite of the intended behaviour. Assert the status, not the silence.
- **"App already serving" is not reuse when the server predates the env file.**
  An env-gated route stayed 404 across three runs against a stale process.
  `alloy-certify serve` now restarts in that case.
- **A half-up stack passes every readiness check.** With only the db container up,
  `supabase start` says "already running", `supabase status` still returns URLs,
  and psql works — while kong is down and the browser gets "Failed to fetch".
  `alloy-certify` now refuses to start the webhook on empty API_URL/SERVICE_ROLE_KEY.
