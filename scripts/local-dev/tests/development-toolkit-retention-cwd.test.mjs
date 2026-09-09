#!/usr/bin/env node
/**
 * A PROCESS USES A TOOLKIT VERSION BY LIVING IN IT, NOT ONLY BY NAMING IT.
 *
 * THE DEFECT THIS CLOSES, and it cost a working host for a day. Live-process
 * pinning read the COMMAND LINE only. The tmux server's argv is just `tmux` —
 * it never names a toolkit path — but its working directory was inside
 * toolkit/4ee65145b96b. Nothing pinned that version, retention reclaimed it,
 * and the server was left holding a deleted cwd. Every pane created afterwards
 * inherited that dead directory, so no lane could open a session in its own
 * worktree and the Attendance lane could not be started at all.
 *
 * Proven by control on the live host: a fresh tmux server on its own socket
 * places a pane correctly at the requested directory while the default server
 * cannot, and neither `new-session -c` nor `respawn-pane -c` works around it.
 * Re-running the repaired pin resolver against the real process table pins
 * 4ee65145b96b to pid 48804 via resolved_from_cwd.
 *
 * The retention model's own rule is that reclamation requires positive proof of
 * safety. A live process sitting in a directory is exactly such proof, and it
 * was going unread.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { resolveProcessPins } = await import("../lib/vacilando/toolkit-retention.mjs");

test("a version a live process is SITTING IN is pinned, even when argv never names it", () => {
  const out = resolveProcessPins({ processes: [
    { pid: 10, ppid: 1, command: "tmux", cwd: "/Users/x/.local/share/alloy/toolkit/4ee65145b96b" },
  ] });
  assert.deepEqual(out.pinned_versions, ["4ee65145b96b"]);
  assert.equal(out.pins["4ee65145b96b"][0].resolution, "resolved_from_cwd");
  assert.equal(out.fully_resolved, true);
});

test("argv wins when both name a version, and unrelated cwds pin nothing", () => {
  const out = resolveProcessPins({ processes: [
    { pid: 11, ppid: 1, command: "node /Users/x/.local/share/alloy/toolkit/aaaaaaaaaaaa/lib/s.mjs",
      cwd: "/Users/x/.local/share/alloy/toolkit/bbbbbbbbbbbb" },
    { pid: 12, ppid: 1, command: "zsh", cwd: "/Users/x/Code" },
  ] });
  assert.deepEqual(out.pinned_versions, ["aaaaaaaaaaaa"], "the running image is what argv names");
  assert.equal(out.pins["aaaaaaaaaaaa"][0].resolution, "resolved");
});

test("an absent cwd changes nothing, so unmeasured is not treated as unused", () => {
  // The collector reports that it could not measure; this function must never
  // reinterpret absence as evidence of disuse.
  const out = resolveProcessPins({ processes: [{ pid: 13, ppid: 1, command: "tmux" }] });
  assert.deepEqual(out.pinned_versions, []);
});

test("the `current` symlink is still never pinned as a version", () => {
  const out = resolveProcessPins({ processes: [
    { pid: 14, ppid: 1, command: "tmux", cwd: "/Users/x/.local/share/alloy/toolkit/current" },
  ] });
  assert.deepEqual(out.pinned_versions, [], "a pointer is not a version");
});
