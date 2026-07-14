# Identity library (`web/lib/identity`)

**Slice:** Processing Identity Resolution **B1a** — Canonical Identity Normalization Primitives and Compatibility Adapters.

## Purpose

One canonical normalizer for inbound identity *signals* used by Processing and intake. Downstream slices (B1b candidate generation, D0 commands, backfills) depend on these primitives.

## Decision C (frozen)

- **Email and phone are strong signals, not unique identity keys.** Do not treat them as sole auto-link authority or as person-level unique constraints.
- **Email:** `trim().toLowerCase()`; empty → `null`.
- **Phone (canonical storage form):** E.164 NANP — `+1XXXXXXXXXX`.
- **Phone lookup:** `phoneLookupVariants` produces a deterministic set so legacy rows stored as 10-digit / `1…` / formatted strings still match.
- **Name:** `trim().toLowerCase()` + collapse `\s+`; empty → `null`.
- **DOB:** ISO `YYYY-MM-DD`; invalid/empty → `null`.

## Scope boundary

| In B1a | Not in B1a (→ B1b or later) |
|---|---|
| `normalizeEmail` / `normalizePhone` / `normalizeName` / `normalizeDob` | Person/child candidate generation |
| `phoneLookupVariants` | Confidence bands / signal scoring / contradictions |
| Compatibility adapters + bounded **intake** call-site delegation | Resolver persistence, schema, uniqueness, commit/UI |
| Parity tests | Booking/comms call-site cleanup (non-blocking later) |

## Canonical phone form

**Chosen form:** E.164 NANP `+1` + 10 digits (example: `+15551234567`).

Legacy intake matching historically stored/compared **10-digit** strings. Compatibility adapters (`normalizeIntakePhoneCompat`, `normalizePhoneDigitsCompat`) preserve that output at re-pointed call sites so B1a is behavior-preserving. New code should prefer `normalizePhone` (E.164).

## Compatibility adapters

Import from `@/lib/identity` (or `@/lib/identity/compat`) when a legacy signature must stay byte-identical. Adapters wrap the canonical primitives; they do not fork matching logic.

## Security / B0

Tenant RLS and `persons.org_id` work is **B0** on a separate branch — never bundled with this library.
