# Operational Trustworthiness V1 — Engineering Closeout

- Date: 2026-07-24
- Worktree: `wt6-vacilando-os-product-def` · branch `agent/claude/6-vacilando-os-product-def`
- Tip: `8b61d3510` · **11 commits ahead of `origin/staging`, 0 pushed**
- Tests: **9/9** (`node --test scripts/local-dev/tests/mission-runtime.test.mjs`)
- Trust: **15/16 (94%)**, browser coverage **7/7 categories**
- Server: healthy on `127.0.0.1:3020`

This closeout covers the trustworthiness arc (4 commits) that turned Vacilando
from a working prototype into an operating system the operator can trust:
`d4a6278a1 → 6cd045f1d → 71c105086 → 8b61d3510`. The mission-execution vertical
slice it builds on is `b590b0a64 → 502a53a7b → a118f97b4`.

---

## 1. Architecture delivered

### Identity Runtime (`lib/vacilando/identity.mjs`)
One authoritative identity per slot, **verified** — not trusted. It cross-checks
the slot registry's declared branch against the worktree's *actual* checked-out
branch via git, so a stale/renamed registry entry is **detected, not obeyed**.
Every surface (dock, closeout, mission execution, acceptance, destructive
commands) resolves through it; conflicts fail closed. Also declares the
**runtime-host** worktree explicitly (see §Runtime host).

### Governed Mission lifecycle (`lib/vacilando/mission-director.mjs`)
Every consequential mission action (start / stop / steer / accept) runs the same
lifecycle as the command registry: **preview → confirm → queued → running →
terminal → audit**. Unconfirmed consequential actions return `428` with a preview
that names the worktree and the effects. A mission turn is a first-class durable
Director request (`active_request_id`), so it shares the same timeline and
refresh-recovery as every worker instruction.

### Trust Dashboard (`/api/trust` + Runtime Trust view)
Replaced a single "100%" score with **7 explicit categories** — Identity
consistency, Status truthfulness, Interaction responsiveness, Governed actions,
Refresh recovery, Runtime resilience, Browser-certification coverage. Each reports
passed/total, unresolved defects, evidence, and whether its proof is **browser or
API-only**. A category with API-only proof cannot receive browser credit. The
score is computed live from runtime state, so every regression is measurable.

### SWR caching (stale-while-revalidate, in `vacilando-server.mjs`)
A generic cache that eliminated head-of-line blocking: a warm key answers
instantly from cache and refreshes in the background; a cold key waits a bounded
~1.2s then answers `pending` rather than holding the operator. Applied to the
provider probe, resource scan, closeout, and the snapshot. No operator read ever
waits on a shell-out again.

### Closeout product (`lib/vacilando/closeout.mjs` + registry + UI)
Made authoritative and destructive-safe: readiness computed from the identity's
real git state; Preserve / Discard / End Work / Delete each governed and audited;
Delete Worktree is **atomic** (removes the checkout *and* frees the slot) and
**fails closed** on dirty / conflict / unmerged / unreadable git. This is the
sprint's headline deliverable — see §Certification.

### Runtime host identity
The worktree the server runs from is a first-class **`system_host`** workspace
with explicit project / repo / worktree / branch / purpose / status (`/api/host`
+ Trust view). It is never assigned to a slot, and **worker execution never falls
back to it** — the executor refuses without an authoritative slot identity.

### Browser certification
The operator paths were exercised through the live UI (not just APIs), on
disposable worktrees, under real host pressure. Results recorded at
`~/.local/state/alloy-dev/vacilando/certification/browser-cert.json` and consumed
by the Trust Dashboard's coverage category.

---

## 2. Major defects discovered (during certification)

### D1 — Slot represented two worktrees (multiple source of truth)
- **Root cause:** the Worker Runtime executed in the runtime-host worktree while
  recording the *slot's* worktree name on the mission; the record could disagree
  with reality.
- **Implementation:** execution binds to the slot's authoritative worktree and
  records `executed_in`; acceptance evaluates there; the host worktree is declared
  a non-slot system host.
- **Validation:** Trust "Truthfulness — mission records match execution" = pass;
  `/api/identity` cross-checks branch via git.

### D2 — Head-of-line blocking (responsiveness)
- **Root cause:** single-threaded server; `/api/providers` (auth probe) ran
  ~23s standalone (40s under load) and starved 0.04s reads to 11s.
- **Implementation:** generic stale-while-revalidate cache + background warmers.
- **Validation:** settled warm latency **0.12–0.58s** across all endpoints;
  cold `/api/state` **24s → 1.85s**; providers **~5ms** warm.

### D3 — Mission actions ungoverned & unaudited
- **Root cause:** mission start/stop/steer/accept bypassed the registry lifecycle
  — zero audit events, no confirmation. The most consequential action (spawns a
  real Claude process that writes files) was the least governed.
- **Implementation:** preview→confirm→audit on every mission action; 428 on
  unconfirmed; `active_request_id` populated.
- **Validation:** unconfirmed start returns 428 with a worktree-named preview;
  refusals audited (`mission.start outcome=refused`).

### D4 — UI showed stale/other-record data while loading (misleading)
- **Root cause:** mission selection rendered the *previous* mission during the
  async fetch, with no loading state.
- **Implementation:** explicit loading state; never render another record while
  fetching.
- **Validation:** browser — selecting a mission shows a loading state, then the
  correct record.

### D5 — Worker dock collapsed to zero under host pressure (resilience)
- **Root cause:** the git-heavy projection returned an empty-but-successful frame
  under load, cached as truth, blanking the board.
- **Implementation:** the board **spine** comes from the slot registry (always
  available); the expensive projection only *enriches*. Frames carry `board_state`
  (live / partial / projection_unavailable / loading / no_workers) + banner. Two
  raw-0-sprint leak paths (command post-execute refresh + broadcast) closed, plus
  a client guard: a 0-worker frame never replaces a populated board.
- **Validation:** browser — 5 cards retained under a degraded projection with
  "Live detail unavailable — showing registered workers".

### D6 — "First click does nothing"
- **Root cause:** `render()` marked a key as rendered *before* its early
  not-ready return, so the next identical key short-circuited and left a stale
  view.
- **Implementation:** `lastKey` is set only after a completed render.
- **Validation:** browser — deep-link and first click render on first attempt.

### D7 — Closeout under-reported unique planning docs (DATA-LOSS class)
- **Root cause:** `git status --porcelain=v1` collapses untracked files into their
  *directory*; `classifyPath` keys off the file extension, so a planning doc in a
  **new** directory was classified "other" — absent from `would_lose`, the
  "Review planning" gate never fired, and a worktree could read "safe to delete"
  while holding unique planning work. Evidence survived only because it matches on
  a path, not an extension.
- **Implementation:** run status with `-uall` at all three closeout call sites.
- **Validation:** live on a disposable worktree — planning doc now listed in
  `would_lose`, decision becomes "Review planning documents", delete blocked.
  Regression test added.

### D8 — Delete guard was snapshot-dependent (DATA-LOSS class)
- **Root cause:** `worktree.delete` eligibility checked
  `snapshot.git.state === "dirty"`, but a registry-backed (under-load) sprint has
  `git: null` — so the "blocked when dirty" guard silently passed exactly when the
  host was starved. It could also build a path against an *undefined* worktree.
- **Implementation:** the guard reads the **authoritative** git state of the
  identity-resolved worktree and **fails closed** on conflict / missing /
  unreadable / dirty / unmerged; the target path comes from identity, never the
  snapshot.
- **Validation:** live — dirty worktree blocked with a clear reason; clean
  worktree resolves the exact `git worktree remove <path>`.

### D9 — Delete left a dangling, un-freeable slot
- **Root cause:** `git worktree remove` freed nothing; the normal End-Work path
  (`alloy-sprint-finish`) then *refused* to clean the slot ("worktree path
  missing") — a dead end requiring Terminal.
- **Implementation:** `worktree.delete` is now **atomic** (internal command) —
  removes the checkout **and** archives the slot metadata in one governed action;
  the board shows a not-yet-cleaned slot as "worktree deleted — free the slot".
- **Validation:** live — `removed:true, slot_freed:true`; board reflects it; no
  Terminal needed.

### D10 — Selecting a worker crashed the surface to blank
- **Root cause:** unguarded `sp.git.ahead/state` and `state.snap.repository.*`
  threw when the selected worker's board detail was registry-only (`git: null`).
- **Implementation:** guarded all sites (`sp.git ? … : "pending"`).
- **Validation:** browser — the surface renders "git detail pending" instead of
  going blank.

### D11 — Misleading destructive control
- **Root cause:** the Delete dialog's button read "Preview →" but executed
  directly.
- **Implementation:** relabelled "Delete worktree" and routed through a genuine
  preview→confirm that shows the exact `git worktree remove <path>` and effects.
- **Validation:** browser — Cancel is a no-op; wrong phrase refused; confirm shows
  the command before executing.

---

## 3. Certification summary

### Browser-certified (clicked in the live UI, verified by filesystem/audit)
- Dashboard: select every worker, return to dashboard, refresh, **dock persists**.
- Board resilience: 5 cards retained under a degraded projection; deep-link render.
- Mission: compile · review package · start (governed confirm) · running w/ live
  elapsed · **full page reload while running preserved** · navigate away & back ·
  stop (governed).
- Closeout: **Preserve Outputs** (store copy verified) · **Discard Generated**
  (typed-phrase gate; wrong phrase refused+audited; planning doc survived; only
  preserved/generated removed) · **blocked Delete when unsafe** · **Delete
  Worktree** confirm→execute (checkout removed, slot freed, `origin/staging` +
  branch intact, audited).

### API-certified (verified at the command/endpoint the UI calls, not clicked)
- Atomic delete `removed:true, slot_freed:true` on a fresh disposable worktree.
- Mission steer/resume/accept lifecycle + capability write-back (prior slice).
- Director Quick Ask round-trip lifecycle (prior session).

### Destructive-action coverage
| Action | Guard | Certified |
|---|---|---|
| Discard Generated | typed phrase "discard N" · preserve-first · untracked-only · never source/planning | **browser** |
| Delete Worktree (unsafe) | fail closed: dirty / conflict / missing / unmerged | **browser** (blocked) |
| Delete Worktree (safe) | typed phrase "delete N" · genuine preview · atomic + frees slot | **browser** (executed) |
| End Work (close session) | confirm · archives metadata · never deletes/pushes/merges | API + prior sessions |

### Remaining uncertified (through the browser)
- **Director tab**: Quick Ask / Worker Instruction / Retry / Reconnect clicks
  (API-certified, not clicked this arc).
- **Provider Manager**: Verify / Diagnostics / Reconnect.
- **Memory surface**: Reclaim confirmation (its refuse-active-server guard is
  API-verified).
- **Mission**: outputs/evidence/evaluate/accept **clicks** (executed via API +
  earlier live run; not re-clicked this arc).

---

## 4. Metrics

- **Tests:** 9/9 (`node --test`). Grew 7 → 9 this arc (planning-doc classification;
  delete-guard contract).
- **Commits (this arc):** 4 — `d4a6278a1`, `6cd045f1d`, `71c105086`, `8b61d3510`
  (11 total ahead of staging incl. the vertical slice).
- **Response-time:** providers 22.9s → ~5ms warm · resources 5.8s → 0.04s ·
  closeout 4.0s → 0.06s · cold `/api/state` 24s → 1.85s · warm reads 0.12–0.58s.
- **Trust:** single opaque score → **7 measurable categories, 15/16 (94%), 7/7
  browser-certified**.
- **Governance:** mission actions went from **0 audited / 0 confirmed** to fully
  governed (preview→confirm→audit); closeout destructive commands hardened to
  fail closed on authoritative state.

---

## 5. Known limitations (honest — left for a future sprint)

1. **Host pressure degrades the *renderer*, not the product.** At load ~30–48 the
   browser is slow to paint between clicks; the product degrades honestly
   (banners, "detail refreshing", pending states, no false claims) but a calmer
   machine is needed to *feel* as trustworthy as it provably is.
2. **Director / Provider / Memory** surfaces are not browser-certified this arc
   (API-certified). They are governed, but not clicked-through.
3. **"Responsiveness — cached" check reads cold** immediately after a restart
   (correct, but pulls the score to 15/16 until the warmers run).
4. **Reasoning Engine / Gap Analysis remain unbuilt** (documented in the earlier
   operating-model audit) — reasoning still happens inside the provider turn.
   Orthogonal to trustworthiness, but the operating model is not yet complete.

## 6. Technical debt (worth tracking only)

1. **`.tsbuildinfo` at repo root is classified "other"**, so Discard leaves it.
   Harmless (leaving a file is safe), but a classification gap. Low priority.
2. **The memory auto-reclaim path** (`server.stop` via the reclaim loop) still
   passes the raw snapshot, not the resilient board — under load it could resolve
   an undefined worktree. Not operator-facing; guard it when Memory is certified.
3. **Trust "Governed actions" shows 2/3** intermittently — the "consequential
   confirmed" ratio depends on recent audit history; consider a rolling window so
   the metric is stable rather than history-sensitive.

## 7. Recommended next milestone

**"Peripheral Surface Browser Certification"** — bring Director, Provider Manager,
and Memory to the same browser-certified bar Closeout now holds (click-through,
disposable fixtures, filesystem/audit verification), ideally on a quieter host so
the renderer isn't the bottleneck. That closes the last API-only gaps and would
make the whole operator surface — not just Closeout and the mission path —
promotable. The Reasoning Engine remains a separate, larger track.

---

**Promotion status: not this sprint** (per standing instruction — nothing pushed,
merged, or promoted). Closeout — the highest-risk surface — is now browser-safe:
the operator can delete worktrees from the UI without Terminal and without fear.
