---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 7 — configuration lifecycle and invalidation

**Lane** `lane_73a897409906` · **Run** `erun_5303b495244c642a` · base `749877634`.

**Conditions.** Timing BLOCKED, no latency claim. **No product code changed.** No shared tenant
configuration was mutated — §1 explains why, and what was proven instead.

---

## 1–2. Fixture / environment, and the isolation blocker

**Result: no isolated CONFIGURATION fixture exists. This is the Slice 7 blocker, returned precisely.**

| Option | Verdict |
|---|---|
| **1. `alloy-cert` local stack** | The measuring server targets hosted Firefly. Repointing it is a **host-wide** env change (`ALLOY_SERVER_ENV_SOURCE`) affecting every other running slot — explicitly forbidden. |
| **2. Existing certification fixtures** | `vac certify-fixture --list` returns **three** fixtures — `operational_cards_certification`, `enrollment_certification`, `enrollment_e2e_certification` — each with a `reserved_namespace` (`*-cert.alloy.invalid`) and `ensure/verify/reset`. **All isolate OPERATIONAL data** (households, children, enrollment journeys). **None isolates published configuration.** |
| **3. Bounded hosted mutation** | Publishing a layout writes to `entity_layouts`, which is **append-only** — a publish cannot be deleted, only superseded by another publish. That permanently alters shared tenant configuration history on an org four other dev servers are actively using. Rejected: the instruction forbids using real shared configuration merely because restoration looks easy. |

**What was proven instead, without mutating anything:** the invalidation chain was exercised **mounted**, using the *real* runtime event — the same `CustomEvent` that `publishFocusPanelSummary` dispatches — fired on the live page. That is the production listener, the production module cache, the production refetch and the production recomposition. **Only the event's origin was substituted.** The publish → dispatch link is a two-line, deterministic code fact (§4), cited rather than executed.

This is stated plainly because it matters: **§5–§11 are mounted evidence; the publish-side link is code-proven.**

## 3. Configuration lifecycle map (executable, not doctrine)

```
author draft        focusPanelSummaryLayoutService.ts
  patchEntityLayoutDraft / createFocusPanelSummaryDraft
        ↓
publish             publishFocusPanelSummary(draftId)
  → publishEntityLayoutDraft(draftId)          [server: entity_layouts, APPEND-ONLY]
        ↓
event               window.dispatchEvent(new CustomEvent(
                      "adminv2:focus-panel-summary-published"))   ← NO payload, SAME TAB only
        ↓
client owner        usePublishedFocusPanelSummaryDoc.ts
                      cacheByScope: Map<scopeKey, CacheState>
                      scopeKey = businessProcessKey|workViewId|stageKey|statusKey
                      lifetime = page session (no TTL)
        ↓
invalidation        invalidateAll() → cacheByScope.clear()        ← ALL scopes, not one
        ↓
refetch             GET /api/admin/entity-layouts/focus-panel-summary?workViewId=…&stageKey=…
        ↓
composition         Focus Panel grid + FocusPanelSummarySkeleton
```

## 4. Publish event identity

| | |
|---|---|
| Name | `adminv2:focus-panel-summary-published` |
| Payload | **none** — a bare `CustomEvent` |
| Transport | `window` event, **same tab only** |
| Dispatcher | `publishFocusPanelSummary` (`focusPanelSummaryLayoutService.ts:104`) |
| Scope carried | **none** — the listener cannot tell which surface published |

**Structural consequence, recorded now because it bounds every reuse design:** there is **no server
push and no cross-tab/cross-session invalidation**. A publish by another operator, another tab, or a
direct API call is never observed by a mounted session. The module cache has **no TTL**, so within a
long-lived tab it is refreshed only by a same-tab publish.

## 5–6. Cache owner / invalidation owner

Both are `usePublishedFocusPanelSummaryDoc`: it owns `cacheByScope` and it is the sole listener. The
seed from provisioning is explicitly *not* an authority — it covers only the pre-settle window, and
the settled fetch replaces it.

## 7–9. Version / hash, and mounted before-after

| Source | KB | doc hash | version | id |
|---|---:|---|---|---|
| provisioning embedded seed | 27 | `abfe29b4f262` | **none carried** | — |
| endpoint, unscoped | 27 | `abfe29b4f262` | 153 | `aa22a972` |
| endpoint, `stageKey=lead` | 27 | `abfe29b4f262` | 153 | `aa22a972` |
| endpoint, `stageKey=waitlist` | 27 | `abfe29b4f262` | 153 | `aa22a972` |

The scoping mechanism exists (API params + scope-keyed cache) but this tenant publishes **one**
layout, so every scope resolves to it.

**Mounted invalidation, before → after firing the real event:**

| | Before | After |
|---|---|---|
| entity-layout fetches | 1 (scoped) | **+1 refetch of the same scoped URL** |
| rows / cards | 7 / 6 | **7 / 6** |
| subject | `1a132b7f` | `1a132b7f` |
| header | Specq0913 Family | identical |
| card composition | 6 roles | **identical** |
| panel height | 804 | **804** |

**Exactly one request. Nothing else moved.**

## 10. Stale-configuration behaviour

| Step | entity-layout fetches |
|---|---:|
| selection immediately after invalidation | **1** — the cleared cache genuinely refetched |
| next selection (cache warm again) | **0** — normal operation reuses the module cache |

So invalidation really clears, and the warm path really reuses. **Not proven:** that a *superseded*
version cannot return, because producing version N+1 requires a publish. An in-flight N landing after
invalidation is likewise unproven — `ensureLoad` has no generation guard visible in this path, and it
is a named residual unknown (§18), not a claim.

## 11. Invalidation granularity

**Coarsest possible within the surface, narrow outside it.** `invalidateAll()` clears **every**
Focus Panel summary scope, not the published one — the event carries no scope, so the listener cannot
be selective. But the blast radius stops there: **no** Work Unit bootstrap refetch, **no** VM refetch,
**no** queue reload, **no** page teardown were observed. One refetch, total.

## 12. Runtime continuity during configuration change

Queue mounted · Work View mounted · **Focus Panel did not remount** · subject identity stable · no
false empty · no blank frame · card composition and panel geometry byte-stable. Configuration
convergence, not teardown — the Slice 2/4 properties are unharmed.

## 13–14. `departmentMetadata` ownership design (S6-1)

**An owner already exists and is already fetched.** `/api/admin/departments` is loaded during
workspace boot through a module-level dedupe/TTL helper (`workspaceAdminFetchDedupe`,
`dedupeAdminFetch` / `dedupeAdminFetchWithTtl`, used by `workspaceNavTreeCache` and
`loadOperatorLifecycleLandingClient`). Slice 5 proved its `items[0].metadata` is byte-identical to the
embedded copy.

**Smallest convergence design:**
1. The existing departments owner **retains** the metadata it already receives (today it is read for
   nav/landing and the rest discarded) — retention in an existing owner, **not** a new cache.
2. `buildCurrentWorkSurfaceVM`'s composition boundary reads it from that owner. Workspace boot always
   precedes subject selection in the mounted flow, so no fetch joins Current Work's critical path.
3. **Cold deep-link is the one gap:** a direct URL to a work unit + subject may reach Current Work
   before the departments load settles. Provisioning therefore keeps embedding the metadata **only
   when the client cannot state it already holds it** — the same conditional-transfer shape as S5-3.
4. Invalidation: department configuration changes must invalidate that retention. **No such event
   exists today** (§4 shows even the summary doc has only a same-tab event).

**S6-1 implementation-ready? NO.** Steps 1–3 are ready; step 4 is not. Shipping retention without an
invalidation story would create exactly the long-lived stale reuse this slice exists to prevent.

## 15–16. S5-3 summary-doc convergence

**Design:** provisioning carries `{id, version}` instead of the 27 KB `doc` when the client can state
it already holds that version; it embeds the full doc on cold entry or version mismatch.

**Two concrete gaps this slice found, which the Slice 5 design did not know:**
1. **The seed carries no version today** (`v-` above) — it is a bare `{doc}`. The protocol needs
   `{id, version}` added to the answer before omission is even expressible.
2. **The key must be (scope, version), not version alone.** The client fetches scoped
   (`workViewId`, `stageKey`); this tenant happens to resolve one document for every scope, so a
   version-only protocol would look correct here and break on a tenant that publishes a
   stage-specific layout.

**S5-3 implementation-ready? NO** — and now for a sharper reason than "invalidation unexercised":
the omission protocol would make the client's cached copy authoritative for longer, while §4 shows
invalidation is **same-tab only with no TTL**. Today the per-selection embed is an accidental safety
net; removing it lengthens the stale window for a second operator's publish.

## 17. Operational mutation fan-out

**Not exercised — but the vehicle now exists and is identified.** The three certification fixtures
isolate operational data in reserved namespaces with `ensure/verify/reset`. That is exactly the safe
bounded mutation this audit has needed since Phase 1. It was not run here because the slice's own
rules put configuration first and I would not start a mutation I could not also certify in this run.

**This is the most valuable unblock discovered this slice:** operational refresh fan-out is no longer
environment-blocked. It is schedulable.

## 18. Remaining unknowns

1. Real publish → event → N+1 convergence (needs a configuration-capable fixture).
2. Whether an in-flight fetch for N can land after invalidation (no generation guard observed).
3. Cross-session/cross-tab invalidation — **there is none**; whether that is intended is a product question.
4. Department-configuration change event — does not exist.
5. Operational mutation fan-out — now runnable (§17).

## 19. Ranking

| Rank | ID | Item | State |
|---|---|---|---|
| **P1** | **S7-1** | No cross-session configuration invalidation and no TTL — a mounted tab can hold stale published configuration indefinitely | **new, structural** |
| P1 | S6-1 | `departmentMetadata` ~29.7 KB | design ready, **blocked on invalidation event** |
| P2 | S5-3 | summary doc 27 KB | design sharpened, **blocked**; needs `{id, version}` in the answer and scope-keyed protocol |
| P2 | S5-4 / S4-1 / F-2 | carried | unchanged |
| P3 | S3-4 | Inbox cold-open skeletons | monitor |

**S7-1 is new and is not a performance finding** — it is a correctness property discovered while
mapping the lifecycle. It is ranked P1 because every remaining payload convergence depends on
lengthening client-side configuration reuse, and doing that on top of same-tab-only invalidation
would convert an accidental safety net into a real staleness bug.

## 20. Recommended Slice 8

**Operational refresh fan-out, using the certification fixtures (§17).** It is now unblocked, it is
the oldest open item in this programme, and it needs no new infrastructure.

Then, in order:
1. **S7-1** — decide whether configuration invalidation should cross sessions. This is a product
   decision and it gates both remaining payload items.
2. **S6-1 / S5-3** — implement once S7-1 answers the lifetime question.
3. **S4-1** — always available as contained cleanup; five cards, contract already exported.

**Do not implement S6-1 or S5-3 before S7-1 is answered.** Both trade bytes for longer client-side
reuse, and this slice proved that reuse currently has no way to learn it is wrong.
