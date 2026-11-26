# P0-7.6 Phases 2–5 — the real-page trace: identifier, clock contract, and byte probe

Run: erun_77eca4a07ae34742 · Lane: lane_73a897409906

## Phase 2 — the navigation identifier, and why none was minted

The dispatch asks for one diagnostic trace identifier so a single navigation can be followed from
request to authoritative paint, and warns it must never become product state, an authorization
input, a cache key or a semantic owner.

**No identifier was minted, because the document already is one.**

`RouteTimingSeed` renders the server's own marks *into the response being measured*, as
`<script id="__alloy_route_timing" type="application/json">`. It is emitted by the PAGE segment,
which finishes last and owns the compose. So every server mark is bound to exactly the navigation
that carried it, by construction. There is nothing to join on and nothing to correlate.

Minting an id would have added a new identifier without adding a fact — and would have created
exactly the object the dispatch warns about. The safest identifier is the one that does not exist.

This also means the byte probe below is self-correlating: it parses the marks out of the very
bytes it timed.

## Phase 3 — the clock contract

**One browser clock.** `performance.now()`, origin `navigationStart`. The existing
`visibleCompletionProbe` already enforces this and documents why: it previously mixed
`Date.now()`-minus-a-late-`t0`, the readiness chain's `performance.now()`, and a Playwright-driver
`Date.now()` in Node — three origins, which once made a response appear to land *after* the
completion it causes.

**The server clock is never converted by assumption.** Server marks are durations and offsets
within the request, plus two wall-clock epochs. The probe reports

```
serverEpochSkewMs = layout_entry_epoch_ms − (performance.timeOrigin + requestStart)
```

as a *published quantity*, never as a subtraction applied to anything. It is the server's clock
minus ours about the same instant, network included. If its magnitude is large, no cross-clock
interval in that sample may be believed, and the reader can see that directly.

**The rule this enforces:** an interval is only formed between two endpoints on the same clock.
Cross-clock quantities are published as raw endpoints plus measured skew. This is what stops a
subtraction bucket from being born — the failure that once produced an "807 ms delivery floor"
that byte-level measurement then refuted.

## Phase 5 — the byte probe

`playwright/tests/zz-p076-page-byte-timeline.spec.ts`. A streaming reader (`res.body.getReader()`)
over the real operator page, **not** script insertion — a tag times when the browser chose to run
it, not when bytes arrived.

Captured per navigation: headers-available, first body byte, every chunk's arrival offset and
cumulative bytes, body end, full Resource Timing (`requestStart`, `responseStart`, `responseEnd`,
`ttfb`, `download`, encoded/decoded sizes), the parsed server marks, and the skew above.

Markers are attributed to the chunk in which their **first byte arrived**, searching from slightly
before each join so a marker split across a chunk boundary is not lost:
`html_open`, `head_close`, `body_open`, `first_card_key` (`data-universal-card-key`),
`focus_panel_region`, `route_timing_seed`.

**Mechanics verified** against a reachable unauthenticated response (11,718 bytes decoded / 2,923
encoded, 1 chunk, TTFB 209 ms): chunks captured, `html_open`/`head_close`/`body_open` detected,
and the three first-order markers correctly **absent**. That absence is the control — the probe
does not invent a payload it did not see.

`P076_SKIP_WAIT=1` exists only to exercise these mechanics. It must never be set for a real
sample: without the operator's frame there is no first-order payload, and a run that measured one
would be lying.

## What was already instrumented, and therefore not rebuilt

- **Phase 4 (server timeline)** — `RouteTimingMarks` already ships `route_meta_ms`,
  `layout_total_ms`, `compose_wall_ms`, `page_total_ms`, `compose_total_ms`, the
  `compose_sections` breakdown (authorization / work_unit / configuration / presentation /
  records / projection / composition + named spans), and the outer awaits
  `route_identity_ms` / `inner_compose_ms` / `card_producers_ms`.
- **Phase 6 (browser/React timeline)** — `focusPanelCommitTiming` records the focus chain into
  `window.__alloyPerf.marks` / `window.__alloyFocusChain`, and `visibleCompletionProbe` provides
  V1, V2 and **V2.1 semantic authoritative finality**.
- Both are enabled on deployed staging by the same switch (`ALLOY_ROUTE_TIMING=1`), so the client
  observes whether the server turned diagnostics on rather than needing a second flag.

**Phases 4 and 6 needed no new instrumentation. Only Phase 5 did.**

## Blocked

Phases 1 and 6–10 require a live deployed session. The staging QA session expired (~5 h old; every
load reported `signedOut=true`, `rows=0`, `marks=ABSENT`).
`environment.restore_deployed_qa_session` is parked in **`awaiting_operator`** — a gate no lane can
pass. No deployed measurement was taken in this run.

Note for the next run: `vac browser-auth restore` files the *slot* session, completes without
approval, and writes `<gateway>/auth/slotN/storage-state.json`. That file does **not** authenticate
deployed staging. Only `environment.restore_deployed_qa_session` mints
`<gateway>/auth/deployed/alloy_staging_web/storage-state.json`, and it always needs a human.
