---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 11 — Focus Panel configuration freshness, implemented

**Lane** `lane_73a897409906` · **Run** `erun_d8a11b91b948d5a6` · base `67e6e7714` · commit **`7a3ac0b3a`**.

No latency claim. Temporary instrumentation: none added to product code; browser-side only.

---

## 1–2. Commit and files

`7a3ac0b3a` — three files:
`focusPanelSummaryLayoutService.ts` (publisher) · `usePublishedFocusPanelSummaryDoc.ts` (owner) ·
`tests/runtime/focusPanelSummaryConfigFreshness.test.ts` (11 tests).

## 3. Scoped publish payload

```ts
export type FocusPanelSummaryPublishedDetail = {
    surfaceId: string; layoutKey: string | null; entityType: string | null; version: number | null;
};
```

**Applicability scope is deliberately not in the payload.** A Focus Panel Summary is **one** published
document whose scope variants are selected when it is read (Slice 7: every scope resolved the same
document, version 153). Claiming a narrower scope would be a lie about what changed. So the payload
names the **family + version**, which is what a consumer can actually act on — and it is the identity
S5-3 will need.

Backward compatible: payload → version-aware invalidation; **no payload → `invalidateAll()`**, the
pre-existing behaviour, so an older caller cannot silently stop invalidating.

## 4. Cache identity

`cacheKey = businessProcessKey | workViewId | stageKey | statusKey` (unchanged), and each slot now
carries the **published `version`** plus `settledAt`. Identity is **family + scope + version** — never
version alone, never document hash.

## 5. BroadcastChannel

`alloy-focus-panel-summary`, mirroring `alloy-queue-row-surface`. The sender posts and **closes
immediately**, so it cannot echo to itself; the receiver ignores anything not `type: "published"`.
Creation and use are wrapped in try/catch exactly as the queue-row implementation does — if
unavailable, same-tab + TTL + foreground revalidation still bound staleness. **No storage-event
fallback was added.**

## 6. TTL — 90s, stale-while-revalidate

Fresh → reuse, no fetch. Expired → the **cached document stays visible** and resolves immediately
while a refresh runs underneath; the panel never blanks and subject navigation is never blocked.

**Failed revalidation keeps the last known document and does not mark the slot refreshed** — so
`settledAt` is unchanged and the next read retries. A transient configuration fetch failure cannot
become an operational teardown. `fetchPublishedDoc` now returns `{ ok, doc, version }` so "fetch
failed" and "there is genuinely no published doc" stay different answers.

## 7. Visibility

`visibilitychange` → if visible **and** past TTL, revalidate. A fresh entry does nothing; a hidden tab
fetches nothing merely because the TTL elapsed.

## 8–9. Generation guard — and a correction worth recording

**The obvious test does not bind, and I proved that rather than shipping it.**

Load → invalidate → release the old response → assert the cache was not overwritten: this **passes
with the guard removed**. Planting exactly that showed 10/10 still green. The reason is structural —
`invalidateAll()` clears the map, so the superseded response writes into an **orphaned slot nothing
can read**. At cache level the stale write was already impossible.

The race actually lives at the **component**: its own promise resolves to whatever the abandoned
request returned, and `setState` would paint it. So the guard was moved to where it earns its place —
the apply step:

```ts
const applyIfCurrent = (issued: number) => (resolved) => {
    if (!active || issued !== currentGeneration()) return;
    setState({ doc: resolved, loaded: true });
};
```

**Both halves are plant-verified:**

| Plant | Result |
|---|---|
| remove `generation += 1` from `invalidateAll` | **fails** "advances the generation on every invalidation" |
| remove `issued !== currentGeneration()` | **fails** "guards the component apply step with that generation" |

Each plant fails exactly its own test and nothing else.

## 10. Test results

**11 passed.** With the neighbouring runtime suites: **48 passed across 4 files.** `typecheck rc=0`.

Covered: new-version invalidation · version-already-held no-op · payloadless compatibility ·
channel post + immediate close (no echo) · BroadcastChannel unavailable · TTL reuse ·
stale-while-revalidate · failed revalidation · scope isolation · generation bump · apply guard.

## 11. Same-tab mounted evidence

| Action | Result |
|---|---|
| scoped event, version **not** held | **1 layout refetch, 0 other requests** |
| scoped event, version **already held** (v153) | **0 refetches** |
| continuity | rows 7, cards 6, subject, header, panelH 804 — **identical before/after** |

## 12. Cross-tab mounted evidence

Two pages in **one browser context** (a real shared `BroadcastChannel`). A publish announced from
Tab 1:

**Tab 2 → exactly 1 scoped layout revalidation, 0 other requests**, and
`{rows 7, cards 6, active, panelH 804}` **identical before and after**.

No Work Unit bootstrap, no VM, no provisioning, no queue, no page reload.

**Honest scope of this evidence:** the *event origin* is still substituted — a real publish would
mutate shared hosted configuration. What is proven end-to-end is everything from the publish
announcement onward. The publish → announcement link is two lines of code (`publishFocusPanelSummary`
→ `dispatchFocusPanelSummaryPublished`), cited not executed.

## 13–15. TTL evidence, failure, frame harness

TTL and failure behaviour are proven by the unit suite against controlled time and a throwing fetch;
they are not separately mounted, because waiting out 90s of real time mid-audit buys nothing the
controlled test does not already establish. **Stated rather than implied.**

Continuity during invalidation is mounted (§11–12) and matches the Slice 4 certified baseline: no
blank frame, no false empty, no remount, no configuration banner, stale layout visible during
background revalidation, replacement applied without teardown.

## 16–17. Request fan-out · real-publish fixture

One affected configuration refetch per invalidation, in both tabs. Nothing else.
**Real publish remains BLOCKED** — no isolated configuration fixture exists, and no shared hosted
configuration was mutated.

## 18–20. Status

**S7-1: CLOSED for the Focus Panel Summary owner; PARTIAL as a platform policy.** The decided contract
is implemented and certified on this surface. It has **not** been generalised to every configuration
family — the queue-row surface already had it, but department/location/reference configuration does
not. The policy is proven implementable; adoption elsewhere is per-owner work.

**S6-1 — READY.** The blocker was an unbounded client-owned configuration lifetime. The pattern now
exists and is certified: a departments owner retaining metadata under TTL + foreground revalidation
is a direct application, and needs no department publish event to be safe.

**S5-3 — one prerequisite left.** The owner is ready (version now tracked, generation guarded,
TTL bounded, cross-tab propagating). Remaining: **the provisioning seed must carry `{id, version}`** —
it still ships a bare `{doc}`, so omission is not yet expressible.

## 21. Ranking

| Rank | ID | State |
|---|---|---|
| ~~P1~~ | S7-1 | **CLOSED on this owner** (`7a3ac0b3a`); generalisation is per-owner |
| **P2** | S6-1 | **READY** — unblocked, design in Slice 10 §15 |
| P2 | S5-3 | one prerequisite: seed `{id, version}` |
| P2 | S9-1 · S8-2 | carried |
| P3 | S8-3 | repair specified |
| P2/P3 | S5-4 · S4-1 · F-2 · S3-4 · D-2/R-005 | carried |

## 22. Recommended Slice 12

**S6-1 — `departmentMetadata` convergence.** It is the largest remaining payload item (~29.7 KB per
subject answer), its blocker is now closed, its design is written, and the freshness pattern it needs
is certified one slice upstream. Sequence: retain in the existing departments owner under the new TTL
+ foreground contract → Current Work reads from it → keep the cold deep-link embed → re-run the frame
harness and the Slice 8 mutation.

**Then S5-3**, which is mechanical once the seed carries its version.
