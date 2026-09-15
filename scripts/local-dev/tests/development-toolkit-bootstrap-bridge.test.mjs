#!/usr/bin/env node
/**
 * THE GENERATION-2 DISPATCH PATH, CERTIFIED AT THE DISPATCHER.
 *
 * The toolkit that is RUNNING was built from this repository, so it is the only
 * thing that can perform the FIRST install of a Vacilando-built artifact. Its
 * canonical owner is ksquared-16/vacilando and it is certified there — but a
 * suite that only runs in Vacilando proves the bridge in the one place it will
 * never be used. This proves it here.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE CANONICAL SUITE: it drives the REAL
 * DISPATCH PATH — validateInstallToolkitInputs, then executeToolkitInstall —
 * rather than the helpers beneath it. A guard that is correct in a helper and
 * unreachable from the dispatcher protects nothing, and "the helper refuses" is
 * not the same claim as "the governed action refuses".
 *
 * AND IT PROVES THE ORDER, not just the outcome. An unsanctioned producer must
 * be refused BEFORE any bytes are fetched: a check that runs after the download
 * has already done the thing it was meant to prevent.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");

/*
 * THE END-TO-END SECTION NEEDS ITS ROOTS BEFORE THE MODULES LOAD.
 *
 * `TOOLKIT_ROOT` is a module-level const read from ALLOY_TOOLKIT_ROOT at import
 * time, and the executor's call site deliberately does NOT accept a toolkit
 * root from the request — accepting one would be accepting transport. So the
 * only honest way to drive the real caller without touching this host's live
 * runtime is to point the environment at throwaway directories first.
 */
const E2E_TOOLKIT = mkdtempSync(join(tmpdir(), "bridge-e2e-toolkit-"));
const E2E_RUNTIME = mkdtempSync(join(tmpdir(), "bridge-e2e-runtime-"));
process.env.ALLOY_TOOLKIT_ROOT = E2E_TOOLKIT;
process.env.ALLOY_RUNTIME_ROOT = E2E_RUNTIME;

const A = await import(join(LIB, "toolkit-artifact.mjs"));
const I = await import(join(LIB, "toolkit-artifact-install.mjs"));
const C = await import(join(LIB, "toolkit-convergence.mjs"));
const TH = await import(join(LIB, "trusted-host-actions.mjs"));

let pass = 0, fail = 0;
const test = (n, fn) => {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${n}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${n} :: ${e.message}\n`); }
};

/* A specimen artifact, built here so the bridge needs no network to be certified. */
function specimen(version = "20260915-cccccccccccc") {
  const src = mkdtempSync(join(tmpdir(), "bridge-src-"));
  for (const d of ["lib", "bin"]) mkdirSync(join(src, d), { recursive: true });
  writeFileSync(join(src, "lib", "vacilando-gateway-host.mjs"), "export const h=1;\n");
  writeFileSync(join(src, "lib", "vacilando-server.mjs"), "export const s=1;\n");
  writeFileSync(join(src, "bin", "vac"), "#!/bin/sh\necho vac\n");
  writeFileSync(join(src, "bin", "alloy-toolkit"), "#!/bin/sh\necho tk\n");
  const out = mkdtempSync(join(tmpdir(), "bridge-art-"));
  const tar = join(out, "a.tar.gz");
  execFileSync("tar", ["-czf", tar, "-C", src, "lib", "bin"]);
  const sha = execFileSync("shasum", ["-a", "256", tar], { encoding: "utf8" }).split(" ")[0];
  const sourceSha = "c".repeat(40);
  const manifest = {
    schema: "vacilando.toolkit_artifact.v1", version,
    source_repository: "ksquared-16/vacilando", source_sha: sourceSha,
    source_sha_short: sourceSha.slice(0, 12), artifact: "a.tar.gz", artifact_sha256: sha,
    built_at: new Date().toISOString(),
    ci: { provider: "github-actions", run_id: "777", workflow: "release", repository: "ksquared-16/vacilando", sha: sourceSha },
  };
  const mp = join(out, "a.json");
  writeFileSync(mp, JSON.stringify(manifest, null, 1));
  return { tar, mp, manifest };
}
const S = specimen();

/** A toolkit root holding a generation-1 version, as this host has. */
function gen1Root() {
  const root = mkdtempSync(join(tmpdir(), "bridge-root-"));
  const v = join(root, "bc5820b0b70a");
  mkdirSync(join(v, "lib"), { recursive: true });
  writeFileSync(join(v, "INSTALL-MANIFEST"),
    "source_repo=/Users/x/Alloy\nsource_ref=origin/staging\n"
    + "source_commit=bc5820b0b70adc2ee65934faedc222dbedd4d2f1\nsource_commit_short=bc5820b0b70a\n");
  execFileSync("ln", ["-sfn", v, join(root, "current")]);
  return { root, v };
}

const gen2Inputs = (over = {}) => ({
  artifact: {
    version: S.manifest.version, source_repository: S.manifest.source_repository,
    source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256,
    ci_run_id: "777", ...(over.artifact || {}),
  },
  expected_current_identity: over.expected_current_identity ?? "bc5820b0b70a",
  reason: over.reason ?? "S6 bootstrap bridge certification",
});

/* ── the dispatcher chooses the generation ────────────────────────────────── */

test("1 — GEN1 remains supported through the real validator", () => {
  const r = C.validateInstallToolkitInputs({ expected_staging_sha: "deadbee", reason: "generation one still works" });
  // It reaches generation 1's own CAS rather than being diverted; whatever it
  // answers, it must NOT be a generation-2 error.
  assert.ok(!r.ok || r.normalized?.generation !== A.GENERATION.VACILANDO_ARTIFACT);
  assert.notEqual(r.error, "artifact_identity_incomplete", "a gen1 request must not be judged as gen2");
});

test("2 — GEN2 artifact identity is accepted through the governed contract", () => {
  const r = C.validateInstallToolkitInputs(gen2Inputs());
  assert.ok(r.ok, r.error);
  assert.equal(r.normalized.generation, A.GENERATION.VACILANDO_ARTIFACT);
  assert.equal(r.normalized.artifact.version, S.manifest.version);
  assert.equal(r.normalized.expectedCurrent, "bc5820b0b70a");
});

test("3 — the caller supplies IDENTITY, never transport", () => {
  const r = C.validateInstallToolkitInputs(gen2Inputs());
  const normalized = JSON.stringify(r.normalized);
  for (const k of ["url", "path", "command", "destination", "binPath", "extract"]) {
    assert.equal(normalized.toLowerCase().includes(`"${k.toLowerCase()}"`), false,
      `the normalized request carries transport: ${k}`);
  }
  // And a caller that tries anyway gets nothing through: extra keys are dropped.
  const sneaky = C.validateInstallToolkitInputs({ ...gen2Inputs(), url: "https://evil/x.tar.gz", binPath: "/tmp/x" });
  assert.ok(sneaky.ok);
  assert.equal(JSON.stringify(sneaky.normalized).includes("evil"), false, "a supplied URL reached the normalized request");
});

test("4 — CAS is required: no stated current identity, no install", () => {
  const r = C.validateInstallToolkitInputs({ ...gen2Inputs(), expected_current_identity: "" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "expected_current_identity_missing");
});

test("5 — a malformed content hash is refused by the contract", () => {
  const r = C.validateInstallToolkitInputs(gen2Inputs({ artifact: { artifact_sha256: "not-a-hash" } }));
  assert.equal(r.ok, false);
  assert.equal(r.error, "invalid_artifact_hash");
});

/* ── the dispatcher reaches the generation-2 installer ────────────────────── */

test("6 — executeToolkitInstall REACHES executeArtifactInstall for gen2", () => {
  /*
   * The reachability claim, made by observation rather than by reading. A fake
   * resolver records that it was called; if the dispatcher had taken the
   * generation-1 branch it would have shelled out to alloy-toolkit instead and
   * this would never fire.
   */
  let reached = false;
  const out = C.executeToolkitInstall({
    artifact: { version: "v", source_repository: "ksquared-16/vacilando", source_sha: "d".repeat(40), artifact_sha256: "e".repeat(64), ci_run_id: "1" },
    expectedCurrent: "bc5820b0b70a",
    toolkitRoot: mkdtempSync(join(tmpdir(), "bridge-reach-")),
    resolver: () => { reached = true; return { ok: false, code: "artifact_unavailable", detail: "stub" }; },
  });
  assert.equal(reached, true, "the generation-2 branch was not reached from the dispatcher");
  assert.equal(out.ok, false);
  assert.equal(out.error, "artifact_unavailable");
});

test("7 — an UNSANCTIONED PRODUCER is refused BEFORE any fetch", () => {
  /*
   * The order is the guarantee. A downloader that throws on sight proves the
   * refusal happened first: if the producer check ran after the download, this
   * would surface the downloader's error instead of the refusal.
   */
  let fetched = false;
  const r = C.resolveSanctionedArtifact({
    version: "v", source_repository: "someone/else", ci_run_id: "1",
    downloader: () => { fetched = true; throw new Error("the downloader must never run"); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "producer_not_sanctioned");
  assert.equal(fetched, false, "bytes were fetched from an unsanctioned producer before it was refused");
});

/* ── provenance refusals, through the installer the dispatcher uses ───────── */

const verify = (over = {}) => A.verifyArtifactProvenance({
  artifactPath: S.tar, manifestPath: S.mp,
  expected: {
    version: S.manifest.version, source_repository: S.manifest.source_repository,
    source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256, ...over,
  },
});

test("8 — a content-hash mismatch refuses", () => {
  assert.equal(verify({ artifact_sha256: "f".repeat(64) }).ok, false);
});
test("9 — a source-SHA mismatch refuses", () => {
  assert.equal(verify({ source_sha: "0".repeat(40) }).ok, false);
});
test("10 — a provenance/repository mismatch refuses", () => {
  const r = verify({ source_repository: "ksquared-16/alloy" });
  assert.equal(r.ok, false);
});

/* ── install, rollback, and what must not move ───────────────────────────── */

test("11 — GEN1 -> GEN2 installs, and GEN1 is retained", () => {
  const { root, v } = gen1Root();
  const r = I.installArtifact({
    artifactPath: S.tar, manifestPath: S.mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256 },
    expectedCurrent: "bc5820b0b70a",
  });
  assert.ok(r.ok, r.detail || r.code);
  assert.equal(r.identity.generation, A.GENERATION.VACILANDO_ARTIFACT);
  assert.ok(existsSync(v), "the generation-1 rollback target was deleted");
  assert.equal(r.rollback_available, true);
});

test("12 — GEN2 -> GEN1 rollback is generation-aware", () => {
  const { root, v } = gen1Root();
  I.installArtifact({ artifactPath: S.tar, manifestPath: S.mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256 },
    expectedCurrent: "bc5820b0b70a" });
  const back = I.rollbackTo({ toolkitRoot: root, versionDir: v });
  assert.ok(back.ok, back.detail);
  assert.equal(back.generation, A.GENERATION.ALLOY_GIT);
});

test("13 — a CAS mismatch refuses, and nothing is installed", () => {
  const { root } = gen1Root();
  const before = readdirSync(root).sort();
  const r = I.installArtifact({ artifactPath: S.tar, manifestPath: S.mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256 },
    expectedCurrent: "something-else" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "installed_identity_moved");
  assert.deepEqual(readdirSync(root).sort(), before, "a refused install changed the toolkit root");
});

test("14 — an incomplete artifact never becomes current", () => {
  const dir = mkdtempSync(join(tmpdir(), "bridge-bad-"));
  writeFileSync(join(dir, "x.txt"), "x");
  const tar = join(dir, "bad.tar.gz");
  execFileSync("tar", ["-czf", tar, "-C", dir, "x.txt"]);
  const sha = execFileSync("shasum", ["-a", "256", tar], { encoding: "utf8" }).split(" ")[0];
  const mp = join(dir, "bad.json");
  writeFileSync(mp, JSON.stringify({ ...S.manifest, artifact_sha256: sha }));
  const { root, v } = gen1Root();
  const r = I.installArtifact({ artifactPath: tar, manifestPath: mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: sha },
    expectedCurrent: "bc5820b0b70a" });
  assert.equal(r.ok, false);
  const current = execFileSync("readlink", [join(root, "current")], { encoding: "utf8" }).trim();
  assert.equal(current, v, "a failed install moved current");
});

test("15 — the STATE ROOT is not migrated or replaced by a toolkit install", () => {
  const state = mkdtempSync(join(tmpdir(), "bridge-state-"));
  mkdirSync(join(state, "vacilando", "lanes"), { recursive: true });
  const lanes = join(state, "vacilando", "lanes", "lanes.json");
  writeFileSync(lanes, JSON.stringify({ lanes: { lane_x: { name: "X" } } }));
  const before = readFileSync(lanes, "utf8");
  const { root } = gen1Root();
  I.installArtifact({ artifactPath: S.tar, manifestPath: S.mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256 },
    expectedCurrent: "bc5820b0b70a" });
  assert.equal(readFileSync(lanes, "utf8"), before, "the toolkit install rewrote lane state");
  assert.deepEqual(readdirSync(state).sort(), ["vacilando"]);
});

test("16 — launchd's ACTUAL host entrypoint resolves in the gen2 layout", () => {
  const { root } = gen1Root();
  I.installArtifact({ artifactPath: S.tar, manifestPath: S.mp, toolkitRoot: root,
    expected: { version: S.manifest.version, source_repository: S.manifest.source_repository,
      source_sha: S.manifest.source_sha, artifact_sha256: S.manifest.artifact_sha256 },
    expectedCurrent: "bc5820b0b70a" });
  // The exact path in com.alloy.vacilando-gateway.plist.
  assert.ok(existsSync(join(root, "current", "lib", "vacilando-gateway-host.mjs")),
    "the path launchd actually runs does not exist in a generation-2 install");
  assert.ok(existsSync(join(root, "current", "vac")), "root executables must stay addressable");
});

/* ── 17: the leg the other sixteen could not see ──────────────────────────── */

test("17 — the EXECUTOR's call site forwards the artifact, not just the staging sha", () => {
  /*
   * THE CASE THAT WOULD HAVE CAUGHT THE LIVE NO-OP.
   *
   * Sixteen cases above drive executeToolkitInstall directly, and all sixteen
   * passed while a live generation-2 cutover executed as a generation-1 no-op
   * and reported success. The validator normalized the artifact correctly; the
   * dispatcher branched on it correctly; the EXECUTOR'S CALL SITE forwarded one
   * field and dropped the rest.
   *
   * A test that starts one layer below the caller cannot see a caller that drops
   * its arguments. So this reads the call site itself: whatever else it does, it
   * must hand on `artifact` and `expectedCurrent`, or generation 2 is
   * unreachable from the only path that actually runs it.
   */
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "trusted-host-actions.mjs"), "utf8");
  const at = src.indexOf("out = executeToolkitInstall({");
  assert.ok(at > 0, "the executor no longer calls executeToolkitInstall — this guard needs rewriting");
  const call = src.slice(at, src.indexOf("});", at));
  const code = call.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  assert.match(code, /artifact:/, "the executor drops `artifact`; generation 2 can never run");
  assert.match(code, /expectedCurrent:/, "the executor drops `expectedCurrent`; the CAS precondition is lost");
  assert.match(code, /expectedStagingSha:/, "generation 1 must keep working");
});


/* ── 18-21: THE WHOLE FOUR-LEG PATH, DRIVEN FROM ABOVE THE CALL SITE ─────────
 *
 * Case 17 reads the call site. That is a structural guard, and structural
 * guards go stale: they describe the code rather than exercise it. These four
 * start where PRODUCTION starts — `requestTrustedHostAction` then
 * `executeTrustedHostAction` — and cross all four legs in one go: the registry
 * definition, the governed mode, the dispatch branch, and the executor's call
 * site. Nothing below the caller is stubbed, injected or bypassed.
 *
 * WHAT MAKES EACH OBSERVATION UNAMBIGUOUS. If `artifact` is dropped anywhere on
 * that path, `executeToolkitInstall` takes the generation-1 branch and shells
 * out to `<toolkit>/current/alloy-toolkit install origin/staging`. That binary
 * does not exist in a throwaway root, so the defect surfaces as
 * `install_command_failed` — never as a generation-2 code. Every assertion
 * below therefore fails loudly on the exact regression this slice repairs.
 *
 * THE ONE THING SUBSTITUTED IS THE HOST'S `gh`, NOT THE CODE. The production
 * downloader runs `gh run download` as the host, with the host's credentials.
 * Putting a recording stub first on PATH keeps that call site completely
 * unchanged while removing the network — and it is what proves case 18's
 * ordering claim, because the stub records every invocation.
 */

const E2E = specimen("20260915-e2e000000000");

/** The host's `gh`, replaced on PATH only. The production call site is untouched. */
const GH_DIR = mkdtempSync(join(tmpdir(), "bridge-gh-"));
const GH_LOG = join(GH_DIR, "invocations.log");
writeFileSync(GH_LOG, "");
writeFileSync(join(GH_DIR, "gh"),
  "#!/bin/sh\n"
  + `echo "$@" >> ${GH_LOG}\n`
  + 'dir=""; prev=""\n'
  + 'for a in "$@"; do if [ "$prev" = "--dir" ]; then dir="$a"; fi; prev="$a"; done\n'
  + `[ -n "$dir" ] && cp ${E2E.tar} "$dir/a.tar.gz" && cp ${E2E.mp} "$dir/a.json"\n`
  + "exit 0\n");
chmodSync(join(GH_DIR, "gh"), 0o755);
process.env.PATH = `${GH_DIR}:${process.env.PATH}`;
const ghInvocations = () => readFileSync(GH_LOG, "utf8").split("\n").filter(Boolean).length;

/** A generation-1 layout in the throwaway toolkit root, as this host has. */
const E2E_GEN1 = join(E2E_TOOLKIT, "aaaaaaaaaaaa");
mkdirSync(join(E2E_GEN1, "lib"), { recursive: true });
writeFileSync(join(E2E_GEN1, "INSTALL-MANIFEST"),
  `source_repo=/Users/x/Alloy\nsource_ref=origin/staging\nsource_commit=${"a".repeat(40)}\nsource_commit_short=aaaaaaaaaaaa\n`);
execFileSync("ln", ["-sfn", E2E_GEN1, join(E2E_TOOLKIT, "current")]);

/** The single-use grant a repository-authorized action carries in production. */
const grant = () => ({
  grant_id: `g_${Math.random().toString(16).slice(2, 10)}`,
  status: "ISSUED", action_key: "host.install_toolkit",
  approved_by: "operator", approved_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
});

/** Drive the real production caller, start to finish. */
function governedInstall(inputs, missionId) {
  const req = TH.requestTrustedHostAction({ missionId, actionType: "host.install_toolkit", inputs });
  assert.equal(req.ok, true, `the governed request was refused: ${JSON.stringify(req).slice(0, 200)}`);
  const out = TH.executeTrustedHostAction(req.action.id, { actor: "director", grant: grant() });
  return { req, out };
}

const e2eInputs = (over = {}) => ({
  artifact: {
    version: E2E.manifest.version, source_repository: E2E.manifest.source_repository,
    source_sha: E2E.manifest.source_sha, artifact_sha256: E2E.manifest.artifact_sha256,
    ci_run_id: "777", ...(over.artifact || {}),
  },
  expected_current_identity: over.expected_current_identity ?? "aaaaaaaaaaaa",
  reason: over.reason ?? "S6D end-to-end certification of the governed path",
  ...(over.extra || {}),
});

test("18 — an UNSANCTIONED PRODUCER is refused through the governed action, before any fetch", () => {
  const before = ghInvocations();
  const { out } = governedInstall(
    e2eInputs({ artifact: { source_repository: "someone/else" }, extra: {} }), "msn_e2e_unsanctioned");
  assert.equal(out.ok, false);
  assert.equal(out.error, "producer_not_sanctioned",
    "this code exists only past the generation-2 branch; anything else means `artifact` was dropped on the way");
  assert.equal(ghInvocations(), before, "the host fetched bytes from an unsanctioned producer");
  assert.equal(out.action.state, "failed");
  assert.equal(execFileSync("readlink", [join(E2E_TOOLKIT, "current")], { encoding: "utf8" }).trim(), E2E_GEN1,
    "a refused install moved current");
});

test("19 — expectedCurrent REACHES the installer: a CAS mismatch refuses and nothing moves", () => {
  /*
   * THE CASE THAT CANNOT PASS IF `expectedCurrent` IS DROPPED. With it, the
   * installer compares the stated identity against what is installed and
   * refuses. Without it the precondition is simply absent — and the install
   * SUCCEEDS, silently landing on a host somebody else already moved. So a
   * refusal here is the evidence; a success is the regression.
   */
  const before = readdirSync(E2E_TOOLKIT).sort();
  const { out } = governedInstall(
    e2eInputs({ expected_current_identity: "somebody-elses-identity" }), "msn_e2e_cas");
  assert.equal(out.ok, false, "the CAS precondition never reached the installer");
  assert.equal(out.error, "installed_identity_moved");
  assert.deepEqual(readdirSync(E2E_TOOLKIT).sort(), before, "a refused install changed the toolkit root");
  assert.equal(execFileSync("readlink", [join(E2E_TOOLKIT, "current")], { encoding: "utf8" }).trim(), E2E_GEN1);
});

test("20 — the governed action carries NO transport, whatever the caller sends", () => {
  /*
   * Requested, deliberately not executed. What is being certified is what the
   * governed request STORES — the object the executor reads — so executing it
   * would prove nothing extra and would move `current` out from under case 21.
   */
  const req = TH.requestTrustedHostAction({
    missionId: "msn_e2e_transport", actionType: "host.install_toolkit",
    inputs: e2eInputs({
      extra: { url: "https://evil.example/x.tar.gz", binPath: "/tmp/evil", toolkitRoot: "/tmp/evil-root", downloader: "curl" },
    }),
  });
  assert.equal(req.ok, true, `the governed request was refused: ${JSON.stringify(req).slice(0, 200)}`);
  const stored = JSON.stringify(req.action.inputs).toLowerCase();
  for (const k of ["url", "binpath", "toolkitroot", "downloader", "evil"]) {
    assert.equal(stored.includes(k), false, `the stored governed request carries transport: ${k}`);
  }
});

test("21 — GENERATION 2 ACTUALLY INSTALLS through the production caller", () => {
  /*
   * The live no-op, inverted into a passing observation. This is the same
   * request shape that reported `already_converged` against an untouched
   * generation-1 runtime; here it must MOVE `current` onto the artifact and say
   * so in the generation-2 vocabulary.
   *
   * It runs last because it is the only case that mutates the throwaway root.
   */
  const { out } = governedInstall(e2eInputs(), "msn_e2e_install");
  assert.equal(out.ok, true, `the generation-2 install did not complete: ${JSON.stringify(out).slice(0, 300)}`);
  assert.ok(ghInvocations() > 0, "the sanctioned artifact was never fetched");

  const current = execFileSync("readlink", [join(E2E_TOOLKIT, "current")], { encoding: "utf8" }).trim();
  assert.notEqual(current, E2E_GEN1, "current still points at generation 1 — the install was a no-op");

  const identity = A.installedIdentity(join(E2E_TOOLKIT, "current"));
  assert.equal(identity.generation, A.GENERATION.VACILANDO_ARTIFACT);
  assert.equal(identity.version, E2E.manifest.version);
  assert.equal(identity.source_repository, "ksquared-16/vacilando");

  assert.ok(existsSync(E2E_GEN1), "the generation-1 rollback target was deleted");
  assert.ok(existsSync(join(E2E_TOOLKIT, "current", "lib", "vacilando-gateway-host.mjs")),
    "the path launchd actually runs is missing from the installed runtime");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);

