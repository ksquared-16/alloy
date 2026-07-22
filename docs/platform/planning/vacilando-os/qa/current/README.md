# Vacilando — live QA (control-room milestone)

Served at **http://127.0.0.1:3020** (loopback only). Screenshots in this folder were captured by
driving the live app (`scripts/local-dev/apps/vacilando/capture-qa.mjs`), including a **real Cursor
round-trip**. Reproduce with the server up: `node scripts/local-dev/apps/vacilando/capture-qa.mjs`.

## Why the prior report didn't match the live product
The SPA shell referenced `app.js`/`styles.css` **unversioned**, and the app is hash-routed, so a
browser that had loaded an earlier commit kept running the cached old `app.js` — and no server was
running at the time, so the tab showed stale JS. Fix: the server now rewrites the shell to
`app.js?v=<contenthash>` (auto-busting) and serves it `no-store`. Separately, a **macOS bash-3.2**
quirk (`"${arr[@]}"` on an empty array under `set -u`) intermittently broke `alloy-ro` no-arg verbs
(agent-status → empty snapshot); fixed with the `${arr[@]+"${arr[@]}"}` idiom. Served build now
prints `X-Vacilando-Build` and a versioned asset URL.

## Acceptance-gate checklist (routes + interactions)

| # | Gate | Route / interaction | Result |
|---|---|---|---|
| 1 | Old six-page nav gone | rail | ✅ Command Center · Work History · Policies · Settings |
| 2 | Admin, not John Winters | rail footer | ✅ `Admin · Vacilando` |
| 3 | Open selects exact worker | click a worker → `#/command/worker/N` | ✅ URL carries the slot; center surface is that worker |
| 4 | Full operating surface | worker → tabs | ✅ Work · Director · Outputs · Resources · Repository · History |
| 5 | Director conversation visible | `#/command/worker/N` → Director | ✅ conversation + compose |
| 6 | Real provider round-trip | Director → type → **Ask cursor** | ✅ `cursor: PONG` · `3→6 tok · 16.2s` (see 06) — **Claude blocked: OAuth expired** |
| 7 | Screenshots render | worker 4 → Outputs | ✅ evidence images rendered inline (see 03) |
| 8 | Review can be resolved | Needs You → Review required → Approve / Request changes | ✅ governed `review.resolve`, audited (see 09) |
| 9 | Policies renders backend policy | `#/policies` | ✅ 12 groups from config/registry (see 10) |
| 10 | Start Work creates or queues | `+ Start Work` → preview | ✅ preview; refuses when full (see 07) — governed `alloy-sprint-start` |
| 11 | End Work previews consequences | worker → End → dialog | ✅ pause / close / repository (see 08) |
| 12 | PR/promotion/merge/worktree governed | Repository tab → Open draft PR → preview | ✅ exact `gh … pr create --draft` argv (see 05); push/merge/delete governed, typed-confirm for delete |
| 13 | Reload + back/forward preserve worker | reload `#/command/worker/4` | ✅ selection preserved (URL-driven) |
| 14 | Nothing simulated | — | ✅ round-trip is a real `cursor-agent` reply; PR/merge/delete previewed, **not executed**; Claude gap shown honestly |

## Screenshots
01 command-center (worker selected) · 02 resources · 03 outputs (rendered screenshots) ·
04 repository (real PR state) · 05 promotion preview (gh argv) · 06 director (real Cursor round-trip) ·
07 start-work preview · 08 end-work preview · 09 review approval · 10 policies.

## Provider capability matrix (recon)
- **Cursor** (`cursor-agent -p --output-format json --trust`): ✅ authenticated — real round-trips (proven).
- **Claude** (`claude -p --output-format json --resume`): mechanism ✅ but **OAuth expired** → returns a
  real auth-error result. Re-authenticate `claude` in a terminal to enable live Claude answers.
- **gh** 2.95.0: ✅ authenticated (ksquared-16) — governed push / draft-PR / merge / PR-state reads.
- Live **editor-buffer injection**: unavailable (no governed API) — `director.route` stages via clipboard.

## Safety
Loopback only. During QA nothing was pushed, promoted, merged, or deleted — consequential repo commands
were previewed and cancelled. The only real provider call was a read-only "reply PONG / do not modify
files" Cursor round-trip.
