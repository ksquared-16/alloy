/**
 * Vacilando Runtime — GitHub read adapter (authoritative PR state).
 *
 * Read-only `gh` reads, fixed argv. Makes PR state authoritative data for the
 * worker surface + Needs You: none | draft/open | checks | review | mergeable |
 * base/head | url | merged/closed. The mutating side (push / open PR / merge /
 * delete) lives in the command registry as governed, preview+confirm commands.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

import { worktreePathForName } from "./workspace-facts.mjs";

function gh(args, cwd, timeout = 12000) {
  return new Promise((res) => {
    execFile("gh", args, { cwd: cwd && existsSync(cwd) ? cwd : undefined, timeout, maxBuffer: 2 * 1024 * 1024 }, (err, out, se) => {
      res({ ok: !err, out: out || "", err: se || "", code: err?.code });
    });
  });
}

/** Authoritative PR state for a worktree's branch. Never throws. */
export async function prForWorktree(worktree, branch) {
  const cwd = worktreePathForName(worktree);
  if (!cwd || !existsSync(cwd)) return { available: false, reason: "worktree path not found" };
  const fields = "number,state,isDraft,title,url,baseRefName,headRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
  const r = await gh(["pr", "view", "--json", fields], cwd);
  if (!r.ok) {
    // gh exits non-zero when there is no PR for the branch — authoritative "no PR".
    if (/no pull requests found|no default remote|could not resolve/i.test(r.err)) return { available: true, pr: null, branch };
    return { available: false, reason: (r.err || "gh error").split("\n")[0].slice(0, 160), branch };
  }
  let j;
  try { j = JSON.parse(r.out); } catch { return { available: false, reason: "unparseable gh output", branch }; }
  const checks = Array.isArray(j.statusCheckRollup) ? j.statusCheckRollup : [];
  const passed = checks.filter((c) => (c.conclusion || c.state) === "SUCCESS").length;
  return {
    available: true,
    branch,
    pr: {
      number: j.number, state: j.state, draft: j.isDraft, title: j.title, url: j.url,
      base: j.baseRefName, head: j.headRefName, mergeable: j.mergeable, merge_state: j.mergeStateStatus,
      review_decision: j.reviewDecision || null,
      checks: { total: checks.length, passed },
    },
  };
}
