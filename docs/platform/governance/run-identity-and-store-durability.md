---
owner: platform
status: sprint
last_reviewed: 2026-09-04
supersedes: []
---

# Run identity and store durability

> **Incident record and contract.** Two canonical stores were emptied twice, taking 20 registered
> lanes and every run. The first diagnosis was wrong. This records what actually happened, because
> the wrong diagnosis was plausible enough to survive two rounds of reasoning.

## What was destroyed

`lanes/lanes.json` and `execution-runs/runs.json`, emptied **in the same second**, twice. Runs
vanished mid-turn: `vac run-status` and `checkpoint-create` answered `run_not_found`, and finished
work sat on disk with nothing to commit against.

`admissions.json` (2265 entries), `agent-sessions.json` and `governed-actions/requests.json` were
untouched both times.

## The wrong diagnosis

That survivor set looked like strong evidence. The two casualties shared this shape:

```js
} catch { return emptyStore(); }        // then: read → modify → atomic whole-file overwrite
```

So the story was: one transient unreadable read — a partial file seen mid-rename, EMFILE under
concurrency — becomes an empty store, and the next write persists it. The same-second timing read as
one I/O fault hitting two reads.

It was coherent, it explained the survivor set, and it was wrong.

## What actually happened

```js
export function resetDevelopmentLanesForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
}
```

`runtimeRoot()` is `ALLOY_RUNTIME_ROOT`. In a worker shell that points at the **live gateway root**.
Eleven call sites across six suites call these helpers with **no root argument**, so every test sweep
wrote an empty store over the real registries. Both losses landed moments after a sweep.

The survivor set had a duller explanation than a shared I/O shape: those stores have no reset helper.
The same-second timing was two helpers firing in one test process.

**A worse detail.** The durability suite modelled "Gateway restart" as a call to
`resetExecutionRunsForTests()` — which restarts nothing; it writes an empty store. Bare, it wrote to
the live root while the suite's own temp store sat untouched. All seven restart assertions passed
**for the wrong reason, while production was being destroyed.** A green suite was the mechanism.

## The contract

**A test reset may never wipe the live control plane.** `assertResettableRoot` refuses any root
ending in `/gateway` — the same test `durableLanesEnabled()` already uses. It throws rather than
no-ops: a silent skip would leave a suite reading production while believing it had a clean store.

**Absent and unreadable are different answers.** A missing file is legitimately empty; first boot has
no history to lose. A file that exists and cannot be parsed is a fact we do not have, and
overwriting it turns a recoverable problem into a permanent one. Mutations fail closed and leave the
bytes; readers stay lenient so a surface renders empty instead of throwing.

**One canonical owner of run identity.** `requestGovernedAction` took the caller's `run_id`,
consulted the canonical store on the next line, and discarded the answer. After a run vanished,
**14 governed actions stayed bound to it and 12 completed** — push, PR, merge, install, dispatch —
while `checkpoint-create` asked the same question and refused. Measured ownership: `runs.json` held
16 run ids, `governed-actions` held 66. A named run is now verified, not trusted; naming none stays
legal. It fails closed, so a future loss stops governance instead of letting it run on stale identity.

## Live certification

Installed toolkit `fd39f1686c8b`, one deliberate Gateway restart:

* this run stayed addressable and `EXECUTING` across the restart;
* `vac run-status` resolved it;
* a governed action naming a **dead** run was refused, naming the **live** run was accepted;
* all **9** restored lanes survived, byte-identical.

## What this cost

Three turns could not file their Turn Summary, and finished work needed content-bound adoption three
times. Adoption is meant to be recovery for genuinely interrupted work, not the ordinary way a turn
ends. That it became routine was the signal the diagnosis was incomplete.
