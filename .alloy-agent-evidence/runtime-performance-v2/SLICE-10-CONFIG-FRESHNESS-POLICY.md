---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 10 — configuration freshness policy (S7-1 decision)

**Lane** `lane_73a897409906` · **Run** `erun_b414fcc28109fac6` · base `348649b57`.

Decision slice. **No product code changed.** No latency claim is relevant here.

---

## 1. Inventory — what Alloy already has

**The decisive finding: Alloy has already solved this problem, for the sibling surface.**

The published **Queue Row** surface implements the complete cross-tab configuration lifecycle today:

```ts
// queueRowSurfaceService.ts
export const QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL = "alloy-queue-row-surface";

dispatchQueueRowSurfacePublished(surfaceId, processKey) {
    const detail = { surfaceId, processKey };
    window.dispatchEvent(new CustomEvent(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, { detail })); // same tab
    try {
        const channel = new BroadcastChannel(QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL);
        channel.postMessage({ type: "published", ...detail });                            // cross-tab
        channel.close();
    } catch { /* BroadcastChannel unavailable */ }
}
```

and its consumer (`usePublishedQueueRowSlotsOverlay`) subscribes to **both**, filters with
`publishEventMatches({ surfaceId, processKey })` — i.e. a **scoped** payload — and **always re-reads
the published layout on mount**, with the comment: *"the cache can lag a Surface Builder publish from
another tab/session."*

| Mechanism | Present? | Where |
|---|---|---|
| Same-tab scoped `CustomEvent` | **yes** | queue-row surface (**scoped**); Focus Panel summary (**unscoped**) |
| `BroadcastChannel` cross-tab | **yes** | `alloy-queue-row-surface` |
| Graceful degradation when unavailable | **yes** | try/catch around the channel |
| Mount-time revalidation | **yes** | queue-row overlay |
| Bounded TTL caches | **yes, widely** | 45s warm, 60s (several), 90s config, 10min JWKS, above-fold TTLs |
| In-flight coalescing + generation guards | **yes** | `workUnitProvisioningPrefetch`, card `requestSeq` |
| `storage` events | **no** | — |
| Supabase realtime / subscriptions for configuration | **no** | — |
| `visibilitychange` revalidation | **only** idle-logout and a comms section — not configuration |

**The Focus Panel Summary doc is the outlier, not the norm.** It is the one published surface that
never adopted the pattern: unscoped event, same-tab only, no TTL, no mount revalidation.

## 2. Freshness classes

| Class | Examples | Can staleness grant authority? | Required freshness |
|---|---|---|---|
| **A — authority** | RBAC, capabilities, command eligibility *enforcement* | **No — server-enforced** (§14) | server-side; client copies are advisory |
| **B — operational behaviour** | stage operating plans, required work, readiness, `departmentMetadata` | No, but can mislead an operator about what work is required | bounded, short |
| **C — presentation** | Focus Panel Summary layout, queue-row slots, labels | No | bounded; same-browser immediate |
| **D — reference** | departments, locations, option catalogs | No | bounded, long tolerable |

**One policy serves B, C and D.** Class A is out of scope by construction — it never depends on these
caches. Separate freshness systems are not justified.

## 3–4. Options, and the recommendation

| Option | Verdict |
|---|---|
| **A — current (same-tab only, no TTL)** | **Reject.** Unbounded stale window; the Focus Panel summary is the only surface still on it. |
| **B — TTL only** | Reject alone. A second tab in the *same browser* would wait out a TTL for a change it could have had instantly, when the primitive already exists. |
| **C — same-browser propagation + TTL** | **Core of the recommendation.** |
| **D — focus/visibility revalidation + TTL** | **Adopt as a component**, not alone. |
| **E — server push / realtime** | **Reject.** No realtime subscription infrastructure exists for configuration; introducing one for layout documents is disproportionate. Revisit only if Class A ever moves client-side. |
| **F — hybrid** | **RECOMMENDED** — C + D, which is exactly the Queue Row surface pattern plus a TTL backstop. |

### RECOMMENDED CANONICAL POLICY

> **Adopt the existing Queue Row surface pattern as the canonical configuration freshness contract
> for every published configuration surface, and add a bounded TTL backstop.**

This was the instruction's hypothesis, and the inventory **verifies** it rather than adopting it
blindly — with one sharpening: it is not a new mechanism, it is **generalising the one Alloy already
ships**, and the work is mostly bringing the Focus Panel Summary doc up to the standard its sibling
already meets.

## 5–10. The freshness contract

| Situation | Contract |
|---|---|
| **Same tab** | Publisher dispatches a **scoped** `CustomEvent` immediately. Consumers matching the scope invalidate and refetch. *(Exists; the summary doc's event must gain a payload.)* |
| **Same browser, other tab** | Same scoped payload over `BroadcastChannel`. Propagation is immediate and best-effort; failure degrades to the TTL. *(Primitive exists.)* |
| **Different browser / session / user** | Bounded **TTL revalidation**. Maximum stale window = TTL. **Recommend 90s**, matching the existing configuration-cache TTL already in the codebase — a number Alloy already lives with, not a new one. |
| **Background / hidden tab** | Nothing is fetched while hidden. The cache may go stale; it is not read while hidden. |
| **Return to foreground** | `visibilitychange` → revalidate if older than TTL. This converts "indefinitely stale" into "stale until you look at it". |
| **Warm navigation** | Cached configuration may be used **immediately**. Revalidate in the background when past TTL — stale-while-revalidate, never a blocking gate. |
| **Cold navigation** | The published endpoint wins. A provisioning-embedded seed may cover the pre-settle window only, and must carry its version (§11). |
| **Offline** | Last known configuration may remain **visible**. Nothing is blocked from execution on presentation grounds — the server remains the authority (§14). Do not invent an offline execution gate here. |

## 11. Scope + version contract

```
cacheKey   = family + scope                         // e.g. focus_panel_summary + (businessProcessKey|workViewId|stageKey|statusKey)
versionKey = (cacheKey, publishedVersion)           // NEVER version alone
staleMarker= startedAt + TTL, or an invalidation generation bump
```

**Never compare version alone**, and never compare document hashes as identity. Slice 7 proved this
tenant resolves one document for every scope, so a version-only protocol would appear correct here
and break on the first tenant publishing a stage-specific layout.

## 12. In-flight stale-response law

> **A response may only be applied if the generation it was issued under is still current.**

```
gen = 0
invalidate() → gen++            // publish event, TTL expiry, or scope change
fetch(scope)  → issuedGen = gen
on settle     → if (issuedGen !== gen) DISCARD; else apply
```

Timing must not be relied upon. This is the same shape as the card-level `requestSeq` guard that
already exists — generalised to the configuration owner. **Slice 7 recorded that no such guard is
observable in `ensureLoad` today; this closes that gap and is a prerequisite for S5-3.**

## 13. Invalidation granularity — **scoped becomes canonical**

Today the summary-doc event carries no payload and calls `invalidateAll()`. Slice 7 measured the
blast radius as **one scoped refetch and no teardown**, so this is *not* a performance emergency.

Nevertheless: **make the payload scoped**, because the queue-row surface already proves the shape and
because a scoped payload is what makes the generation guard and cross-tab filtering precise. Keeping
`invalidateAll()` as the fallback when a payload is absent is acceptable and backward-compatible.

## 14. Security / authority boundary

**Stale presentation configuration cannot grant authority.**

- The summary-doc cache is consumed **only** by Focus Panel composition — traced; it never reaches a
  permission decision.
- `POST /api/admin/actions/execute` returns an `unauthorized` status server-side.
- Authority lives in `lib/access/*` (`businessProcessAuthority`, `configurationAuthority`,
  `effectiveAccessExplanation`), separate from these caches.

So the worst case is that a stale layout **offers** an action the server then refuses — a UX defect,
not an authority defect. **Class A stays server-authoritative and out of scope.** This slice does not
touch Access/RBAC.

## 15–16. S6-1 — `departmentMetadata` design and readiness

**Design (no new cache):**
1. The **existing** workspace departments owner (`workspaceAdminFetchDedupe`, already fetching
   `/api/admin/departments` at boot) **retains** the metadata it already receives and today discards.
2. Current Work composition reads it from that owner.
3. **Cold deep-link fallback:** provisioning keeps embedding it only when the client cannot state it
   already holds it — the conditional-transfer shape.
4. **Freshness:** Class B under the policy above — scoped publish event where one exists, TTL
   backstop otherwise, foreground revalidation.

**Readiness: NOT YET — one prerequisite remains.** There is still **no department-configuration
publish event**. Under the policy, TTL + foreground revalidation alone give a bounded stale window,
which is *sufficient for Class B* — so S6-1 becomes implementable **once the TTL/revalidation
backstop exists**, without waiting for a department publish event. **It is unblocked in principle and
sequenced behind the policy's implementation.**

## 17–18. S5-3 — summary doc design and readiness

**Protocol:**
- Provisioning seed carries `{ id, version, doc }` — **it carries no version today**, and that is the
  blocking gap.
- Client holds `(scope, version)`.
- **Cold / unknown version** → answer embeds the document.
- **Warm / matching scope+version** → answer omits the document and carries `{ id, version }` only.
- **Mismatch** → the canonical owner fetches the published document.
- All of it under §12's generation guard.

**Readiness: NOT YET, but now precisely bounded.** Three prerequisites, in order: (a) the scoped
event + BroadcastChannel adoption, (b) the TTL/foreground backstop, (c) `{id, version}` on the seed.
With those, S5-3 is a mechanical change. **Without them, omission lengthens client-owned lifetime
while invalidation is still same-tab-only — which is precisely the trade this slice exists to
prevent.**

## 19. Tests required

1. **Scope matching** — an event for scope X does not invalidate scope Y; a matching one does.
2. **Cross-tab** — a `BroadcastChannel` publish message invalidates in a second context; absence of
   the API degrades to TTL without throwing.
3. **TTL** — reuse inside the window, revalidate past it; stale-while-revalidate never blocks render.
4. **Generation guard** — a response issued before an invalidation is **discarded**; plant the
   reversed ordering and prove the test fails.
5. **Version protocol** — same scope + different version refetches; different scope + same version
   does **not** reuse.
6. **Foreground revalidation** — hidden → visible past TTL triggers exactly one revalidation.
7. **No authority leakage** — the config cache is never an input to an eligibility decision.

## 20. Mounted QA plan

Reuse the established frame harness. After any implementation: publish in tab A, observe tab B
converge; confirm the Slice 2/4 properties during convergence (cards 6, rows 7, no remount, monotonic
title, no blank/false-empty — Slice 7 already proved one scoped refetch causes no teardown);
foreground a backgrounded tab and observe exactly one revalidation; and re-run the Slice 8 mutation
to confirm configuration revalidation does not enlarge mutation fan-out.

## 21. Migration / backward compatibility

- Adding a payload to the existing event is **additive**; a listener that ignores it keeps today's
  `invalidateAll()` behaviour.
- Adding TTL to a cache that currently has none **only shortens** reuse — it cannot surface staler
  data.
- `{id, version}` on the provisioning seed is additive; omission ships **after** clients read it.
- `BroadcastChannel` is already guarded by try/catch in the existing implementation — copy that.

## 22. Ranking

| Rank | ID | Item | State |
|---|---|---|---|
| **P1** | **S7-1** | configuration freshness | **DECIDED — policy above; implementation is Slice 11** |
| P2 | S6-1 | `departmentMetadata` ~29.7 KB | unblocked in principle; sequenced behind the policy |
| P2 | S5-3 | summary doc 27 KB | bounded by three named prerequisites |
| P2 | S9-1 | post-mutation answer carried pre-mutation `rowStage` | carried, separate question |
| P2 | S8-2 | speculative prefetch competes during convergence | carried → R-018 quiet-host A/B |
| P3 | S8-3 | `eligible-enrollment-children` ×2 | repair specified |
| P2/P3 | S5-4 · S4-1 · F-2 · S3-4 · D-2/R-005 | carried | unchanged |

## 23. Recommended Slice 11

**Implement the policy on the Focus Panel Summary doc — bringing it up to the standard its sibling
already meets.** In order: scoped event payload → `BroadcastChannel` (copy the queue-row
implementation) → generation guard → TTL + foreground revalidation. That is one coherent change to
one owner, with the queue-row surface as a working reference implementation.

**Then** S6-1 and S5-3 become mechanical, in that order.

---

## Process law adopted from Slice 9

> **Endpoint path equality is not evidence of duplicate work.**

Duplicate classification requires the complete effective request identity — every path, query and
scope parameter that materially changes the answer. Never group by `url.split("?")[0]` when
classifying duplicates. This is the same rule Slice 2 established for coalescing keys, applied to
measurement rather than to the runtime.
