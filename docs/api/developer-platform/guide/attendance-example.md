---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy API — Attendance integration example

> ⚠ **Contract only — none of this is callable.** Attendance ingestion is not
> implemented. This describes the intended end-to-end shape so an integrator can
> design against it, using only paths Thread 4 ratified. The only endpoints that
> exist today are `/api/v1/oauth/token` and `/api/v1/context`.

A system that observes children arriving and departing, recording each as a fact
in Alloy.

## 1. Confirm what you can do

```bash
curl https://<alloy-host>/api/v1/context -H "Authorization: Bearer $TOKEN"
```

```json
{
  "organization": { "id": "6f2...", "name": "Firefly Early Learning" },
  "application": { "id": "a91...", "name": "Attendance Partner" },
  "installation": { "id": "i77...", "status": "active" },
  "scopes": ["context.read", "locations.read", "children.read", "attendance.write"],
  "boundary": { "locations": ["loc_downtown", "loc_riverside"] }
}
```

Start every integration here. It answers "which tenant am I, and what may I do"
in one call that cannot change anything.

**If `boundary.locations` is empty, stop.** You are authorized for nothing, and
every subsequent call will correctly return nothing. That is a provisioning
problem, not a code problem.

## 2. Enumerate your locations

```bash
curl "https://<alloy-host>/api/v1/locations" -H "Authorization: Bearer $TOKEN"
```

You receive only locations inside your boundary. Map these to your own locations
once and store the correlation on your side.

## 3. Build your child correlation

```bash
curl "https://<alloy-host>/api/v1/children?limit=200" -H "Authorization: Bearer $TOKEN"
```

Page with `next_cursor` until exhausted. Store `alloy_id ↔ your_id`.

Refresh with `updated_since` plus an overlap window, treating every result as an
upsert. Do **not** re-fetch the whole collection on a schedule.

## 4. Record an arrival

```bash
curl -X POST https://<alloy-host>/api/v1/attendance/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: 3f9c1e77-2b40-4a8e-9f1a-5c2d8e6b7a01" \
  -H "Content-Type: application/json" \
  -d '{
        "child_id": "chd_9a2...",
        "location_id": "loc_downtown",
        "event_type": "check_in",
        "occurred_at": "2026-09-10T08:12:00Z",
        "external_id": "your-system-event-88213"
      }'
```

Note what you are **not** sending:

- **No `org_id`** — resolved from your credential.
- **No actor or source claim.** Alloy assigns the provenance channel and your
  producer identity from your installation. You cannot assert them, and you
  cannot author facts attributed to another integration.

### Derive the idempotency key from the event, not the attempt

```text
✅  key = hash(your_event_id)          same arrival → same key → one fact
❌  key = uuid4() per HTTP attempt     every retry → a duplicate arrival
```

This is the single most consequential line of an attendance integration. A retry
storm with per-attempt keys bills and notifies families twice.

## 5. Handle the responses you will actually get

| Response | Meaning | Do |
|---|---|---|
| `201` | Fact recorded | Store the returned id |
| `200` + `Idempotency-Replayed: true` | You already sent this | Nothing. Success. |
| `409 idempotency_conflict` | Same key, different content | **Bug on your side** — a key was reused for a different event |
| `409 command_blocked` | A domain rule refused | Read `details.blockers`; show them to staff |
| `403 forbidden_resource` | Location outside boundary | Provisioning, not code |
| `404 not_found` | Unknown child, or outside boundary | Refresh correlation |
| `429` | Throttled | Honour `Retry-After` |

`409 command_blocked` is normal traffic, not an outage. A child not enrolled at
that location on that day is a real answer — surface the blocker rather than
retrying.

## 6. Reconcile

```bash
curl "https://<alloy-host>/api/v1/attendance/events?updated_since=2026-09-10T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN"
```

Read back what Alloy holds and compare against what you believe you sent. A
write-only integration cannot detect its own drift, which is why
`attendance.read` exists alongside `attendance.write`.

## What this example deliberately does not do

- **No corrections by edit.** Attendance is append-only, enforced in the
  database. A correction is a new fact with lineage.
- **No webhooks.** V1 has none; poll with `updated_since`.
- **No cross-organization calls.** One credential, one organization.
- **No child creation.** Children are canonical Alloy records. Your external id
  correlates to one; it never creates one.
