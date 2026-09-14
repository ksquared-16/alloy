/**
 * `required_checks_*` must count REQUIRED checks, and only those.
 *
 * Measured on PR #895: 14 checks, all 3 required ones green, and one cancelled
 * Supabase preview — cancelled by that integration's concurrent-branch quota,
 * which says nothing about the candidate. `cancelled` classifies with the
 * failures, so the evidence read failing=1 and passing 13 of 14, and
 * `certified_staging_merge_v1` refused a promotion whose every required check
 * had passed. The snapshot beside it in the same record read required 3,
 * passing 3, failing none.
 *
 * These lock the scoping, the fail-closed behaviour when requiredness cannot be
 * read, and the never-reported required context — which must not vanish from the
 * denominator and read as green.
 */
import test from "node:test";
import assert from "node:assert/strict";

const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");
const D = await import("../lib/vacilando/director-authority.mjs");

const N = { repository: "ksquared-16/alloy", pullRequestNumber: 895 };

const PR = {
  state: "open", merged: false, draft: false, mergeable: true,
  mergeable_state: "unstable", head_sha: "14724ed0766ed2cc5d8cb52521cd79ab0c6cff1f",
  head_ref: "agent/api-thread5-slice-b6", base_ref: "staging",
  head_repo: "ksquared-16/alloy",
};

const REQUIRED = ["Trust Adoption certification", "Trust DB certification", "Prebuild gates (route capabilities)"];

/** The real shape of PR #895: three required green, one optional cancelled. */
const CHECKS_895 = [
  { name: "Trust Adoption certification", state: "SUCCESS", bucket: "pass" },
  { name: "Trust DB certification", state: "SUCCESS", bucket: "pass" },
  { name: "Prebuild gates (route capabilities)", state: "SUCCESS", bucket: "pass" },
  { name: "Full graph (tests + scripts)", state: "SUCCESS", bucket: "pass" },
  { name: "Production graph", state: "SUCCESS", bucket: "pass" },
  { name: "Supabase Preview", state: "CANCELLED", bucket: "fail" },
];

function ghStub({ checks = CHECKS_895, required = REQUIRED, protectionStatus = 0 } = {}) {
  return (argv) => {
    const joined = argv.join(" ");
    if (joined.includes("/pulls/")) return { status: 0, stdout: JSON.stringify(PR), stderr: "" };
    if (joined.includes("/protection/required_status_checks")) {
      return {
        status: protectionStatus,
        stdout: protectionStatus === 0 ? JSON.stringify({ contexts: required, checks: [] }) : "",
        stderr: "",
      };
    }
    if (argv[0] === "pr" && argv[1] === "checks") return { status: 0, stdout: JSON.stringify(checks), stderr: "" };
    return { status: 1, stdout: "", stderr: "unexpected call" };
  };
}

await test("1 — a cancelled OPTIONAL check does not refuse a promotion whose required checks passed", () => {
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub() });
  assert.equal(ev.required_checks_total, 3, "the denominator is the required set, not every check");
  assert.equal(ev.required_checks_passing, 3);
  assert.equal(ev.required_checks_failing, 0, "the cancelled Supabase preview is not a required check");
  assert.equal(ev.required_checks_pending, 0);
  assert.equal(D.GATES.required_checks_successful(ev), true);
});

await test("2 — before the fix this was the refusal: counting every check inverts the gate", () => {
  // The old behaviour, reconstructed: no requiredness scoping at all.
  const all = CHECKS_895.filter((r) => r.bucket !== "skipping");
  const legacy = {
    required_checks_total: all.length,
    required_checks_passing: all.filter((r) => r.bucket === "pass").length,
    required_checks_failing: all.filter((r) => r.bucket === "fail").length,
    required_checks_pending: 0,
  };
  assert.equal(legacy.required_checks_total, 6);
  assert.equal(legacy.required_checks_failing, 1);
  assert.equal(D.GATES.required_checks_successful(legacy), false,
    "this is why PR #895 was refused with every required check green");
});

await test("3 — a genuinely failing REQUIRED check still refuses", () => {
  const checks = CHECKS_895.map((r) =>
    r.name === "Trust DB certification" ? { ...r, state: "FAILURE", bucket: "fail" } : r);
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub({ checks }) });
  assert.equal(ev.required_checks_failing, 1);
  assert.equal(D.GATES.required_checks_successful(ev), false);
});

await test("4 — a pending REQUIRED check still refuses", () => {
  const checks = CHECKS_895.map((r) =>
    r.name === "Trust Adoption certification" ? { ...r, state: "IN_PROGRESS", bucket: "pending" } : r);
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub({ checks }) });
  assert.equal(ev.required_checks_pending, 1);
  assert.equal(D.GATES.required_checks_successful(ev), false);
});

await test("5 — a required context that NEVER reported is counted, not quietly dropped", () => {
  // Protection demands three; only two ever produced a row.
  const checks = CHECKS_895.filter((r) => r.name !== "Prebuild gates (route capabilities)");
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub({ checks }) });
  assert.equal(ev.required_checks_total, 3, "the missing context stays in the denominator");
  assert.equal(ev.required_checks_passing, 2);
  assert.deepEqual(ev.required_checks_missing, ["Prebuild gates (route capabilities)"]);
  assert.equal(D.GATES.required_checks_successful(ev), false,
    "two of three present must never read as all required checks green");
});

await test("6 — unreadable branch protection escalates rather than passing", () => {
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub({ protectionStatus: 1 }) });
  assert.equal(ev.required_checks_total, null);
  assert.equal(D.GATES.required_checks_successful(ev), null,
    "not knowing which checks are required is not evidence that the required ones passed");
});

await test("7 — a repository with no required checks does not sail through", () => {
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub({ required: [] }) });
  assert.equal(ev.required_checks_total, 0);
  assert.equal(D.GATES.required_checks_successful(ev), false, "total must be > 0");
});

await test("8 — the certification suite is still judged over every check that ran", () => {
  // Certification jobs are evidence about the candidate whether or not branch
  // protection happens to demand them.
  const ev = H.measureMergePullRequestGates(N, { gh: ghStub() });
  assert.equal(ev.certification_suite_passed, true);
  const failed = CHECKS_895.map((r) =>
    r.name === "Enrollment configuration certification" ? r : r);
  failed.push({ name: "Surfaces / Focus Panel certification", state: "FAILURE", bucket: "fail" });
  const ev2 = H.measureMergePullRequestGates(N, { gh: ghStub({ checks: failed }) });
  assert.equal(ev2.certification_suite_passed, false,
    "an optional certification failure is still evidence against the candidate");
});
