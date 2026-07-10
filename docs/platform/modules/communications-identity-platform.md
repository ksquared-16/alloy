# Communications Identity Platform

**Status:** Phase 2 foundation implemented and certification-ready (August 2026).

---

## Implemented

### Schema

| Table | Purpose |
|-------|---------|
| `communication_provider_accounts` | Tenant-owned provider connection (`secret_ref` only) |
| `communication_identities` | Canonical address/number |
| `communication_identity_location_bindings` | Location routing and defaults |
| `communication_identity_grants` | User use/manage grants |

**Extended:** `communication_messages.communication_identity_id`, `communication_provider_account_id`

### Backfill rules

- Idempotent via `legacy_binding_id` unique indexes
- Skips bindings **without resolvable SMS/email address** (no fabricated placeholders)
- One account + one identity per legacy binding row
- Location bindings when `scope = location`

**Certification SQL:** `supabase/tests/communications_identity_backfill_certification.sql`

### Sender resolution (TypeScript canonical)

Location: `web/lib/communications/identity/`

Order: override → location default → location priority → tenant default (id-sorted) → legacy fallback

Observability: `identityResolutionObservability.ts` — structured `[communications:identity]` logs

### Authorization by send path

| Path | Initiation | Permission |
|------|------------|------------|
| `POST /send` | Operator | `assertCommunicationsSendAllowed` |
| `POST /family-send` | Operator | `assertCommunicationsSendAllowed` (parity added Phase 2 cert) |
| Scheduled sends | Scheduled operator action | Service enqueue; binding stored at schedule |
| Task Assist apply | Operator | Via `/send` path |
| Announcements | Operator schedule | Service at due via scheduled sends |
| Workflow mirror | System/workflow | Resolver with service authority; deferred metadata on failure |

### Python execution contract

- **Persisted identity present:** load identity + account; **fail** if invalid — no silent reselection
- **No persisted identity:** legacy binding on row → compatibility resolver → documented ordering
- Tests: `backend/tests/test_identity_resolver.py`

### Workflow mirror

**Resolved before enqueue** when org + channel + location context sufficient.

On resolution failure: enqueues with `metadata.sender_resolution_deferred` + Python fallback permitted.

### Inbound

- Canonical identity FK on inbound SMS inserts
- Ambiguity metadata when multi-location bindings unresolved
- Inbound email: **not implemented**

### Discovery API

`GET /api/admin/communications/identities` — no secrets, no `config` payload

---

## Compatibility mode (intentional)

- Legacy `communication_provider_bindings` retained
- Legacy binding FK on messages retained
- Python legacy resolver when no canonical identity on row
- Workflow mirror deferred resolution metadata when enqueue resolution fails

**Removal condition for legacy bindings:** all send/inbound paths persist canonical identity; backfill complete; operator verification on staging.

---

## Deferred

- Google Workspace / Microsoft 365 OAuth and sync
- Inbound email
- Voice / internal messaging
- Provider-admin UX
- Grant-management UX
- Legacy binding table removal

---

## Rollback

Revert TS send/mirror resolver wiring. Migration is additive; legacy bindings unchanged.
