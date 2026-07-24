---
owner: engineering
status: active
last_reviewed: 2026-07-22
supersedes: []
---

# Phase A — Duplicate-initialization diagnosis (MEASURED, not guessed)

The What's Next / Focus Panel initialization was instrumented end-to-end (a dev + flag-gated tracer,
`web/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics.ts`) and captured with an authenticated
Playwright timeline against **real data** on the slot-1 localhost (`playwright/tests/whats-next-init-timeline.spec.ts`).
Every claim below is from `window.__ALLOY_WN_EVENTS` + the network request census, not inference.

## Instrumented path + correlation values

Probes at: `surfaceHost.render` (boot-loader vs provisioned), `focusPanel.mount/body/unmount`,
`recordRuntime.fetch.start/apply/skip/deferred/event.reload`, `currentWorkCard.compose`,
`provisioning.{prefetch.fetch|prefetch.warm-reuse|client.warm-hit|client.warm-miss|cold.fetch|cold.dedup-hit}`.
Each event carries: nav/subject id, runtime instance id, component instance id, request generation,
cache key, preload source, cache hit/miss.

## Timeline — ONE navigation into the `new-leads` work unit (workspace → click, the normal flow)

```
+  0ms  currentWorkCard.compose        content
+  4ms  recordRuntime.fetch.start      recordRuntime-2   cold
+  8ms  focusPanel.mount               focusPanel-1
+  8ms  focusPanel.body                focusPanel-1      commit-critical-seed   ← LOADING #1 (seed)
+  8ms  provisioning.client.warm-hit   (init served from intent prefetch — ZERO network)
+ 12ms  surfaceHost.render             provisioned
+ 13ms  focusPanel.unmount             focusPanel-1                               ← Strict-Mode unmount
+ 13ms  currentWorkCard.compose        content
+ 14ms  recordRuntime.fetch.start      recordRuntime-2   cold                      ← effect re-invoked
+ 15ms  focusPanel.mount               focusPanel-1                               ← Strict-Mode remount
+ 15ms  focusPanel.body                focusPanel-1      commit-critical-seed      ← LOADING #2 (seed again)
+ 43ms  recordRuntime.fetch.apply      recordRuntime-2   atomic complete reveal
+105ms  recordRuntime.fetch.skip       recordRuntime-2   displayVm matches — no refetch
+106ms  focusPanel.body                focusPanel-1      enriched:resolved         ← CONTENT
```

`loadingShellsRendered = [commit-critical-seed, commit-critical-seed, enriched:resolved]`,
`focusPanelMounts = 2`, `recordRuntimeFetchStarts = 2`, `cardComposes = 2`.

## The cause — React Strict Mode dev double-invoke (PROVEN, not assumed)

The component instance id is **`focusPanel-1` on BOTH mounts** and the runtime id is **`recordRuntime-2`
on BOTH fetch.starts** — the instance-id generator (a module counter) minted only two ids for the whole
navigation. A genuine second React instance would have minted `focusPanel-3`/`recordRuntime-4`. Identical
ids across `mount → unmount → mount` are the signature of **Strict Mode re-invoking effects on the SAME
fiber** (dev only). `next.config.ts` sets no `reactStrictMode`, so the App Router default (`true`) applies.

Ruled OUT by measurement (all zero/one): duplicate component instances, cold-loader fallback
(`loadingShellsRendered` has no `cold-loader`), deferred stage-work second fetch (`deferredStageWorkFetches = 0`),
event-triggered reload (`eventReloads = 0`), server-render-then-client-refetch, cache-key mismatch.

## No duplicate initialization NETWORK request

- On the normal flow the init is **warm-served** (`provisioning.client.warm-hit`, 0 network) — the click
  consumes the answer the hover/idle-prep warmed. The Strict-Mode effect re-invoke does **not** re-fetch:
  the second `recordRuntime.fetch.start` is followed by `recordRuntime.fetch.skip` (displayVm already matches).
- The two post-navigation `provisioning-answer` requests seen in the census fire at **+278/+325ms, after the
  surface is already provisioned** — they are off-critical-path re-warming prefetches, not the init.
- Cold direct-nav (`WN_DIRECT_URL`) issues **one** base-URL init fetch; the additional fetches are
  **distinct Work-View lenses** (`new_work_view_2..5`), i.e. idle-prep warming different URLs — not duplicates.

## Fix applied — in-flight de-duplication of the K2 cold entry fetch (owning lifecycle, not a boolean)

`web/lib/runtime/kernel/workUnitProvisioningPrefetch.ts` → `fetchProvisioningEntryDeduped(url)`, used by
`workUnitEntryResourceClient`. When two identical entry fetches overlap (Strict-Mode double-invoke of the
cold path, or a fast unmount→remount with no warm answer), the second reuses the first's in-flight promise
instead of issuing a duplicate network request. Response body parsed once and shared. Entry dropped on settle
(never serves stale). Superseded results are discarded by K2's existing generation guard, so dropping the
per-caller AbortSignal on this fast idempotent GET is safe.

## Conclusion

The observed "workspace → work unit → loading → loading → content" during **localhost QA** is **React Strict
Mode's dev-only double-invocation** — the seed renders twice on the same fiber. It is **not** a real
duplicate initialization and produces **no duplicate init network request**. In production (Strict Mode does
not double-invoke effects) the sequence is a single seed → enriched. The in-flight dedup hardens the cold
entry path so that even a genuinely-concurrent identical entry fetch coalesces to one request.
