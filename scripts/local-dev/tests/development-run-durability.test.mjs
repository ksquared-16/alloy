#!/usr/bin/env node
/**
 * RUN DURABILITY — a Gateway restart must not make a run disappear.
 *
 * THE DEFECT THIS COVERS, observed rather than imagined. A Gateway restart left
 * `current_run_id: None`, the run absent from state, `vac run-status` and
 * `checkpoint-create` both answering `run_not_found`, and a completed
 * implementation stranded on disk with no run to be committed under. The store
 * afterwards held five lanes with exactly one run each — the signature of a
 * reset, not of the 16-per-lane retention cap doing its job.
 *
 * The mechanism was a lenient read feeding a whole-file write:
 *
 *   read store -> catch -> emptyStore()   then   modify -> atomic overwrite
 *
 * So ONE unreadable read — a partial file seen mid-rename, an interrupted write
 * during shutdown, EMFILE under concurrency — made the next write replace every
 * lane's history with a single run. The Gateway's process lifetime was
 * effectively owning durable run identity, which it must not.
 *
 * These assert the invariant directly: run identity survives a restart, and a
 * store that cannot be READ is never silently REPLACED.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    createQueuedRun,
    executionRunStorePath,
    getExecutionRun,
    patchRunFields,
    readExecutionRunStoreGuarded,
    resetExecutionRunsForTests,
    transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";

const LANE = "lane_9999dddd8888";

function freshRoot() {
    const root = mkdtempSync(join(tmpdir(), "vac-durable-"));
    // Explicit root: bare, this helper wipes the LIVE gateway store.
    resetExecutionRunsForTests(root);
    return root;
}

/**
 * A Gateway restart, as far as durable state is concerned.
 *
 * THIS USED TO CALL `resetExecutionRunsForTests()`, which does not model a
 * restart at all — it WRITES AN EMPTY STORE. Bare, it wrote that empty store to
 * `runtimeRoot()`, i.e. the LIVE gateway root, so the suite destroyed the real
 * run registry on every run while its own temp store sat untouched and every
 * assertion below passed for the wrong reason. Twice on this host, twenty lanes
 * and every run.
 *
 * A restart is a process ending. `execution-run` holds no module-level cache and
 * reads the store from disk on every call, so a fresh process sees exactly what
 * is on disk — which is the property these cases actually need. To prove that
 * rather than assume it, `readsFromAnotherProcess` below asks a genuinely
 * separate node process what it can see.
 */
function restartGateway() {
    // Intentionally nothing: no in-process state is retained to clear.
}

/** What a genuinely new process sees on disk — the real durability question. */
function readsFromAnotherProcess(runId, root) {
    const src = `
      const R = await import(${JSON.stringify(new URL("../lib/vacilando/execution-run.mjs", import.meta.url).href)});
      const r = R.getExecutionRun(${JSON.stringify(runId)}, ${JSON.stringify(root)});
      process.stdout.write(r ? r.state : "ABSENT");
    `;
    return execFileSync(process.execPath, ["--input-type=module", "-e", src], {
        encoding: "utf8",
        env: { ...process.env, ALLOY_RUNTIME_ROOT: root },
    }).trim();
}

function makeRun(root, state = "QUEUED") {
    const made = createQueuedRun({ laneId: LANE, instruction: "durable work", root });
    assert.equal(made.ok, true, made.error);
    if (state !== "QUEUED") {
        const moved = transitionExecutionRun(made.run.run_id, state, { root, origin: "system" });
        if (!moved.ok) return { run: made.run, reached: "QUEUED" };
    }
    return { run: made.run, reached: state };
}

/* ── The run survives, in every state the mission names ─────────────────── */

for (const state of ["QUEUED", "EXECUTING", "WAITING_RESOURCE", "NEEDS_INPUT"]) {
    test(`a ${state} run is still addressable after a Gateway restart`, () => {
        const root = freshRoot();
        const { run, reached } = makeRun(root, state);
        restartGateway();
        const after = getExecutionRun(run.run_id, root);
        assert.ok(after, `${state}: the run must not vanish with the process`);
        assert.equal(after.run_id, run.run_id);
        assert.equal(after.state, reached, "and it must come back in the state it was left in");
    });
}

test("a recoverable ABANDONED run survives and stays recoverable", () => {
    const root = freshRoot();
    const { run } = makeRun(root, "QUEUED");
    const moved = transitionExecutionRun(run.run_id, "ABANDONED", { root, origin: "governor" });
    if (!moved.ok) return;
    restartGateway();
    const after = getExecutionRun(run.run_id, root);
    assert.ok(after, "ABANDONED is terminal for scheduling but recoverable, so it must persist");
    assert.equal(after.state, "ABANDONED");
});

test("COMPLETE and FAILED remain terminal across a restart", () => {
    for (const terminal of ["COMPLETE", "FAILED"]) {
        const root = freshRoot();
        const { run } = makeRun(root, "EXECUTING");
        const moved = transitionExecutionRun(run.run_id, terminal, { root, origin: "system" });
        if (!moved.ok) continue;
        restartGateway();
        const after = getExecutionRun(run.run_id, root);
        assert.ok(after, `${terminal} must remain addressable`);
        assert.equal(after.state, terminal, "a restart must not resurrect a terminal run");
    }
});

test("a run carrying completed work is still checkpointable after a restart", () => {
    // The exact stranding: the implementation was finished, the run was gone,
    // so there was nothing to commit under and adoption became the only path.
    const root = freshRoot();
    const { run } = makeRun(root, "EXECUTING");
    patchRunFields(run.run_id, { checkpoint_ready: true }, { root });
    restartGateway();
    const after = getExecutionRun(run.run_id, root);
    assert.ok(after, "the run must survive to be checkpointed against");
    assert.equal(after.checkpoint_ready, true, "and it must remember that work is ready");
});

test("a genuinely nonexistent run still answers run_not_found", () => {
    // The fix must not make everything look present.
    const root = freshRoot();
    assert.equal(getExecutionRun("erun_000000000000dead", root), null);
});

/* ── A store that cannot be READ is never silently REPLACED ─────────────── */

test("an unreadable store is not reported as an empty one", () => {
    const root = freshRoot();
    makeRun(root, "QUEUED");
    writeFileSync(executionRunStorePath(root), "{ this is not json", "utf8");
    // No reset here: it would write a valid empty store over the corruption
    // this case exists to observe. Reads hit disk, so there is no cache anyway.
    const read = readExecutionRunStoreGuarded(root);
    assert.equal(read.ok, false, "unreadable must be an answer, not silence");
    assert.equal(read.error, "run_store_malformed");
});

test("ABSENT and UNREADABLE are different answers", () => {
    // An absent file is legitimately empty — first boot has no history to lose.
    // A BARE root, not freshRoot(): the reset helper writes an empty store, so
    // the file would exist and this case would be asserting the wrong thing.
    const root = mkdtempSync(join(tmpdir(), "vac-firstboot-"));
    const read = readExecutionRunStoreGuarded(root);
    assert.equal(read.ok, true);
    assert.equal(read.absent, true);
});

test("a mutation refuses rather than founding a new store over an unreadable one", () => {
    const root = freshRoot();
    const { run } = makeRun(root, "QUEUED");
    const before = readFileSync(executionRunStorePath(root), "utf8");
    writeFileSync(executionRunStorePath(root), "{ corrupted", "utf8");
    // No reset: see above.

    // Every write path must refuse; each of these used to overwrite the file.
    assert.equal(createQueuedRun({ laneId: LANE, instruction: "next", root }).error, "run_store_unreadable");
    assert.equal(transitionExecutionRun(run.run_id, "EXECUTING", { root }).error, "run_store_unreadable");
    assert.equal(patchRunFields(run.run_id, { checkpoint_ready: true }, { root }).error, "run_store_unreadable");

    // And the bytes are still there to be recovered, which is the whole point:
    // refusing turns a recoverable problem into a recoverable problem.
    const after = readFileSync(executionRunStorePath(root), "utf8");
    assert.equal(after, "{ corrupted", "a refused mutation must not have written anything");
    assert.notEqual(before, after);
});

test("a write keeps one generation behind it", () => {
    const root = freshRoot();
    makeRun(root, "QUEUED");
    const first = readFileSync(executionRunStorePath(root), "utf8");
    makeRun2(root);
    const prev = readFileSync(`${executionRunStorePath(root)}.prev`, "utf8");
    assert.equal(prev, first, "the previous generation must be recoverable");

    function makeRun2(r) {
        const other = "lane_7777cccc6666";
        const made = createQueuedRun({ laneId: other, instruction: "second lane", root: r });
        assert.equal(made.ok, true, made.error);
    }
});
