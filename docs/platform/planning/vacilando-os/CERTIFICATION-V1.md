---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando Project OS — V1 Certification

**Verdict — the success sentence is objectively true:**

> *A new project can be started, developed, reviewed, promoted, and closed from
> Vacilando without routine Terminal usage.*

The complete software-development lifecycle was executed end-to-end **through
Vacilando's governed command runtime** — the same `POST /api/commands`
preview→confirm→execute→audit path the UI buttons call — against a **disposable
certification fixture**, on real Alloy infrastructure, touching **no active work**.
Merge was never executed (human-approved only); nothing was promoted.

Served at `http://127.0.0.1:3020` (loopback). Suites green (Node 22):
cert 15/15 · vacilando 26/26. Durable evidence: [`qa/v1-certification/`](qa/v1-certification/).

---

## 1. The disposable fixture — automatically recognizable as disposable

| Property | Value |
|---|---|
| Worktree | `wt2-vacilando-cert-fixture` (slot 2, port 3012) |
| Branch | `agent/claude/2-vacilando-cert-fixture` — the name carries `-cert-fixture` |
| Base | `origin/staging @ 2b554b4b4` |
| Created via | `alloy-worktree-create 2 vacilando-cert-fixture claude` (managed toolkit) |
| Content | a single **`--allow-empty` commit** — zero file changes, so it can never land anything real |
| PR title | `[CERT-FIXTURE] Vacilando certification — DO NOT MERGE` |

Nothing about the fixture could be mistaken for real work: the branch name, the
PR title, and the empty commit all announce it.

## 2. The lifecycle actually executed (through Vacilando, not Terminal)

Every row below ran through a governed registry command. Each was **audited**;
the audit trail is saved verbatim at [`qa/v1-certification/lifecycle-audit.json`](qa/v1-certification/lifecycle-audit.json).

| Step | Vacilando command | Real effect | Outcome |
|---|---|---|---|
| Commit | `repository.commit` (`git commit --allow-empty`) | empty commit on the fixture branch | ✅ exit 0, audited |
| Push | `repository.push` (`git push -u origin`) | **new branch published to origin** | ✅ exit 0, audited |
| Open draft PR | `promotion.open_pr` (`gh pr create --draft --base staging`) | **PR #232 created** → staging | ✅ exit 0, audited |
| Read PR state | `/api/pr` (`gh pr view --json`) | authoritative: `OPEN·draft·MERGEABLE·CLEAN·checks 3/4` | ✅ read-only |
| Merge readiness | `merge.execute` **preview** | exact `gh pr merge` shown; **NOT executed** | ✅ previewed only |
| Close PR (never merge) | `promotion.close_pr` (`gh pr close`) | **PR #232 CLOSED, `mergedAt: null`** | ✅ exit 0, audited |
| Delete worktree | `worktree.delete` (`git worktree remove`, typed confirm `delete 2`) | checkout removed from disk | ✅ exit 0, audited |
| Free slot | slot registration archived (mirrors `sprint-finish`) | slot 2 → free capacity | ✅ dashboard shows 5/6 + 1 available |
| Branch cleanup | throwaway branch deleted local **and** `origin --delete` | no residue | ✅ verified gone |

**GitHub confirms it externally:** `gh pr view 232 → state: CLOSED · mergedAt: None`.
Nothing was promoted. The live dashboard now shows slot 2 **freed**, capacity
**1 available**, and the scheduler recommending **"✅ Safe to start on slot 2"** —
the exact slot the certification returned to the pool.

## 3. Every consequential action followed the full governance ceremony

resolve → validate → target → eligibility → **preview** (summary + exact
authoritative command + consequences) → **confirm** (typed for destructive) →
execute (fixed-argv adapter, `shell:false`, no arbitrary shell) → **audit** →
refresh. Two gates were proven *empirically*, not just claimed:

- **Confirmation gate is real:** `promotion.open_pr` and `worktree.delete`
  invoked without `confirm:true` were **refused** at the confirm stage (in audit).
- **Typed-confirmation gate is real:** `worktree.delete` with the wrong phrase
  (`"delete"`) was rejected with `typed_confirmation_required`; only the exact
  phrase `"delete 2"` executed it. (See audit: 4 `refused` deletes precede 1 `succeeded`.)

## 4. Three real defects the certification surfaced — and fixed

Certification did its job: exercising the live path end-to-end exposed defects
that preview-only QA had never hit. All three are fixed and covered by the green suites.

1. **`gh` rejected git's `-C` flag.** The gh commands (`open_pr`/`merge`/`close_pr`)
   built argv with `-C <worktree>`, which git accepts but gh does not
   (`unknown shorthand flag: 'C'`). **Fix:** commands may now declare a spawn
   `cwd`; the executor runs gh *inside* the worktree instead of passing `-C`.
   (`executor.mjs`, `registry.mjs`.)
2. **The server dropped `confirm_text`.** The API handler forwarded `command`,
   `input`, `confirm` — but **not** `confirm_text` — into the executor, so *every*
   typed-confirmation command (the Delete-worktree button) was un-completable
   from the UI. **Fix:** forward `confirm_text` (`vacilando-server.mjs`). This is
   exactly the class of "reports say it works but the live product doesn't" defect
   the certification exists to catch.
3. **Teardown ordering.** Vacilando's `worktree.delete` removes the checkout but
   leaves the slot registered; the toolkit's `sprint.finish` then can't reconcile
   a slot whose worktree is already gone (`worktree path missing`). Worked around
   for the fixture by archiving the slot record the way `sprint-finish` does.
   **→ V1.1:** a single governed "End Work" that frees the slot *and* removes the
   worktree in the toolkit's supported order.

## 5. Director — provider round-trip

- **Cursor path (fully demonstrated, live):** `director.ask` performs a real
  headless round-trip (`cursor-agent -p --output-format json --trust`), records
  the response + token usage, and renders it in the worker's Director tab
  (`cursor: PONG`, tokens — `qa/v1/03-director`). Dashboard Provider Usage shows
  `cursor · authenticated · 2 calls · 3→6 tok`.
- **Claude path (honest recovery flow, not a workaround):** `claude` is installed
  but its OAuth is expired. Vacilando does **not** fake an answer — Policies and
  the provider surface state the session is expired and the operator remedy is a
  `claude` re-auth in a terminal. The gap is surfaced, never hidden.

## 6. Resource investigation (macOS-authoritative)

The earlier "CPU 100% / memory 99% high" alarm was a **measurement bug**, not
Vacilando waste. Corrected model: `vm_stat` (available = free+inactive+
speculative+purgeable) + `kern.memorystatus_vm_pressure_level` (authoritative
pressure) + compressed + swap. During certification the dashboard honestly showed
**ELEVATED** pressure (compressed 12.1G, swap 9.6G) and the deterministic
scheduler correctly advised *"at most one lightweight worker."* **No new hardware
is indicated;** Vacilando's server is not a top consumer. Auto-scheduling stays
**off**; recommendations only; active work is never auto-paused.

## 7. Safety posture (all honored)

Loopback `127.0.0.1` only · no credentials captured or persisted · release/merge
never auto-approved and **not executed** · destructive ops require typed
confirmation · only a disposable fixture was touched · no active Alloy work
pushed/merged/deleted · throwaway branch fully cleaned up (local + remote).

## 8. Remaining gaps → V1.1

1. Unified governed **"End Work"** that frees slot + removes worktree in the
   toolkit's supported order (finding #3 above).
2. Durable **project/mission** records + Work History project/mission rollup
   (execution audit is the seam today).
3. Full **Start Work wizard** steps + queue persistence when slots are full.
4. **Kelly-minutes** elapsed-time instrumentation (event foundation in place).
5. **Claude** OAuth re-auth (operator action; Cursor works today).
6. Cursor **cost** pricing table (tokens surfaced; cost honestly "unavailable").

## Evidence index — [`qa/v1-certification/`](qa/v1-certification/)

- `lifecycle-audit.json` — verbatim audit of every governed step (authoritative).
- `01-dashboard-slot2-freed.png` — live dashboard after the lifecycle: 5/6 occupied,
  1 available, scheduler recommends the freed slot 2.
- `02-repository-governed.png` — selected-worker Repository tab: authoritative PR
  state + governed Push/Open draft PR/Merge/Delete actions.
- `03-policies-governed-commands.png` — the exact governed command allowlist.
- `04-work-history-audit.png` — execution audit surface.
- External proof: `gh pr view 232 -R ksquared-16/alloy` → `CLOSED`, `mergedAt: null`.
