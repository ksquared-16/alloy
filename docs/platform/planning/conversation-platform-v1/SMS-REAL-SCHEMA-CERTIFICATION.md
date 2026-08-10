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
