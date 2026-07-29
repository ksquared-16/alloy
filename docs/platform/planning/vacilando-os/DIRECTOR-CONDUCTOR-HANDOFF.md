# Vacilando — Director Conductor: Session Handoff (2026‑07‑28)

**Read this top‑to‑bottom before touching anything.** It hands off a live, in‑progress
autonomous objective and a large, uncommitted‑to‑staging build. Everything is local.

---

## 0. TL;DR + the ONE immediate action

We built the **Director Conductor**: Director now conducts a whole *objective*
(`Access & Roles V2`) as a sequence of phases — audit → plan → implementation —
with the operator gated only at judgment points and autonomy in between. A real
autonomous run got through **audit & plan (accepted)** and adopted **13
implementation phases**. It is now **paused on ONE thing:**

> **Claude's OAuth session expired.** Reconnect it and the conductor self‑heals:
> ```bash
> claude        # then /login  (or Claude desktop sign‑in)
> ```
> Within ~90 s the conductor auto‑relaunches **Phase 0** on **slot 1** (the
> objective's own workspace). No other action needed.

Verify auth is back: `precheckProvider("claude")` should return `authenticated`
(see §7). Then watch the Director UI.

---

## 1. Where everything is

| Thing | Location |
|---|---|
| **Dev checkout (work here)** | `/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def` |
| **Branch** | `agent/claude/6-vacilando-os-product-def` — **22 commits ahead of origin, NOT pushed. NOTHING merged to staging.** |
| **Everything runs from** | `scripts/local-dev/` inside that checkout |
| **Server** | `node lib/vacilando-server.mjs --port 3021` (must be **node 22**: `~/.nvm/versions/node/v22.21.1/bin/node`) |
| **UI** | `http://127.0.0.1:3021/#/director` — **use `127.0.0.1`, NOT `localhost`** (server binds IPv4; `localhost` may resolve to IPv6 `::1` → connection refused) |
| **Durable state store** | `~/.local/state/alloy-dev/vacilando/` (JSONL/JSON; survives restarts) |
| **The A&R objective** | `~/.local/state/alloy-dev/vacilando/objectives/cap_6f857767f66c.json` |
| **Native app** | `/Applications/Vacilando.app` — **the app OWNS the server**; closing the app kills it. It self‑heals/attaches on port race. |

**Current server:** running **headless** (a bare `node lib/vacilando-server.mjs`
started by hand, because the native app got closed earlier). If the app is
relaunched it reattaches. To pick up **server (.mjs) code changes** you must
restart the server; **static UI (app.js/styles.css)** changes just need a browser
reload (the server streams them fresh from disk).

---

## 2. Current live state (the thing being handed off)

- **Objective:** `Access & Roles V2` (capability `cap_6f857767f66c`), mode = **autonomous**.
- **Phase spine:** 14 phases. **1/14 done** (Audit & plan accepted). Phases were
  **adopted from the plan mission's own output** (Phase 0 — Catalog & role‑definition
  integrity → … → Phase 12 — Certification).
- **The plan deliverable** (706‑line proposal) is at
  `docs/platform/planning/vacilando-os/qa/vertical-slice-v1/access-roles-v2-proposal.md`
  inside **slot 1's worktree** (`1-vac-access-roles`).
- **Slot binding:** the objective runs entirely in **slot 1** (its plan ran there).
  `objective.worker_slot` is `null` for this objective (it predates the fix) but the
  conductor **infers** slot 1 from the completed plan phase's mission.
- **Blocked because:** Phase 0's first launch failed with `error_code: auth`
  ("Claude needs to reconnect"). A stray earlier attempt that landed on slot 2 was
  stopped/cleaned. **Reconnect claude → it resumes on slot 1.**

All six worker slots (1–6) currently have worktrees (busy with other sprints),
which is *why* running each phase in the objective's own slot matters — see §3.

---

## 3. What was built this session (all committed in wt6, none pushed)

17 commits today (top → older): `git log --oneline --since="2026-07-28 00:00"`.
Newest is `2483b59e8`.

**The Conductor (the headline).** Director conducts an *objective*, not one mission.
- `lib/vacilando/objective.mjs` — durable per‑capability objective: phase spine
  (audit&plan → adopted plan phases), `mode` (gated|autonomous), `worker_slot`,
  `proposed_next`. `advanceOnAccept`, `adoptPhases`, `nextPhase`, `intentForPhase`.
- `lib/vacilando/mission-director.mjs` — `conductNext` (compile+optionally start the
  next phase **in the objective's own slot**), `conductObjectiveNext` (self‑heal
  re‑launch, **auth‑gated**), `setObjectiveMode`, `prepareNextPhase`, `readObjective`.
  `accept` advances the objective and (autonomous) conducts the next phase; on a
  **plan** mission it reads `implementation_phases` from the report and `adoptPhases`.
- `lib/vacilando/mission-compiler.mjs` — **phase‑aware**: an `— implement:` intent
  compiles a **real code mission** (change source, add/run tests, browser QA via the
  worker's stored session + screenshots), not a docs proposal. Source changes allowed;
  push/merge/promote forbidden; a new unsettled decision pauses to ask. The **plan**
  mission now also emits an ordered `implementation_phases` list in its report.
- `lib/vacilando-server.mjs` — `conductorTick` (every 15 s): auto‑accept a phase whose
  gate **fully** passes; auto‑resume a resumable inactivity timeout (capped 3);
  self‑heal re‑launch of a failed pending phase (90 s cooldown, only when provider
  auth passes). Endpoints `/api/director/objective/{mode,prepare-next}`; objective
  attached to `/api/director/conversation`.

**Launcher** (`d9f43712d`, `1ebb1e3a0`): missions run on a free worker slot 1–6, never
the champion (slot 0 = Vacilando itself). `resolveRunSlot` picks a slot with no
worktree; `provisionSlotForMission` runs `alloy-sprint-start <vac-slug> --provider <p>
--slot N --without-server`. A slot with a *conflicted* worktree counts as occupied.
**New rule this session: phases reuse the objective's slot instead of provisioning a
new one — Kelly's explicit direction.**

**Disk hygiene** (`65f7c362e`, `2805e24af`): `lib/vacilando/disk-hygiene.mjs` + a
dashboard panel + `alloy-worktree-gc` runner. `/api/disk`, POST `/api/disk/reclaim`,
POST `/api/disk/policy`. **auto_gc is ENABLED and PERSISTED** to
`~/.local/state/alloy-dev/vacilando/disk-policy.json`. Launcher fails fast <5 GB.

**Notifications** (`b4614903e`): SPA fires a native desktop Notification when a
conversation newly needs the operator (answer/review/accept/blocked); quiet otherwise.
(macOS may need Notifications enabled for Vacilando the first time.)

**Chat‑first UI** (`5ce67efca`, `27a288050`, `c9a69080b`): Director's questions and
its review summary now render **in the conversation thread** as selectable text (not a
side panel); **prominent Send box** (was "Answer"); every message has a **Copy** button;
messages show **in full** (removed the 340px scroll‑cap), 14px.

**Earlier fixes** (see the seed‑gate memory for the full list of 8+ bugs): live‑poll
wiped the answer box; no Edit menu (⌘V dead); "needs decisions" never recorded a
decision; GUI PATH missing `~/.local/bin`; `cursor-agent --verbose` crash; stale error
banner; Auto dispatched onto an occupied sprint (co‑tenancy).

**Tests:** `node --test scripts/local-dev/tests/mission-runtime.test.mjs` → **112/112**.

---

## 4. The model — Kelly's authoritative decisions (do NOT re‑litigate)

1. **Champion (slot 0 = `wt6-vacilando-os-product-def`) is Vacilando itself; it never
   runs missions.** Missions run on worker slots 1–6.
2. **An objective runs ALL its phases in its OWN slot/worktree** (one coherent
   workspace) — not a fresh slot per phase.
3. **Entry is two messages:** (1) the capability **title** ("Access & Roles V2"),
   (2) the detailed **brief** — the substance; Director aligns the plan to it.
4. **Autonomy boundary:** operator is in for set‑objective → audit → adjust/plan →
   decide; after they approve the plan + settle its open decisions, **Director runs
   implementation alone** and the operator steps out.
5. **Auto‑accept only on evidence** (gate fully passes); anything needing judgment
   (`needs_operator`) or a blocker **pauses + notifies**. Never rubber‑stamps.
6. **The operator is here for reasoning & product direction; technicals self‑heal.**
   Timeouts auto‑resume; failed phases re‑launch once auth is restored — no operator
   babysitting.
7. **Lifecycle language:** audit → recommendations → plan → implementation.

---

## 5. OUTSTANDING — what's not done (in priority order)

1. **Reconnect claude** (immediate, §0) → the run continues itself.

2. **The LAST AUTONOMY SWITCH (not flipped, deliberately).** Implement missions'
   acceptance criteria use evidence types **`source_changed` / `tests_pass` /
   `qa_evidence`** that **`lib/vacilando/acceptance.mjs` does not evaluate yet**. So an
   implement phase's gate can't "fully pass" → in autonomous mode it will **pause for
   operator review** (safe default: you review the first real code phase). **To make
   implementation fully unattended, add those 3 evidence checkers** to acceptance.mjs
   (source changed = git diff shows code touched; tests pass = parse the mission
   report's `tests.results`; qa_evidence = screenshots exist under the phase QA dir).
   This is the single biggest remaining piece and the thing to build next.

3. **Recurring Claude OAuth expiry.** Claude's shared‑keychain OAuth has expired
   **twice** mid‑run (likely the concurrent Cowork claude session rotating the shared
   credential). Vacilando should **detect this once and surface a single clean
   "reconnect" prompt** (it half‑does via notifications) rather than letting it fail a
   phase. Worth a durable fix; the self‑heal (§3) already resumes once reconnected.

4. **Auto‑free slot on accept (deferred).** When an objective completes, free its slot
   via `alloy-sprint-finish <slot> --acknowledge-uncommitted` (keeps the worktree,
   reclaimable). Kelly pre‑approved the behavior; not wired.

5. **Optional UX:** relabel the entry ("Name the work" / "Brief Director") to make the
   two‑message model obvious. Kelly was offered this; undecided.

6. **wt5‑vac‑access‑roles leftover** from an earlier launcher run may want End Work.

---

## 6. Governance (hard rules)

- **Do NOT push, merge, promote, or open a PR** on this branch without Kelly's explicit
  go. 22 commits sit local. Nothing to staging.
- Coherent local commits throughout are expected and fine.
- The worker missions themselves are governed: no push/merge/promote; consequential
  actions preview→confirm; a new unsettled product decision pauses to ask the operator.

---

## 7. How to operate (commands)

```bash
# Node 22 for everything (arm64 nvm build — the toolkit needs it)
N=~/.nvm/versions/node/v22.21.1/bin/node

# From the dev checkout:
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/scripts/local-dev

# Restart the server (do this after any .mjs change; the app also owns/respawns it)
kill $(lsof -nP -iTCP:3021 -sTCP:LISTEN -t) 2>/dev/null
$N lib/vacilando-server.mjs --port 3021 > /tmp/vac-server.log 2>&1 &
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3021/     # expect 200

# Tests
$N --test tests/mission-runtime.test.mjs                            # expect 112/112

# Check a provider's auth (the recurring blocker)
$N -e 'import("./lib/vacilando/provider-runtime.mjs").then(async m=>console.log(await m.precheckProvider("claude",{force:true})))'

# Inspect the objective / missions
cat ~/.local/state/alloy-dev/vacilando/objectives/cap_6f857767f66c.json
```

**Operating model with Kelly:** he drives the Director UI and gives UX/product
feedback; you adjust code and infrastructure. **Do not drive missions via curl/API** —
missions run through Vacilando's real flow. Read‑only inspection of state for
diagnosis is fine.

---

## 8. Key files (fast map)

- `lib/vacilando/objective.mjs` — objective/phase spine + adopt/advance.
- `lib/vacilando/mission-director.mjs` — conductor (`conductNext`,
  `conductObjectiveNext`), `accept`, `compileMissionForIntent`, objective ops.
- `lib/vacilando/mission-compiler.mjs` — plan vs **implement** mission shapes.
- `lib/vacilando/mission-executor.mjs` — turn runtime, timeouts, `readLatestReport`.
- `lib/vacilando/acceptance.mjs` — **add the 3 implement evidence checkers here** (§5.2).
- `lib/vacilando/disk-hygiene.mjs` — disk signal + gc runner.
- `lib/vacilando-server.mjs` — `conductorTick`, endpoints, disk policy, static serving.
- `apps/vacilando/public/app.js` + `styles.css` — conductor strip, chat‑first thread,
  copy button, disk panel, notifications.
- `tests/mission-runtime.test.mjs` — 112 tests.

Related reading: `docs/platform/planning/vacilando-os/VACILANDO-PRODUCT-ARCHITECTURE.md`
(canonical architecture index) and the memory note **vacilando-clean-launch-seed-gate**
(the running ledger of this initiative).
