# Known gaps

## Purpose

List **confirmed** unknowns or items deliberately left as **“Needs verification”** during the doc reset — not a backlog of all possible work.

## Current state

Populated from a repo inspection pass on 2026-05-02 (not exhaustive code reading).

## Confirmed gaps

- **Opportunity vs contact vs person:** Inbound examples (e.g. gutters lead route) still log/create `contact_id` paths; full inventory of which entrypoints are person-first not done in this pass.
- **Event coverage:** Not every admin mutator has been audited for `emitEvent` parity; risk of pockets mutating without canonical events.
- **Documents/forms:** No single “forms engine” location confirmed; storage/compliance pipeline **Needs verification**.
- **AI production surface:** Exact routes/flags for agent behaviors not cataloged in this pass (**Needs verification**).
- **Stripe webhooks:** End-to-end mapping from webhook handlers to `payments` state not verified here.

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | Migration + backfill state unknown without DB |
| RRS coverage beyond jobs | Other entity types may still be flat selects |
| Attendance / staffing | Thin grep signal; may be vertical or future |
| OpenAPI / public SDK | Not found; APIs are route-handlers only |
| Server-side tracing | Client perf overlay exists; server APM unclear |

## Source of truth / key files

- This list; eliminate items by filing code changes + updating relevant topic doc in same PR.

## Guardrails

Do not remove an item until verified in code or DB; replace with a short **as-built** note in the relevant topic document.

## When this doc must be updated

Whenever verification completes or a new confirmed gap is discovered during incident/postmortem.
