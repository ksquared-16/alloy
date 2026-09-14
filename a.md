# Discovery — DX-5 Evidence Experience (third dispatch)

Mission `msn_5ae7696ea93f022a9d` v1 · assignment `asg_dbac4ba966139c` · phase *Discovery*
contentHash `4624625b87d59bcce256b0a8746e7b72`
Root `…/scratchpad/ph` @ `477645367`, branch `runtime/test-dispatch-safety`, base `origin/staging` @ `477645367` (0 ahead / 0 behind)
Root class per `alloy-root`: **unmanaged — NOT SANCTIONED**. See §5.

---

## Headline

**This assignment was not written by an operator.** Every field of it is a string literal in
`scripts/local-dev/tests/director-portfolio-dx7.test.mjs`, and that test does not guard dispatch.
There is no DX-5 work to discover: DX-5 shipped 2026-08-05, and the fixture that dispatched me
marks its own DX-5 mission `completed` and archives it `"DX-5 certified"` two lines after creating it.

This is the **third** dispatch of this brief, not the second. Prior passes are committed at
`92bc1ee78` (2026-09-11) and `b6bd3a105` (2026-09-13). `b6bd3a105` already traced the brief to its
source and recommended withdrawal; it was answered by another byte-identical re-issue.

**The one new finding this pass contributes is §3: the branch named for the fix contains none of it —
and §3a, the remedy appeared as uncommitted work in the tree while I was writing this.**

## 1. Provenance — re-verified at `477645367`

`brief(title)` at `director-portfolio-dx7.test.mjs:26-38`. Every field of my assignment is a literal:

| Assignment field | Value I was given | Source line |
|---|---|---|
| Mission title | `DX-5 Evidence Experience` | `:136` — `seedMission("DX-5 Evidence Experience")` |
| Phase title | `Discovery` | `:31` |
| Phase objective | `Discover` | `:32` |
| Required outputs | `["a.md"]` | `:32` |
| Acceptance criterion `AC1` | **`Done`** | `:34` |
| Constraints | *(empty)* | `:35` |

**`AC1` is the discriminator.** The similarly-named sibling `evidence-experience-dx5.test.mjs` shares
the phase title, objective and scope, but its AC1 reads `"Evidence is reviewable"` (`:82`) and it
suffixes its title `Fixture` (`:76`). Mine matches dx7 on every field including the bare, un-suffixed
title. Note the thin tuple alone would **not** have settled this — two fixtures share it. The AC
statement did.

`:137-142` then sets the mission `completed` and archives it as `"DX-5 certified"`. That is why this
brief reads as a finished mission with nothing left to do: in the fixture, it *is* one.

## 2. Why a test dispatches a live worker — mechanism unchanged

- `:10` sets `ALLOY_RUNTIME_ROOT` to a temp dir. That sandboxes the **state store only, not dispatch.**
- `seedMission` calls `approveMissionExecution` at `:43`.
- `approveMissionExecution` (`lib/vacilando/mission-kickoff.mjs:476`) calls
  `scheduleDispatchAfterKickoff` **unconditionally**.
- The only escape hatch is `VACILANDO_AUTO_DISPATCH === "0"` (`lib/vacilando/assignment-dispatch.mjs:980`).
  **That string appears nowhere in the dx7 file.**

One run of this file mints **four** live workers, and none of the four say "fixture":

| Line | Mission title dispatched | Reads as |
|---|---|---|
| `:103` | `Identity & Access` | a real workstream — `docs/platform/planning/access-identity-v2/` |
| `:123` | `Trust Platform` | a plausible product area |
| `:130` | `Communications` | a real surface |
| `:136` | **`DX-5 Evidence Experience`** | a real, shipped, archived slice — **this assignment** |

Absence of these mission ids from `~/.local/state/alloy-dev` is **not** evidence of containment —
the temp runtime root is exactly why state lands elsewhere while the dispatch still goes out.

## 3. NEW — the branch named for this fix is empty

The worktree sits on branch **`runtime/test-dispatch-safety`**. It has **0 commits ahead of
`origin/staging`** (`git rev-list --count origin/staging..HEAD` → `0`; HEAD and base are both
`477645367`). The two modified files in the tree (`web/app/api/admin/users/[userId]/roles/route.ts`,
`web/tests/access/selfAuthorityRouteDiscovery.test.ts`) are access-identity work, unrelated to dispatch.

**The branch name promises the remedy; no part of it is committed.** Anyone triaging this by branch
name would wrongly conclude a fix is in flight. It is not.

### Guard gap, re-measured at `477645367` — unchanged

| Denominator | Approvers | Guarded | **Unguarded** |
|---|---|---|---|
| All files calling `approveMissionExecution` | 30 | 6 | **24** |
| Restricted to `*.test.mjs` | 27 | 5 | **22** |

Both figures previously recorded are correct and reconcile — they differ only by the three non-`.test.mjs`
helpers (`seed-productization-scenario.mjs`, `claude-execution-session-live.mjs`, `access-identity-v2-cert.mjs`).
Cite the denominator when quoting either.

Two files mention the guard but never approve (`mission-archive`, `execution-session-recovery`), so
"8 files set the guard" overstates protection — only **6** of the 8 are approvers.

The 24 unguarded approvers:

```
access-identity-v2-cert.mjs          executive-command-center-dx8
director-collaboration-dx6           executive-overview-dx1-dx3
director-execution-v2                executor-assignment-seam
director-portfolio-dx7  ← dispatched me   explained-confidence-dx2
ensure-next-implementation-wave      implementation-chain-auto-continue
evidence-experience-dx5              inline-review-soft-card
live-work-progress                   mission-conversation-v3-4
mission-continuation-dx5-5           mission-dashboard-closeout
mission-dashboard-v1                 mission-journey-dx4
mission-runtime                      operator-views
seed-productization-scenario.mjs     workspace-runtime-v3-1
workspace-runtime-v3-2               workspace-runtime-v3-3
```

## 3a. ADDENDUM — the remedy exists, uncommitted, and arrived mid-session

**Written after §3 and §4 below; §3's measurement stands but its conclusion is now too strong.**

At 20:27 during this session an untracked file appeared in the tree:
`scripts/local-dev/tests/development-dispatch-safety.test.mjs` (5,523 bytes, author not me). It is a
repo-lock implementing **exactly §4.3** — a single shared guard instead of 24 independent edits — and
it is better than what §4 asked for. Rather than forcing dispatch off everywhere, it requires each
dispatch-capable test to *declare* one of four classes:

`AUTO_DISPATCH_DISABLED` (setting the env var is itself the declaration) · `DISPATCH_AWAITED` ·
`HOST_INTEGRATION` · `CERTIFICATION`

Its reasoning is sound on a point §4.2 missed: the env check short-circuits **before** `opts.await`,
so a blanket guard would silently neuter the tests that exist to exercise dispatch. It also
back-asserts that the runtime still honours the variable, so the declarations cannot become
decorative — and it records the symptom that makes this expensive: `director-collaboration-dx6`
printed its ok line, passed every assertion, then stayed alive **12m52s** on the leaked timer.
A passing transcript attached to a hung process.

**Status — derived, not executed.** `node` is blocked by this session's Bash permission gate, so I
measured the lock by its own regexes (it is pure `fs` + regex, no imports that dispatch):

| Quantity | Value |
|---|---|
| Dispatch-capable `*.test.mjs` (its `capable` set, excluding SELF) | **27** |
| Declaring one of the four classes | **5** |
| **Undeclared → named in the failure message** | **22** |

**The lock currently fails, by design.** It is the forcing function, not the fix; the 22 files still
have to be annotated. The five that pass all use the env-var form.

Consequences for the rest of this note:

- §3 remains factually correct — `runtime/test-dispatch-safety` still has **no commit** of the remedy
  (the only commit ahead of `origin/staging` is this document). But "nothing is in flight" is wrong:
  work is in progress, just untracked.
- **§4.3 is satisfied in design and should not be re-specified.** The live risk is different now: an
  untracked 5.5 KB lock in an *unmanaged* worktree (§5) is one `git clean` from gone. **Getting it
  committed is more urgent than anything else in §4.**
- §4.1 (operator-side withdrawal) is **unchanged** — the lock prevents future leaks; it does not
  withdraw this mission, which will otherwise re-dispatch a fourth time.

I did not modify, stage, or commit that file — it is another worker's in-flight work.

## 4. Recommendation

1. **Withdraw this mission.** A worker cannot withdraw one — filing is worker-side, execution is not.
   This must be done operator-side or it will re-dispatch a fourth time.
2. **Fix is one line per file**, in 24 files: set `process.env.VACILANDO_AUTO_DISPATCH = "0"` before the
   first `approveMissionExecution`. *Not done here* — this is a Discovery brief scoped to `a.md`;
   implementing it would exceed the assignment.
3. **Prefer a shared guard** over 24 edits — a test-setup helper, or defaulting the guard on when
   `ALLOY_RUNTIME_ROOT` points outside the canonical root. Twenty-four independent copies is the
   failure mode that produced this.
4. **Do not run the dx7 fixture** to reproduce; running it *is* the defect. It mints four more workers.

## 5. Root warning

`alloy-root` reports this root **unmanaged — NOT SANCTIONED for Alloy engineering work**; canonical is
`/Users/vacilando/Alloy`. The base is current (`origin/staging` @ `477645367`, 0/0), so the
*measurements* above are sound — but no code change should be authored here. That reinforces §4.2:
the remedy belongs in a managed worktree via `alloy-sprint-start`.

## 6. What I did not do

No code changed. No governed action filed. The fixture was **not** executed. Scope was `a.md` only,
and the two pre-existing modified files were left untouched — they belong to concurrent work.
