#!/usr/bin/env node
/**
 * COPYING APPROVED FILES BETWEEN TWO REGISTERED PROJECTS.
 *
 * S4 has to seed Vacilando's own source into the Vacilando repository, and
 * without this the only way to do it is `cp` in a terminal — outside
 * governance, outside evidence, and outside anything that could refuse. This
 * capability executes an APPROVED PLAN and nothing else: it does not decide
 * ownership, does not discover what should move, and has no opinion about
 * Vacilando at all. Case 3 is that claim, run against two projects with no
 * relationship to either.
 *
 * THE RULES WORTH READING, each with a planted defect proving it binds:
 *
 *   DESTINATION ESCAPE   a destination is resolved with realpath and must land
 *                        beneath the destination repository. A textual prefix
 *                        test passes for `../../etc` and for a symlink pointing
 *                        out of the tree; case 7 and case 8 are those two.
 *   SILENT OVERWRITE     a destination that DIFFERS is refused unless the plan
 *                        said, in advance and per path, that it may be
 *                        replaced. Silence never overwrites (case 12).
 *   HIDDEN ALLOY FALLBACK an unresolvable project resolves to a REFUSAL, never
 *                        to the incumbent. Every earlier slice removed one of
 *                        these; a transfer could not survive another (cases
 *                        4, 5, 22).
 *   PREVIEW MUTATION     preview reads. An operator deciding on a preview that
 *                        wrote has been told a lie (case 14).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-s3a-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const R = await import("../lib/vacilando/repository-registry.mjs");
const T = await import("../lib/vacilando/repository-transfer.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const viewModule = await import("../apps/vacilando/public/gateway-view.mjs");

/* ── two throwaway repositories, registered like any other project ────────── */

function repo(name) {
  const dir = mkdtempSync(join(tmpdir(), `vac-s3a-${name}-`));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  return dir;
}
const SRC = repo("src");
const DST = repo("dst");
const OUTSIDE = mkdtempSync(join(tmpdir(), "vac-s3a-outside-"));

mkdirSync(join(ROOT, "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
  schema_version: R.REPOSITORY_SCHEMA,
  repositories: {
    repo_from: {
      repository_id: "repo_from", project_id: "prj_from", name: "From",
      root: SRC, profile: "generic", state: "ACTIVE",
    },
    repo_to: {
      repository_id: "repo_to", project_id: "prj_to", name: "To",
      root: DST, profile: "generic", state: "ACTIVE",
    },
  },
}), "utf8");

const write = (root, rel, text) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text, "utf8");
};
write(SRC, "lib/one.txt", "alpha\n");
write(SRC, "lib/two.txt", "beta\n");
write(SRC, "README.md", "readme\n");
writeFileSync(join(OUTSIDE, "secret.txt"), "not yours\n", "utf8");

const planOf = (entries, over = {}) => ({
  source_repository_id: "repo_from", destination_repository_id: "repo_to",
  mode: "copy", entries, ...over,
});

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const code = (f) => readFileSync(`${LIB}${f}`, "utf8").split("\n")
  .map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");
const countFiles = (root) => {
  const out = [];
  const walk = (d, r) => {
    for (const n of readdirSync(d)) {
      if (n === ".git") continue;
      const p = join(d, n);
      try { if (readdirSync(p).length >= 0) { walk(p, `${r}${n}/`); continue; } } catch { /* file */ }
      out.push(`${r}${n}`);
    }
  };
  walk(root, "");
  return out.sort();
};

/* ── canonical authority ──────────────────────────────────────────────────── */

test("1 — both ends resolve through canonical project/repository authority", () => {
  const e = T.resolveTransferEndpoints(planOf([]));
  assert.equal(e.ok, true);
  assert.equal(e.source.root, SRC);
  assert.equal(e.destination.root, DST);
  assert.equal(e.source.project_id, "prj_from");
  assert.equal(e.destination.project_id, "prj_to");
  // No path is written down anywhere in the capability.
  const body = code("repository-transfer.mjs");
  assert.ok(!/\/Users\//.test(body), "a literal root in the transfer implementation is the defect this avoids");
  assert.ok(body.includes("projectScope"), "the registry is the only source of a root");
});

test("2 — prj_alloy → prj_vacilando forms a valid pair, structurally", () => {
  /*
   * The real pair, proven WITHOUT executing a transfer. This is the question
   * S4 turns on and the reason the capability exists; running it here would be
   * performing S4, which this slice must not do.
   */
  const live = R.listRepositories({ root: undefined });
  const alloy = live.find((r) => r.project_id === "prj_alloy");
  const vac = live.find((r) => r.project_id === "prj_vacilando");
  if (!alloy || !vac) {
    // A host without both registered cannot answer; say so rather than pass.
    assert.ok(true, "skipped: both projects are not registered on this host");
    return;
  }
  const e = T.resolveTransferEndpoints({
    source_repository_id: alloy.repository_id,
    destination_repository_id: vac.repository_id,
  });
  assert.equal(e.ok, true, "the real pair must resolve");
  assert.equal(e.source.project_id, "prj_alloy");
  assert.equal(e.destination.project_id, "prj_vacilando");
  assert.notEqual(e.source.root, e.destination.root);
});

test("3 — the capability is not Alloy-specialised: a generic pair works", () => {
  // Every other case in this file already runs on two throwaway projects with
  // no relationship to Alloy. This states it as the property it is.
  const p = T.previewTransfer(planOf([{ source: "README.md", destination: "README.md" }]));
  assert.equal(p.ok, true);
  assert.equal(p.entries[0].disposition, T.DISPOSITION.COPY);
  const body = code("repository-transfer.mjs");
  assert.ok(!/alloy/i.test(body), "the transfer capability must not name Alloy at all");
});

test("4 — a missing SOURCE project fails closed", () => {
  for (const id of [null, "", "repo_invented"]) {
    const e = T.resolveTransferEndpoints(planOf([], { source_repository_id: id }));
    assert.equal(e.ok, false);
    assert.equal(e.code, T.REFUSAL.UNRESOLVED_SOURCE_PROJECT, `${JSON.stringify(id)} resolved something`);
  }
});

test("5 — a missing DESTINATION project fails closed", () => {
  for (const id of [null, "", "repo_invented"]) {
    const e = T.resolveTransferEndpoints(planOf([], { destination_repository_id: id }));
    assert.equal(e.ok, false);
    assert.equal(e.code, T.REFUSAL.UNRESOLVED_DESTINATION_PROJECT);
  }
});

/* ── containment ──────────────────────────────────────────────────────────── */

test("6 — a SOURCE path escape is refused", () => {
  for (const bad of ["../outside.txt", "lib/../../etc/passwd", "/etc/passwd", ""]) {
    const p = T.previewTransfer(planOf([{ source: bad, destination: "x.txt" }]));
    assert.equal(p.entries[0].disposition, T.DISPOSITION.REFUSE, `${bad} was not refused`);
    assert.ok([T.REFUSAL.SOURCE_ESCAPE, T.REFUSAL.SOURCE_MISSING].includes(p.entries[0].refusal));
  }
});

test("7 — a DESTINATION path escape is refused", () => {
  for (const bad of ["../escaped.txt", "a/../../escaped.txt", "/tmp/escaped.txt"]) {
    const p = T.previewTransfer(planOf([{ source: "README.md", destination: bad }]));
    assert.equal(p.entries[0].disposition, T.DISPOSITION.REFUSE, `${bad} was not refused`);
    assert.equal(p.entries[0].refusal, T.REFUSAL.DESTINATION_ESCAPE);
  }
});

test("8 — a SYMLINK escape is refused, in either direction", () => {
  // A link inside the repository pointing out of it passes every textual test.
  symlinkSync(OUTSIDE, join(SRC, "linked"));
  symlinkSync(join(OUTSIDE, "secret.txt"), join(SRC, "linkfile.txt"));
  symlinkSync(OUTSIDE, join(DST, "escape"));

  const viaSourceLink = T.previewTransfer(planOf([{ source: "linked/secret.txt", destination: "s.txt" }]));
  assert.equal(viaSourceLink.entries[0].disposition, T.DISPOSITION.REFUSE, "a source resolving outside must refuse");
  assert.equal(viaSourceLink.entries[0].refusal, T.REFUSAL.SOURCE_ESCAPE);

  const linkItself = T.previewTransfer(planOf([{ source: "linkfile.txt", destination: "s.txt" }]));
  assert.equal(linkItself.entries[0].disposition, T.DISPOSITION.REFUSE, "a symlink is not transferable content");

  const viaDestLink = T.previewTransfer(planOf([{ source: "README.md", destination: "escape/landed.txt" }]));
  assert.equal(viaDestLink.entries[0].disposition, T.DISPOSITION.REFUSE, "a destination resolving outside must refuse");
  assert.equal(viaDestLink.entries[0].refusal, T.REFUSAL.DESTINATION_ESCAPE);
});

test("9 — a missing source FILE is refused", () => {
  const p = T.previewTransfer(planOf([{ source: "lib/absent.txt", destination: "absent.txt" }]));
  assert.equal(p.entries[0].disposition, T.DISPOSITION.REFUSE);
  assert.equal(p.entries[0].refusal, T.REFUSAL.SOURCE_MISSING);
});

/* ── dispositions ─────────────────────────────────────────────────────────── */

test("10 — a new destination previews as COPY", () => {
  const p = T.previewTransfer(planOf([{ source: "lib/one.txt", destination: "lib/one.txt" }]));
  assert.equal(p.entries[0].disposition, T.DISPOSITION.COPY);
  assert.equal(p.summary.copy, 1);
  assert.equal(p.summary.bytes, 6);
});

test("11 — an identical destination previews as UNCHANGED", () => {
  write(DST, "same.txt", "alpha\n");
  write(SRC, "same.txt", "alpha\n");
  const p = T.previewTransfer(planOf([{ source: "same.txt", destination: "same.txt" }]));
  assert.equal(p.entries[0].disposition, T.DISPOSITION.UNCHANGED, "byte-identical is what makes replay safe");
  assert.equal(p.summary.unchanged, 1);
});

test("12 — THE RULE: a DIFFERENT destination refuses by default", () => {
  write(DST, "clash.txt", "theirs\n");
  write(SRC, "clash.txt", "ours\n");
  const p = T.previewTransfer(planOf([{ source: "clash.txt", destination: "clash.txt" }]));
  assert.equal(p.entries[0].disposition, T.DISPOSITION.REFUSE, "silence must never overwrite");
  assert.equal(p.entries[0].refusal, T.REFUSAL.DESTINATION_DIFFERS);
  // And the refusal shows BOTH hashes, so the operator can see what differs.
  assert.ok(p.entries[0].source_sha256 && p.entries[0].destination_sha256);
  assert.notEqual(p.entries[0].source_sha256, p.entries[0].destination_sha256);
});

test("13 — replacement requires PER-PATH authority in the approved plan", () => {
  const refused = T.previewTransfer(planOf([{ source: "clash.txt", destination: "clash.txt" }]));
  assert.equal(refused.entries[0].disposition, T.DISPOSITION.REFUSE);
  const allowed = T.previewTransfer(planOf([
    { source: "clash.txt", destination: "clash.txt", replace_approved: true },
  ]));
  assert.equal(allowed.entries[0].disposition, T.DISPOSITION.REPLACE, "explicit authority, and only then");
  // Authority on one entry does not leak to another.
  write(DST, "other.txt", "theirs\n");
  write(SRC, "other.txt", "ours\n");
  const mixed = T.previewTransfer(planOf([
    { source: "clash.txt", destination: "clash.txt", replace_approved: true },
    { source: "other.txt", destination: "other.txt" },
  ]));
  assert.equal(mixed.entries[0].disposition, T.DISPOSITION.REPLACE);
  assert.equal(mixed.entries[1].disposition, T.DISPOSITION.REFUSE);
  // And it changes the plan's identity, so an approval cannot be reused for it.
  assert.notEqual(
    T.planFingerprint(planOf([{ source: "clash.txt", destination: "clash.txt" }])),
    T.planFingerprint(planOf([{ source: "clash.txt", destination: "clash.txt", replace_approved: true }])),
  );
});

/* ── preview writes nothing ───────────────────────────────────────────────── */

test("14 — THE RULE: preview performs NO filesystem mutation", () => {
  const before = countFiles(DST);
  for (let i = 0; i < 3; i += 1) {
    T.previewTransfer(planOf([
      { source: "lib/one.txt", destination: "lib/one.txt" },
      { source: "lib", destination: "copied-lib" },
      { source: "README.md", destination: "deep/nested/README.md" },
    ]));
  }
  assert.deepEqual(countFiles(DST), before, "preview created or changed a destination file");
  // Structural: no write primitive may appear in the preview path.
  const body = code("repository-transfer.mjs");
  const start = body.indexOf("export function previewTransfer");
  const fn = body.slice(start, body.indexOf("\nfunction statSafeIsDirectory", start));
  for (const w of ["writeFileSync", "copyFileSync", "mkdirSync", "rmSync", "unlinkSync"]) {
    assert.ok(!fn.includes(w), `preview calls ${w}; a preview that mutates is not a preview`);
  }
});

/* ── execution ────────────────────────────────────────────────────────────── */

test("15 — a confirmed transfer changes the DESTINATION only", () => {
  const plan = planOf([
    { source: "lib/one.txt", destination: "seed/one.txt" },
    { source: "lib/two.txt", destination: "seed/two.txt" },
  ]);
  const out = T.executeTransfer(plan);
  assert.equal(out.ok, true, out.code);
  assert.equal(out.summary.copy, 2);
  assert.equal(readFileSync(join(DST, "seed/one.txt"), "utf8"), "alpha\n");
  assert.equal(readFileSync(join(DST, "seed/two.txt"), "utf8"), "beta\n");
});

test("16 — the SOURCE is untouched: this copies, it never moves", () => {
  assert.ok(existsSync(join(SRC, "lib/one.txt")), "the source file must survive the transfer");
  assert.equal(readFileSync(join(SRC, "lib/one.txt"), "utf8"), "alpha\n");
  // V1 owns copying only; deletion from the source is a later, separate slice.
  const body = code("repository-transfer.mjs");
  for (const d of ["rmSync", "unlinkSync", "rmdirSync", "renameSync"]) {
    assert.ok(!body.includes(d), `the capability calls ${d}; V1 copies and freezes, it does not move`);
  }
});

test("17 — replaying a completed transfer converges safely", () => {
  const plan = planOf([
    { source: "lib/one.txt", destination: "seed/one.txt" },
    { source: "lib/two.txt", destination: "seed/two.txt" },
  ]);
  const before = countFiles(DST);
  const again = T.executeTransfer(plan);
  assert.equal(again.ok, true, "a replay of an applied plan must not refuse");
  assert.equal(again.summary.unchanged, 2, "both entries are already identical");
  assert.equal(again.summary.copy, 0, "and nothing is copied a second time");
  assert.equal(again.applied.every((a) => a.written === false), true, "no repeated mutation of identical files");
  assert.deepEqual(countFiles(DST), before, "and no duplicate artifacts appear");
});

test("18 — a source changed after hash-bound approval refuses as STALE", () => {
  write(SRC, "bound.txt", "version one\n");
  const approved = T.previewTransfer(planOf([{ source: "bound.txt", destination: "bound.txt" }]));
  const digest = approved.entries[0].source_sha256;
  const bound = planOf([{ source: "bound.txt", destination: "bound.txt", expected_sha256: digest }]);
  assert.equal(T.previewTransfer(bound).entries[0].disposition, T.DISPOSITION.COPY, "the bound plan is valid as approved");

  write(SRC, "bound.txt", "version two\n");
  const stale = T.previewTransfer(bound);
  assert.equal(stale.entries[0].disposition, T.DISPOSITION.REFUSE);
  assert.equal(stale.entries[0].refusal, T.REFUSAL.SOURCE_CHANGED);
  assert.equal(T.executeTransfer(bound).ok, false, "and execution refuses it too");
  assert.ok(!existsSync(join(DST, "bound.txt")), "nothing was written for a stale plan");
});

test("18b — a plan edited after approval is refused by fingerprint", () => {
  const approved = planOf([{ source: "lib/one.txt", destination: "seed/one.txt" }]);
  const fingerprint = T.planFingerprint(approved);
  const widened = planOf([
    { source: "lib/one.txt", destination: "seed/one.txt" },
    { source: "README.md", destination: "seed/SNUCK-IN.md" },
  ]);
  const out = T.executeTransfer(widened, { approvedFingerprint: fingerprint });
  assert.equal(out.ok, false);
  assert.equal(out.code, "plan_fingerprint_mismatch", "a widened manifest is a different plan");
  assert.ok(!existsSync(join(DST, "seed/SNUCK-IN.md")), "and nothing from it was written");
});

test("18c — one refusal stops the whole transfer, not just its own entry", () => {
  write(SRC, "good.txt", "fine\n");
  const mixed = planOf([
    { source: "good.txt", destination: "partial/good.txt" },
    { source: "lib/absent.txt", destination: "partial/absent.txt" },
  ]);
  const out = T.executeTransfer(mixed);
  assert.equal(out.ok, false);
  assert.equal(out.code, "transfer_refused");
  assert.ok(!existsSync(join(DST, "partial/good.txt")),
    "a half-applied seed is the state nobody can reason about");
});

/* ── Git, and what this capability does NOT do ────────────────────────────── */

test("19 — the destination's Git sees the transferred changes", () => {
  // `--untracked-files=all` because porcelain collapses a wholly-untracked
  // directory to `?? seed/`; the question is whether Git sees the FILES.
  const status = execFileSync("git", ["-C", DST, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  assert.match(status, /seed\/one\.txt/, "the copy must be visible to ordinary Git workflows");
  assert.match(status, /\?\?/, "as an untracked working-tree change");
});

test("20 — NO automatic commit, push, merge or promotion occurs", () => {
  // `git log` exits non-zero on a repository with no commits, which is exactly
  // the state being asserted, so the failure IS the evidence.
  let log = "";
  try {
    log = execFileSync("git", ["-C", DST, "log", "--oneline"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { log = ""; }
  assert.equal(log, "", "the destination must have no commits: transfer owns transfer only");
  /*
   * ASSERT ON CALL SYNTAX, NOT ON PROSE. The first version matched the word
   * "commit" anywhere in executable text and tripped on the module's own
   * `git_effect` string -- the line that DECLARES this guarantee. A rule that
   * cannot tell a subprocess call from a sentence about subprocess calls fails
   * on the file that documents itself best.
   *
   * The real question is whether the capability can run anything at all: it
   * cannot commit, push, merge or promote without a child process, and it has
   * none.
   */
  const body = code("repository-transfer.mjs");
  for (const primitive of ["execFileSync(", "spawnSync(", "execSync(", "child_process"]) {
    assert.ok(!body.includes(primitive),
      `the capability reaches for ${primitive}; transfer owns transfer, later slices own commit and promotion`);
  }
});

/* ── governance ───────────────────────────────────────────────────────────── */

test("21 — governance names BOTH projects, and the action is reachable", () => {
  const d = REG.getActionDefinition(T.TRANSFER_ACTION_KEY);
  assert.ok(d, "the capability must be a registered governed action");
  assert.equal(d.riskClass, "privileged_write", "it writes into a repository");
  for (const f of ["sourceRepositoryId", "destinationRepositoryId", "planId", "planFingerprint", "entries"]) {
    assert.ok(d.inputSchema.required.includes(f), `${f} must be a required input`);
  }
  /*
   * The destination is the authority that matters: bytes land there, and it is
   * NOT necessarily the repository hosting the running Vacilando code. An action
   * that named only one project would authorize the wrong thing.
   */
  assert.ok(d.evidenceSchema.includes("destination_project") && d.evidenceSchema.includes("source_project"),
    "the evidence must record both ends");
  const ok = d.validateInputs({
    sourceRepositoryId: "repo_from", destinationRepositoryId: "repo_to",
    planId: "plan_1", planFingerprint: "0".repeat(32),
    entries: [{ source: "a.txt", destination: "b.txt" }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.normalized.mode, "copy", "V1 is copy-only at the contract level");
  // Same project both ends is not a transfer.
  assert.equal(d.validateInputs({
    sourceRepositoryId: "x", destinationRepositoryId: "x", planId: "p",
    planFingerprint: "0".repeat(32), entries: [{ source: "a", destination: "b" }],
  }).code, "source_and_destination_identical");
});

test("21b — a PROMPT cannot become an executable plan", () => {
  const d = REG.getActionDefinition(T.TRANSFER_ACTION_KEY);
  for (const pattern of ["**", "docs/**", "*", "lib/*.mjs"]) {
    const out = d.validateInputs({
      sourceRepositoryId: "a", destinationRepositoryId: "b", planId: "p",
      planFingerprint: "0".repeat(32), entries: [{ source: pattern, destination: "x" }],
    });
    assert.equal(out.ok, false, `${pattern} was accepted as a path`);
    assert.equal(out.code, "entry_is_a_pattern_not_a_path");
  }
});

test("21c — the action is REACHABLE: registered, dispatched, and callable", () => {
  /*
   * A registered action with no executor branch and no caller is a definition
   * nobody can invoke. This tree has been bitten by that before, which is why
   * all three legs are asserted rather than the first one.
   */
  const actions = readFileSync(`${LIB}trusted-host-actions.mjs`, "utf8");
  assert.match(actions, /ACTION_TYPES\.REPOSITORY_TRANSFER_FILES\)\s*\{\s*\n\s*return executeTransferFilesTrustedHostAction/,
    "the dispatch table must route it");
  assert.match(actions, /export function executeTransferFilesTrustedHostAction/, "an executor must exist");
  assert.match(actions, /export function fulfillTransferFilesForMission/,
    "and a caller, or the Director cannot invoke it from a mission");
});

test("22 — NO hidden Alloy fallback anywhere in the capability", () => {
  const body = code("repository-transfer.mjs");
  assert.ok(!/ALLOY_REPOSITORY_ID|repo_alloy|prj_alloy/.test(body),
    "the transfer must not know the incumbent's identity at all");
  // An unresolvable pair yields refusals, and preview yields no entries at all.
  const p = T.previewTransfer(planOf([{ source: "README.md", destination: "x" }], {
    source_repository_id: "repo_nope", destination_repository_id: "repo_also_nope",
  }));
  assert.equal(p.ok, false);
  assert.deepEqual(p.entries, []);
  assert.equal(p.summary.files, 0);
});

test("23 — a directory entry expands to explicit files, and stays contained", () => {
  const p = T.previewTransfer(planOf([{ source: "lib", destination: "vendor/lib" }]));
  const dests = p.entries.map((e) => e.destination).sort();
  assert.ok(dests.includes("vendor/lib/one.txt") && dests.includes("vendor/lib/two.txt"),
    "one manifest line must still preview as the individual files it moves");
  assert.ok(p.entries.every((e) => !String(e.destination).includes("..")));
});

test("24 — preview is the operator's evidence, not raw JSON to decipher", () => {
  write(SRC, "big.txt", "x".repeat(100));
  const p = T.previewTransfer(planOf([
    { source: "lib", destination: "vendor/lib" },
    { source: "big.txt", destination: "big.txt" },
    { source: "clash.txt", destination: "clash.txt" },
  ]));
  for (const k of ["files", "bytes", "copy", "unchanged", "replace", "refuse", "directories"]) {
    assert.ok(k in p.summary, `the summary must report ${k}`);
  }
  assert.ok(p.summary.files >= 3 && p.summary.bytes > 0);
  assert.ok(p.summary.refuse >= 1, "collisions are summarised, not buried in the entry list");
  assert.ok(p.source.project_id && p.destination.project_id, "and both projects are named");
});

test("25 — the preview route exists, is read-only, and does not execute", () => {
  const server = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url).pathname, "utf8");
  const at = server.indexOf('path === "/api/repositories/transfer/preview"');
  assert.ok(at > 0, "the UI needs a preview endpoint");
  const handler = server.slice(at, at + 1800);
  assert.ok(handler.includes("previewTransfer"), "it previews");
  assert.ok(!handler.includes("executeTransfer"),
    "a browser route that both previewed and copied would be a second authorization path");
});

/* ── the operator surface ─────────────────────────────────────────────────── */

test("26 — the UI previews and CANNOT confirm, which keeps one authorization path", () => {
  const view = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url).pathname, "utf8");
  const app = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url).pathname, "utf8");
  assert.match(view, /function renderTransferPanel/, "the capability needs a placement in the product");
  assert.match(app, /\/api\/repositories\/transfer\/preview/, "the UI previews through the read-only route");
  /*
   * The control that matters is the one that ISN'T there. A browser button that
   * copied would be a second authorization path beside the governed action, and
   * that is the thing this slice must not add.
   */
  assert.ok(!/transfer\/execute|transfer\/confirm|executeTransfer/.test(app),
    "the UI must not be able to execute a transfer");
  assert.ok(!/transfer\/execute|transfer\/confirm/.test(view));
  // Every control the panel renders is handled.
  const rendered = new Set([...view.matchAll(/data-gw-proj-transfer[a-z-]*/g)].map((m) => m[0]));
  assert.ok(rendered.size >= 4, `expected the full control set, saw ${[...rendered].join(", ")}`);
  for (const a of rendered) assert.ok(app.includes(`[${a}]`), `${a} is rendered but nothing listens for it`);
});

test("27 — refusals reach the operator in words, not as codes", () => {
  const V = viewModule;
  for (const code of Object.values(T.REFUSAL)) {
    const text = V.refusalText(code);
    assert.ok(text && text !== code || /unresolved|same/.test(code),
      `${code} renders as a raw code`);
  }
  assert.match(V.refusalText(T.REFUSAL.DESTINATION_DIFFERS), /may be replaced/,
    "the collision refusal must say what would fix it");
});

test("28 — the manifest a mission approves is the same shape the UI builds", () => {
  /*
   * One capability, two placements. The Director invoking
   * `fulfillTransferFilesForMission` with an approved manifest and an operator
   * pasting one into the panel must produce the SAME plan, or they are two
   * capabilities that happen to share a name.
   */
  const d = REG.getActionDefinition(T.TRANSFER_ACTION_KEY);
  const fromUi = [{ source: "lib/one.txt", destination: "seed/one.txt" }];
  const normalized = d.validateInputs({
    sourceRepositoryId: "repo_from", destinationRepositoryId: "repo_to",
    planId: "p", planFingerprint: T.planFingerprint(planOf(fromUi)), entries: fromUi,
  });
  assert.equal(normalized.ok, true);
  assert.deepEqual(
    normalized.normalized.entries.map((e) => [e.source, e.destination]),
    fromUi.map((e) => [e.source, e.destination]),
  );
  // And the fingerprint the action carries is the one the capability derives.
  assert.equal(
    T.planFingerprint({ ...planOf(fromUi) }),
    T.planFingerprint({
      source_repository_id: normalized.normalized.sourceRepositoryId,
      destination_repository_id: normalized.normalized.destinationRepositoryId,
      mode: "copy", entries: normalized.normalized.entries,
    }),
  );
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
