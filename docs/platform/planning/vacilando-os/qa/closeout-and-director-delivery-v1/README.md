---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Operational Closeout + Trustworthy Delivery V1 — QA

Verified live at `http://127.0.0.1:3020` (loopback) against the real Slot 4
(closeout) and Slot 6 (Director). Screenshots via
`scripts/local-dev/apps/vacilando/capture-qa-closeout-director.mjs`.

## Slice 1 — Operational Closeout (real Slot 4)

`GET /api/closeout?slot=4` → an authoritative **Closeout Readiness** projection,
not "dirty":

- **Result:** *Review planning documents* — next: Review, then Preserve or Commit.
- **Repository:** PR merged into staging · 0 ahead · 1 behind (*"1 behind is this
  worker's own merge commit — benign"*).
- **Changes · 8 uncommitted:** 0 tracked · 8 untracked · **no source at risk**;
  classified — 1 planning document, 5 QA evidence, 1 screenshot, 1 report; each
  file shown with its class.
- **Evidence & outputs:** 19.6 MB in worktree vs 0.5 MB in the durable store →
  *"Deleting now would lose …spec….md; 19.6 MB of evidence not in the durable store."*
- **Delete worktree (blocked)** — disabled until safe; End Work always available.

**Proven:**
1. Exact dirty files visible + classified ✅
2. Unique source never silently discarded (0 tracked; `discard_generated` refuses
   source/planning) ✅
3. **Preserve Outputs** is non-destructive — copied 19.6 MB evidence + the unique
   spec to the durable store (0.5 MB → 20 MB); worktree untouched (8 entries, spec
   intact) ✅
4. Dev-server status visible ✅
5. **Delete disabled** while unsafe; after Preserve, evidence shows *preserved:
   true* and the only remaining blocker is the operator's do-not-commit review
   spec (`would_lose: ['planning']`) ✅
6. `End Work` = `sprint.finish` (frees slot, preserves worktree); `Delete Worktree`
   = `git worktree remove` (blocked when dirty) — distinct meanings stated in UI ✅

**Honest stop:** Slot 4 is not auto-deleted. Its lone remaining blocker is a
`do_not_commit_until_approved` spec awaiting the operator's review — everything is
preserved, nothing is lost, and the system correctly requires that decision rather
than discarding a review artifact. Screenshot: `01-closeout-readiness-slot4.png`.

## Slice 2 — Trustworthy Director Delivery (Slot 6)

Every confirmed send now creates a **durable request BEFORE execution** and runs
asynchronously. `POST /api/director/send` returns `{request_id, status:"queued"}`
in ~0.4 s (no 90 s browser-held call); `GET /api/director/requests?slot=N` is the
authoritative store.

**Proven live:**
1. Confirmed send appears **immediately** as Queued with a request_id; draft cleared ✅
2. Progresses `queued → starting → worker-running` (elapsed timer) → terminal ✅
3. **Refresh preserved it** — after a full page reload the same `req_52d01606…`
   restored, showing **Worker responded · PONG · 6.8s · usage** ✅
4. `created_at` written before completion (record exists at t0) ✅
5. Async — a slow request does not depend on a browser-held request ✅
6. Failure preserves the submitted request + offers **Retry**; auth failures offer
   **Reconnect**; probe-starved sends no longer false-fail (proceed on inconclusive
   probe) ✅
7. Server restart marks non-terminal requests **interrupted** honestly (recoverInterrupted) ✅
8. Two request types: **Quick Ask** (bounded 60 s) vs **Worker Instruction**
   (async, up to 10 min) ✅

Screenshot: `02-director-durable-sends-slot6.png`.

## Governance preserved

Loopback only · fixed executables · `shell:false` · no arbitrary shell · no auto
push/merge/promote · **dirty worktrees never deleted** · **source never
auto-discarded** · `discard_generated` refuses unless outputs preserved and only
removes untracked evidence/generated · all consequential actions previewed,
confirmed (typed for destructive), and audited.

## Fix — governed-action silent Confirm (Discard did "nothing")

**Root cause (instrumented, three-layer):** clicking Confirm on Discard produced
**~16 s of silence then a second dialog**. The network trace showed
`POST /api/commands/preview` taking **16.7 s** — every governed command did
`await snapshotSafe()` first, which forces a full projection compose (~16 s under
the memory thrash). Compounding it: the typed dialog routed through
`startCommandTyped` → **preview → showConfirm (a second dialog)** = double-confirm;
and there was **no try/catch** in the executor's internal `run()`, the server
`/api/commands` handler, or the frontend `execute()` — so a thin-snapshot
`TypeError` (`sprintBySlot → undefined → discardGenerated(undefined).worktree`)
would propagate to a hung response and a silent `await`.

**Fix:**
1. Commands use the **cached** snapshot (`getSnapshot({maxAgeMs:600000})`) instead
   of blocking ~16 s on a fresh compose — preview dropped 16.7 s → **0.02 s**.
2. Post-execute refresh is **non-blocking** — returns cached now, forces a fresh
   compose in the background — execute dropped ~30 s (hang) → **0.45 s**.
3. **Immediate feedback:** `execute()` shows a *"running"* toast synchronously the
   instant Confirm is clicked, then *"done"/"failed"* — verified live.
4. **No double-confirm:** typed dialogs (discard/delete) execute directly.
5. **Never silent:** try/catch added in the executor internal `run()`, the server
   `/api/commands` handler (returns 500 JSON, never hangs), and `execute()`
   (network failure → error toast). Null-sprint guarded in preserve/discard.

**Proven live:** click Confirm → immediate toast *"closeout discard_generated…
running"* (0 ms) → *"done"* (~0.5 s), **no second dialog**, no stuck overlay;
Discard removed the 7 evidence artifacts (safe in the durable store) and correctly
**skipped the planning-doc** (`skipped: ['planning-doc']`). Confirmation gate
verified intact (`repository.push` → preview requires confirmation → execute
without confirm → **428**). Screenshot: `03-governed-action-immediate-feedback.png`.

## Request record schema (durable, server-owned)

`director/requests.jsonl` — append-only events projected per `request_id`:
request_id · worker_slot · project_id · mission_id · request_type · instruction ·
provider · provider_session_id · status · created_at/queued_at/started_at/updated_at/
completed_at/failed_at · response · error_code · error_message · duration_ms · usage ·
retry_of_request_id · audit_ref.
