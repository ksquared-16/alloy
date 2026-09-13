---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 06 — Gap classification and Slice B recommendation

Classified per Slice A Part 6. **A generic gap is never fixed with
Classroom Coach-specific logic.**

## GENERIC_PLATFORM_GAP

Real deficiencies that would affect multiple integrations.

| # | Gap | Evidence | Weight |
|---|---|---|---|
| G-1 | **The entire Thread 4 backend is unbuilt** — no tables, routes, principal minter, or token endpoint | §01, verified | Blocks everything |
| G-2 | **Outbound credentials are outside Thread 4's model.** It designed inbound only (partner → Alloy). Many integrations need Alloy → provider. | `org_provider_credential_*` exists and is Vault-backed; Thread 4 never references it | High — and cheaper than it looks, since the outbound half already exists |
| G-3 | **No durable audit store** | `logAdminAudit` is `console.log`; no table | Blocks Activity **and** credential issuance |
| G-4 | **No public OpenAPI artifact** | Only internal `alloy-api.v0.yaml` | Blocks the generated reference |
| G-5 | **Rooms / classrooms are not a public resource** | `LATER` in Thread 4 | High for *any* childcare integration, not just this one |
| G-6 | **Reconciliation assumes provider timestamps and pagination** | `updated_since` is the only resync primitive | Medium — a provider without them has no defined sync story |
| G-7 | **No durable rate limiter** | Specified, unbuilt | Blocks safe exposure |

**G-2 is the finding most likely to be missed.** Thread 4's reference case was
inbound, so its credential model is inbound-only. If the first real partner turns
out to need Alloy calling *them* — which §05 suggests is plausible — Thread 4's
credential design does not cover it, and the half that does cover it already
exists in a mature, Vault-backed form. Slice B must not rebuild it, and must not
assume `app_credentials` is the answer to every credential question.

## CLASSROOM_COACH_ADAPTER_GAP

**Not enumerable.** Adapter gaps are, by definition, provider-specific
translation problems — and no provider capability is verified (§05). Listing
adapter gaps now would mean inventing the provider behaviour they translate.

The one structural adapter concern that can be named without provider evidence:
**provider location → Alloy location mapping** will be required by any
location-scoped integration, and belongs in the adapter, never in the boundary
model.

## DOMAIN_GAP

Underlying Alloy capability insufficient.

| # | Gap |
|---|---|
| D-1 | **Rooms / operational groups** have no public representation, and classroom-level context is likely table stakes for early-education integrations |
| D-2 | **Incidents and documents** are not modeled as external resources; if a partner writes incident records back, there is no canonical public target |
| D-3 | Person/household remains `UNSAFE_OR_AMBIGUOUS` (Thread 3) — seven `persons` insert sites, no single authority — so guardian correlation has no safe public surface |

## PRODUCT_GAP

Developer/Integration UX missing.

| # | Gap |
|---|---|
| P-1 | No Integrations surface exists at all |
| P-2 | No credential lifecycle UX |
| P-3 | No API activity surface (blocked by G-3) |
| P-4 | No developer documentation surface (narrative starter now exists; reference blocked by G-4) |
| P-5 | No installation Attention model implemented |

## Recommended Slice B

Ordered by dependency, not appetite. **Slice B is backend, not UI** — a
configuration surface over tables that do not exist cannot be built, and Slice A
proved that is where things stand.

### B-1 — Security prerequisites (blocking, and not Developer Platform work)
Durable audit store (G-3), SEC-0c, and SEC-0 (gated on the gutters question).
Thread 4 named these as prerequisites of the **first credential**, not
follow-ons. A credential issued into a system that records nothing cannot be
investigated.

### B-2 — The principal spine
`developer_applications`, `app_installations`, `app_credentials`,
`app_access_tokens`. Promote `NonHumanProducerAuthority` →
`PlatformPrincipalAuthority`, attendance keeping a thin adapter. Token endpoint.
The trust middleware. **`GET /v1/context` and nothing else.**

Steps B-1 and B-2 carry no domain risk: nothing in them can mutate operational
truth.

### B-3 — The Integrations product surface
Collection Runtime + Installation Runtime (§02, §03) over the now-real tables.
Tenant-private applications only. This is the first slice with visible product
value and it is browser-provable.

### B-4 — Reads and the reference
`GET /v1/locations`, `/v1/children`. Public OpenAPI artifact + prebuild guard
(G-4). Generated reference (§04).

### B-5 — The first mutation
`POST /v1/attendance/events`, the adapter, idempotency, durable rate limiting.

### Not in Slice B
Classroom Coach anything. Webhooks. Delegated actors. SDK. Marketplace.

## The decision that should precede Slice B

> **Answer D-1: is Classroom Coach inbound, outbound, or both — and does it have
> an API at all?**

It is one conversation with the partner. It determines whether B-5 is the right
fifth step or the wrong one, whether G-2 (outbound credentials) is urgent or
theoretical, and whether G-5 (rooms) is blocking. Thread 3 flagged it as cheap
and load-bearing; it is now the cheapest high-value action available, and it has
been outstanding across three threads.

**Slice B's ordering above is deliberately robust to the answer** — B-1 through
B-4 are required under every direction. Only B-5 depends on it.
