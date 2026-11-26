---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Director conversation fix — live QA

Verified against the real app at `http://127.0.0.1:3020` (loopback). Build
`f1e8ca12af`. Screenshots captured by driving the live app
(`scripts/local-dev/apps/vacilando/capture-qa-director.mjs`, Node 22).

## Result: all 20 required checks pass

| # | Check | Result |
|---|---|---|
| 1–4 | Type ≥500 chars, wait ≥3 refresh cycles → text remains | ✅ 620 chars survived ~4 cycles (SSE + poll@4s + resources@9s) |
| 5–6 | Switch tab and return → text remains | ✅ preserved across Work↔Director |
| 7–8 | Per-worker drafts (slot 4 vs slot 6) stay separate | ✅ `vac.draft.6` and `vac.draft.4` distinct; each restored on return |
| 9–10 | Submit prompt >1,800 chars → previews successfully | ✅ 2,432 & 1,961-char prompts previewed |
| 11–12 | Cancel confirmation → draft remains | ✅ 156-char draft intact after cancel |
| 13–14 | Submit long prompt to supported provider → real response | ✅ 1,954-char prompt → cursor `PONG` (`Worker responded`) |
| 15 | Draft clears only after success | ✅ cleared after PONG; storage cleared |
| 16–17 | Provider/auth failure → draft remains | ✅ claude `OAuth session expired` → status `Authentication required`, draft preserved (156 chars) |
| 18 | Button says "Send to Worker", not "Ask Claude" | ✅ primary `Send to Worker`, secondary `Copy Instruction` |
| 19 | Provider identity only as metadata | ✅ "Assigned provider: Claude · Provider status: …" — never the action verb |
| 20 | No arbitrary-shell path introduced | ✅ `spawn` fixed argv, no `shell:true`, prompt via stdin |

## Root causes

- **Disappearing text:** `render()` did a full `innerHTML` rebuild on every
  `render(true)` (fired by SSE snapshot, the 4s poll, and the 9s resource
  refresh), and the draft lived only in the DOM. Each background refresh
  recreated the textarea empty. Fixed by owning the draft in application state
  (`state.drafts[slot]`, mirrored to sessionStorage), rendering the textarea
  from that state, and preserving caret/scroll across rebuilds.
- **"1,800-character" error:** not a real Vacilando limit. The schema capped at
  8,000 (not 1,800); both provider CLIs accept ≥8k; a real 2,461-char round-trip
  succeeds. The reported number came from a provider-side/auth message. The real
  design problem was passing the prompt as an **argv element** (leaks into `ps`,
  bounded by ARG_MAX). Fixed by delivering the prompt on **stdin** and raising
  the Director limit to **24,000**.

## Screenshots

- `01-provider-neutral-surface.png` — "Director" header, provider as metadata, Send to Worker / Copy Instruction.
- `02-draft-preserved-after-refresh.png` — 225-char draft intact after ~15s of live refreshes.
- `03-per-worker-draft-restored.png` — returning to a worker restores its own draft.
- `04-long-prompt-preview.png` — 1,961-char prompt previews (Send to Worker, consequential); cancelled, not executed.
- `05-worker-response-success.png` — real cursor `Worker responded` round-trip.
- `06-failure-with-preserved-draft.png` — claude auth failure, `Authentication required`, draft preserved.

## Safety

Loopback only. Prompt delivered on stdin (fixed argv, `shell:false`, fixed bin
paths) — no arbitrary shell, no prompt in process listings, no temp files.
Unsent drafts never sent to the server; sessionStorage only (never localStorage).
Nothing pushed, merged, promoted, deleted, or exposed beyond localhost.
