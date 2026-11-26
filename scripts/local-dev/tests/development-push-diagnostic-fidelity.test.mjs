/**
 * A refusal nobody can read is a refusal nobody can act on.
 *
 * The push guard refuses archive/recovery namespaces on the application origin,
 * and says so in 554 bytes of precise prose naming the rejected ref, the reason
 * and the correct destination. Every one of those bytes was thrown away: the
 * message opens with a blank line so it stands off from the command, the caller
 * recorded `split("NEWLINE")[0]`, and the empty first line fell through
 * `detail || "Push failed"`.
 *
 * Two missions read that generic sentence and concluded the durability
 * mechanism was broken. It was working correctly the entire time.
 */
import test from "node:test";
import assert from "node:assert/strict";

const P = await import("../lib/vacilando/trusted-host-push.mjs");
const { firstMeaningfulLine, pushBranch } = P;

const ESC = String.fromCharCode(27);
const NL = String.fromCharCode(10);

/** The real guard output, shape-for-shape: leading blank line, ANSI, then prose. */
const GUARD_REFUSAL = NL + ESC + "[31mPUSH BLOCKED" + ESC + "[0m - archive/recovery refs may not be pushed to the application origin (origin)" + NL + NL + "Refs rejected:" + NL + "  refs/heads/recovery/x" + NL;

await test("PD1 — the guard refusal survives, instead of collapsing to a generic sentence", () => {
  const got = firstMeaningfulLine(GUARD_REFUSAL);
  assert.match(got, /PUSH BLOCKED/);
  assert.match(got, /archive\/recovery refs may not be pushed/);
  assert.ok(!got.includes(ESC), "ANSI is presentation; a stored failure reason is data");
});

await test("PD2 — the exact regression: line zero of that message is empty", () => {
  // This is what the code used to record. Kept so the defect cannot return
  // quietly: if someone reverts to split()[0], PD1 fails and this explains why.
  assert.equal(GUARD_REFUSAL.split(NL)[0], "", "the message begins with a blank line");
  assert.ok(!GUARD_REFUSAL.split(NL)[0], "which is falsy, so `detail || fallback` discarded it");
});

await test("PD3 — ordinary git errors are unaffected", () => {
  assert.equal(firstMeaningfulLine("fatal: repository not found"), "fatal: repository not found");
});

await test("PD4 — non-fast-forward keeps its own line", () => {
  const nff = " ! [rejected]        main -> main (non-fast-forward)" + NL + "error: failed to push some refs";
  assert.match(firstMeaningfulLine(nff), /rejected|non-fast-forward/);
});

await test("PD5 — empty stderr still yields a stable fallback, never an empty detail", () => {
  assert.equal(firstMeaningfulLine(""), "git push failed");
  assert.equal(firstMeaningfulLine(NL + NL + "   " + NL), "git push failed");
  assert.equal(firstMeaningfulLine(null), "git push failed");
  assert.equal(firstMeaningfulLine(undefined), "git push failed");
});

await test("PD6 — a policy refusal stays distinguishable from a transport failure", () => {
  // Same code path, different causes. An operator must be able to tell "the
  // guard said no" from "the network said no" without reading executor source.
  const policy = firstMeaningfulLine(GUARD_REFUSAL);
  const transport = firstMeaningfulLine("fatal: unable to access: Could not resolve host: github.com");
  assert.notEqual(policy, transport);
  assert.match(policy, /PUSH BLOCKED/);
  assert.match(transport, /Could not resolve host/);
});

await test("PD7 — an auth-shaped error is reported without carrying a token", () => {
  const authish = NL + "remote: Invalid username or password." + NL + "fatal: Authentication failed for 'https://github.com/o/r.git/'" + NL;
  const got = firstMeaningfulLine(authish);
  assert.match(got, /Invalid username or password/);
  assert.ok(!/ghp_|github_pat_|x-access-token/.test(got), "no credential material");
});

await test("PD8 — a refused push still reports through pushBranch, with the cause intact", () => {
  // End to end through the real function with an injected git, so the wiring is
  // proven and not just the helper. Each command answers as the real one would;
  // only the push itself refuses.
  const git = (args) => {
    const cmd = args.join(" ");
    if (cmd.includes("is-inside-work-tree")) return { status: 0, stdout: "true" + NL, stderr: "" };
    if (cmd.startsWith("ls-remote")) return { status: 0, stdout: "", stderr: "" };
    if (cmd.startsWith("cat-file")) return { status: 0, stdout: "commit" + NL, stderr: "" };
    if (cmd.includes("abbrev-ref")) return { status: 0, stdout: "recovery/x" + NL, stderr: "" };
    if (cmd.startsWith("rev-parse")) return { status: 0, stdout: "f".repeat(40) + NL, stderr: "" };
    if (cmd.startsWith("push")) return { status: 1, stdout: "", stderr: GUARD_REFUSAL };
    return { status: 0, stdout: "", stderr: "" };
  };
  const out = pushBranch({
    repository: "ksquared-16/alloy",
    branch: "recovery/x",
    expectedHeadSha: "f".repeat(40),
    worktreePath: "/tmp",
    // A promotion candidate declares what it owns. The stub resolves rev-list,
    // so the declaration is compared rather than skipped.
    base_ref: "HEAD",
    expected_commits: [],
  }, { git });
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.ok(out.detail && out.detail !== "Push failed",
    `detail must carry the cause, got ${JSON.stringify(out.detail)}`);
  assert.match(out.detail, /PUSH BLOCKED|rejected/);
});
