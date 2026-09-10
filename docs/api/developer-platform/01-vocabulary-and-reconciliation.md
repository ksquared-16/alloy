---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 01 — Vocabulary and reconciliation (Phase A)

## Finding: the canonical docs are already honest

Phase A expected to find canonical documentation implying Alloy already has a
production external Developer Platform. **It largely does not.** Threads 1 and 2
did this work. Verified at this baseline:

| Document | What it actually says |
|---|---|
| `docs/api/README.md:9` | "**Internal** API Platform foundation complete… A **public** developer platform (`/api/v1`, SDK, portal) is future work, not current scope." |
| `docs/api/api-platform-completion.md:20` | "This is **not** public developer platform completion. There is no public `/api/v1`, no published SDK, and no developer portal." |
| `docs/platform/foundation/product-roadmap.md:113` | "**Partner APIs** — nothing exists today: no inbound machine credential, no API versioning, no outbound event delivery." |
| `docs/api/api-architecture.md:32` | names OpenAPI, SDKs and a public developer platform as *future*. |

**Phase A is therefore a confirmation, not a repair.** Recording that plainly
matters: a thread that "reconciles" documentation which was already correct, and
reports it as a fix, corrupts the record it claims to protect.

## The three categories

Every API-related asset in Alloy is exactly one of:

| # | Category | Meaning | Examples |
|---|---|---|---|
| 1 | **Internal application/API infrastructure** | Transport for Alloy's own UI. Carries no external promise. | 553 `INTERNAL_ONLY` routes, AdminV2 routes, ViewModel/Focus Panel payloads |
| 2 | **Reusable platform substrate** | Real, well-owned seams that external contracts may adapt to. Not themselves external. | Registered Operational Commands, capability registry, `NonHumanProducerAuthority`, attendance RPC, `mutation_events`, the `{ok,data,correlation_id}` envelope |
| 3 | **External Developer Platform** | Installation-scoped external trust and contract layer. | **Does not exist.** This specification defines it. |

**"API Platform complete" refers to category 1 and the doctrine around it.** It
has never meant category 3. The docs say so; this document fixes the vocabulary
so the distinction cannot erode.

## Naming law

From here on, in all canonical documentation:

- **"API Platform"** — unqualified, means category 1. Always write **"internal
  API Platform"** where ambiguity is possible.
- **"Developer Platform"** — means category 3, and only category 3.
- **"Partner API"** — a *product* framing of category 3. Not a synonym for any
  existing route.
- **"Public API"** — the category 3 HTTP contract at `/api/public/v1/*`.
- A category 1 route is never described as "available to partners" because it
  works. Thread 3's law stands: **no existing route is externally supported
  merely because it functions internally.**

## Two tightenings applied

1. `docs/api/openapi-readiness.md:9` — status line read "**API Platform
   Complete**" without the qualifier its own body carries at `:43`. Qualified to
   "**Internal** API Platform Complete".
2. `docs/platform/foundation/platform-manifesto.md:115` — "Partner APIs |
   External API expansion on internal platform foundation". "Expansion" can be
   read as extending an existing external surface. Amended to name it
   construction. The manifesto is `status: frozen`; this is a vocabulary
   correction that changes no doctrine, and it is recorded here rather than made
   silently.

## What is explicitly preserved

The internal API Platform work is **valid and complete on its own terms** —
doctrine, generated OpenAPI v0, the typed client, `npm run api:check`, and the CI
that protects them. Nothing in Thread 4 deprecates it. The Developer Platform is
a **new layer above it**, not a replacement for it, and it is downstream of
category 2 seams rather than of category 1 routes.
