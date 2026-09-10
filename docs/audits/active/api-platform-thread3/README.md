---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — API platform discovery (Phase 1)

**Point-in-time investigation** against promoted staging `4f21979e6bec`. Not doctrine.

Thread 3 asks what API platform Alloy *actually has* — which of the 613 routes are internal
application transport versus reusable platform capability, and what architecture would be required
to expose Alloy without creating parallel identity, authorization, execution, provenance or
domain-truth systems. Phase 1 establishes facts. It designs nothing.

## Artifacts

| File | What |
|---|---|
| `route-classification.json` | All 613 routes, augmented with a classification, OpenAPI coverage, and per-gate `EXTERNAL_READY` checks |
| `build-route-classification.mjs` | The generator. Re-runnable; reads `docs/api/api-inventory.json` and the OpenAPI spec |

The inventory itself is inherited from Thread 1 (`docs/api/api-inventory.json`) and was **verified,
not regenerated**: 613 records against 613 live `route.ts` files at this baseline — zero delta.

## Classification criteria

Applied in order; each route gets exactly one class. Criteria are objective and mechanical so the
counts can be re-derived rather than trusted.

| Class | Criterion |
|---|---|
| `PROVIDER_INGRESS` | Signed provider callback (`provider-signature`, or under `/webhooks`, `/stripe`) |
| `DEVICE_MACHINE` | Device credential; org and site read off the resolved credential row |
| `PARTICIPANT_PUBLIC` | Opaque participant token (`/public/forms`, `/public/tour-booking`, `/action`, `/action-links`) |
| `COMPATIBILITY` | Re-export or dev utility |
| `PLATFORM_INTERNAL_STABLE` | Session-gated **and** in OpenAPI **and** schema-validated |
| `INTERNAL_ONLY` | Session-gated browser transport — the default |
| `UNCLASSIFIED_NO_AUTH` | No auth pattern detected by static scan — **a review flag, not a verdict** |

### `EXTERNAL_READY` — deliberately hard to earn

Authentication alone never qualifies. A route must pass **every** gate:

1. a **non-session** credential
2. org bound **from the credential**, not from the request
3. schema validation
4. OpenAPI coverage
5. an idempotency story if it mutates

**Result: 0 of 613 routes pass.** That is the honest headline, not a failure of the criteria.

## Counts at this baseline

| Class | Count |
|---|---:|
| `INTERNAL_ONLY` | 553 |
| `PARTICIPANT_PUBLIC` | 29 |
| `UNCLASSIFIED_NO_AUTH` | 12 |
| `COMPATIBILITY` | 8 |
| `PROVIDER_INGRESS` | 5 |
| `PLATFORM_INTERNAL_STABLE` | 4 |
| `DEVICE_MACHINE` | 2 |
| **`EXTERNAL_READY`** | **0** |
| In OpenAPI | 14 (2.3%) |

## A caution about the inherited `auth` field

`docs/api/api-inventory.json` derives `auth` by static scan of each route file. **It cannot see
through a shared helper.** The six Processing identity routes appear to have no auth; they delegate
to `resolveOperatorRoute`, which calls `getAdminContextCached()` and uses the server-resolved
`orgId` (`web/lib/pos/processingIdentity/operator/operatorRouteContext.ts`). Verified directly.

So `UNCLASSIFIED_NO_AUTH` is an upper bound on *unknown*, not a count of unauthenticated routes. Of
the 12: six delegate auth to a helper, two use token or context auth, and four
(`/build-info`, `/runtime-info`, `/verticals`, `/marketing/demo-request`) are legitimately public
read or lead-capture endpoints. **No route mutating authoritative state was found unauthenticated.**

## Deep-dive artifacts (added 2026-09-10)

| Document | What it settles |
|---|---|
| [`mutation-authority-map.md`](mutation-authority-map.md) | Who owns the canonical mutation in each of 14 domains, what an external client would invoke, and what blocks it. 0 domains reached `PLATFORM_INTERNAL_STABLE`. |
| [`authorization-tenancy-findings.md`](authorization-tenancy-findings.md) | Enforcement distribution across 613 routes; why RLS is inert for the API surface; the 40 org-blind policies; the 120-second authority cache. |
| [`contract-readiness-findings.md`](contract-readiness-findings.md) | Idempotency, errors, collections, versioning, OpenAPI coverage. |
| [`security-defect-register.md`](security-defect-register.md) | Nine defects, SEC-0 … SEC-6. **SEC-0b's blast-radius line was corrected on 2026-09-10** — it is cross-tenant through the run route (SEC-0c). |
