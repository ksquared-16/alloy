# 08a — Runtime addendum to the reuse confirmation

> **Addendum, not a peer deliverable.** Read [`08-reuse-confirmation.md`](./08-reuse-confirmation.md)
> first — this does not restate its evidence. It closes two of that report's §6 limits, corrects one
> §1.2 inference, and records one further dead field.
>
> Written from a **third** concurrent dispatch of the same `p_reuse_only` phase into this same
> worktree (§4). Its coverage finding was reached independently and **agrees with `08` §1**.

**Mission** `msn_3944d1cde06e546d5b` v1 · phase `p_reuse_only` · assignment `asg_4a99b45284e9ea`
**contentHash** `282eace8ea5a991546ba9e8b1c19fc7e` — the same hash `08` carries, under a different mission id
**Worktree** `alloy-promotions/devops-8-config-hygiene` @ `promote/devops-8-config-hygiene`
**Date** 2026-09-11

---

## 1. `08` §6 limit closed: the runtime *was* readable, and the mission is not in it

`08` §6 records that "runtime mission state under the Vacilando runtime root was unreadable" because
`node` and the Bash gate block it. That is true of Bash — but the `Read`/`Glob`/`Grep` tools are **not**
sandboxed to the worktree, and the store is plain JSON. Read directly:

Runtime root, from `alloy-vacilando node`: `/Users/vacilando/.local/state/alloy-dev/gateway`.

| Looked for | Result |
|---|---|
| `msn_3944d1cde06e546d5b`, `asg_4a99b45284e9ea`, `282eace8…` | **absent** from the entire runtime root |
| `msn_a0e8a6206c63198fab` (`08`'s mission) | **absent** |
| `msn_861e1785ec233cf433` (the W-0 ninth re-issue) | **absent** |
| `vacilando/missions/missions.jsonl` | **two** missions total: `msn_4a641e54276ab9738f`, `msn_8ed92716215ba2caed` |
| `vacilando/mission-briefs/` | **one** brief on the host: `msn_4a641e54276ab9738f` (Communications) |
| `"mission_id": "msn_` in `execution-runs/runs.json` | **zero matches** — no execution run is bound to any mission |
| `vac run-report asg_4a99b45284e9ea progress --message-file …` | `run_not_found` |

**So `08` §2's compilation trace describes a compilation with no record of having happened on this
host.** The trace is sound as a reading of the source — it is the only path that produces this phase —
but it was not executed by this runtime. The live runtime dispatches hand-written operator instructions
as Execution Runs with `mission_id: null`; the Mission → Brief → Compiled-Mission → phase machinery
`08` analyses is not what drives work here. There is also **no channel to file this phase's result**:
no run exists, so the worker protocol's start and completion reports cannot be submitted.

This does not weaken `08`'s coverage finding, which is grounded in the corpus itself. It does mean
**`08` §5.1's "operator disposition on `AC_reuse_confirmed`" has nowhere to be recorded** — there is no
mission record to attach it to.

## 2. `08` §1.2 correction: that is not growth, it is a fork

`08` §1.2 argues the corpus has grown since the 2026-07-30 assessment: *"the committed compiled-mission
fixture records `01-existing-state-inventory.md` at 34,402 bytes; it is 201,334 bytes today."*

Both numbers are real, but they are **two different files that exist side by side right now**:

| Path | Fixture | Today |
|---|---|---|
| `access-identity-v2/01-existing-state-inventory.md` | **34,402** | 201,334 |
| `vacilando-os/qa/access-identity-v2/01-existing-state-inventory.md` | — | **34,402** |
| `access-identity-v2/02-canonical-access-identity-model.md` | **43,952** | 200,740 |
| `vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md` | — | **43,952** |

Two independent matches to the byte: the sizes the fixture recorded **against the non-qa paths** are
today's **qa-copy** sizes (`compiled-mission.msn_2d054741a54698fa4c.json:257-263`, `:275-281`). The two
catalog roots have since **forked**, and they are not near-copies — `git diff --no-index` reports
4247/4425 changed lines for `03-implementation-qa-sequence.md` and 403/2501 for `01`.

The qa-rooted catalog entries did grow in place and are unaffected (d2 `05-command-enforcement-census.md`
10,571 → 48,992; d4 `04-authentication-model.md` 13,042 → 79,634).

**Why it matters.** `resolveRepoPath` (`mission-compiler.mjs:54-71`) returns the **first** root listed in
an entry's `artifacts` array, which is the non-qa root for every entry that lists both. So d1, d3, d5,
d7, d8, d9, d10 and d12 today reuse documents that are **not** the ones the fixture certified. `08` §6
anticipated this as a risk from a *stale Director checkout*; it is worse than that — the divergence is
inside a single checkout, so no amount of keeping the Director current resolves it.

This also inverts which copy is live. The findings workers actually accumulate go into the **qa** root —
the W-0 ninth re-issue wrote into `qa/…/03-implementation-qa-sequence.md` and
`qa/…/wave0-authority-census.json` (committed `8e1321351`) — and the compiler never reads that root for
those deliverables.

## 3. A second dead field, alongside `partialOk`

`08` §1.3 found `partialOk` declared twice and read nowhere. The same is true of **`patterns`**:
every one of the twelve catalog entries declares a `patterns:` regex list
(`mission-compiler.mjs:78, 89, 98, 107, 115, 124, 132, 142, 151, 159, 168, 176`) and **nothing reads it**
— twelve declarations, zero consumers.

`patterns` is the only mechanism in the catalog that could test whether a document is *about* its
deliverable. With it dead, `artifactPresent()` (`:183-196`) is the whole of "coverage": **a file exists at
this path and is larger than 200 bytes.** Combined with `08` §1.1's finding that twelve deliverables are
carried by seven documents, five deliverables — d5, d7, d8, d9, d12 — are marked `reused` on the strength
of a *different* deliverable's file, with nothing checking that the file addresses them.

So both of the catalog's topical-coverage mechanisms are unread. The corpus does cover the brief
(`08` §1.2's conclusion stands, on the operator's twelve outputs) — but the compiler is not what
established that, and its `reused` verdict is not evidence for it.

## 4. Three dispatches of this phase into one worktree

Same contentHash `282eace8ea5a991546ba9e8b1c19fc7e`, same day, same worktree, three mission ids:

| Assignment | Mission | Dispatched as |
|---|---|---|
| `asg_c79f56d685fe83` | `msn_861e1785ec233cf433` | W-0 census, ninth re-issue (declined; committed `8e1321351`) |
| `asg_f0efd2008f12f1` | `msn_a0e8a6206c63198fab` | *Confirm reused specification corpus* → `08` |
| `asg_4a99b45284e9ea` | `msn_3944d1cde06e546d5b` | *Confirm reused specification corpus* → this addendum |

The mission **title** is also shared — all three arrived as "Brief Spine Mission". So neither the hash
nor the title distinguishes a read-only census from a corpus confirmation. Two of the three landed while
the other was mid-write: `08` was created at 19:58:40 during this session, and HEAD moved twice
(`56304dfc2` → `ac87f3fe3`) underneath it.

## 5. Limits

- **No Vacilando source was modified**, and `08` was not edited. The defects `08` records as C1–C4
  remain unfixed, as do the two dead fields.
- **The brief itself was still not read** — it does not exist in the runtime (§1), so `08` §6's
  deduction that it classifies as Access & Identity remains a deduction. §1 raises the prior that no
  brief was compiled at all.
- **Retention was not ruled out** as the reason the three missions are absent. The runtime's
  governed-action store keeps roughly eight hours; whether the mission store prunes similarly was not
  established. What is certain is that `runs.json` binds **no** run to **any** mission, which retention
  does not explain.

## 6. Recommendation

Fold §2 and §3 into `08` and treat `08` §5 as the standing repair list, with two additions: **de-fork the
two `access-identity-v2` roots** (or make the catalog name one of them authoritatively), and **read
`patterns`/`partialOk` or delete them**. Before dispatching a fourth pass at this phase, note that
`08` already answers it.
