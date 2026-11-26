#!/usr/bin/env node
/**
 * The Gateway runs from the immutable installed toolkit, which is NOT a Git
 * repository — and its runtime Git operations must still work.
 *
 * THE DEFECT: REPO_ROOT was `resolve(HERE, "..", "..", "..", "..")`. That
 * encodes ONE layout — the source checkout, where lib/vacilando sits under
 * scripts/local-dev, so four levels up is the repo root. Installed, the same
 * module lives at ~/.local/share/alloy/toolkit/<sha>/lib/vacilando, where four
 * levels up is ~/.local/share/alloy: a directory that exists and is not a
 * repository. Every Git call anchored to REPO_ROOT then ran against a non-repo,
 * which is the `fatal: not a git repository` the Gateway logged on every poll —
 * inherited straight into the service log because execFileSync forwards a
 * child's stderr unless told otherwise.
 *
 * The invariant: a runtime Git operation runs against an EXPLICIT repository —
 * the configured canonical repo, or the worktree being evaluated — and never
 * depends on the process cwd, or on the module's own directory, being one.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_LOCAL_DEV = join(HERE, "..");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "vac-tk-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir], { stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return dir;
}

/**
 * The INSTALLED layout, reproduced exactly: lib/ sits directly under the
 * versioned toolkit directory, with no scripts/local-dev above it, and the
 * grandparent (`<share>/alloy`) is a real directory that is not a repository.
 * That last detail is the whole defect — the wrong path EXISTED, so nothing
 * failed loudly; Git just answered "not a repository" forever.
 */
function makeInstalledToolkit() {
  const share = mkdtempSync(join(tmpdir(), "vac-tk-share-"));
  const alloy = join(share, "alloy");
  const toolkit = join(alloy, "toolkit", "01841dcb9950");
  mkdirSync(toolkit, { recursive: true });
  cpSync(join(SRC_LOCAL_DEV, "lib"), join(toolkit, "lib"), { recursive: true });
  cpSync(join(SRC_LOCAL_DEV, "alloy-config.example"), join(toolkit, "alloy-config.example"));
  return { share, alloy, toolkit };
}

test("installed toolkit resolves REPO_ROOT to the configured canonical repository", async () => {
  const repo = makeRepo();
  const { share, alloy, toolkit } = makeInstalledToolkit();
  const cfgDir = mkdtempSync(join(tmpdir(), "vac-tk-cfg-"));
  const cfg = join(cfgDir, "config");
  writeFileSync(cfg, `ALLOY_REPO="${repo}"\n`);

  // A child process, because REPO_ROOT is resolved once at module load and the
  // installed layout has to be the real layout of the module being loaded.
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", `
    const m = await import(${JSON.stringify(join(toolkit, "lib", "vacilando", "identity.mjs"))});
    process.stdout.write(JSON.stringify(m.runtimeHost()));
  `], {
    encoding: "utf8",
    // Deliberately a directory that is NOT a Git repository — the Gateway's own
    // working directory. Nothing below may depend on cwd being a repo.
    cwd: toolkit,
    env: { ...process.env, ALLOY_CONFIG_FILE: cfg, HOME: share },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const host = JSON.parse(out);

  // THE REGRESSION: this was ~/.local/share/alloy — existing, and not a repo.
  assert.notEqual(host.worktree_path, alloy, "REPO_ROOT is not the toolkit's grandparent");
  assert.equal(host.worktree_path, repo, "REPO_ROOT is the configured canonical repository");
  assert.equal(host.branch, "main", "and Git can actually answer for it");

  rmSync(share, { recursive: true, force: true });
  rmSync(cfgDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

test("a non-repository path never writes git output to the Gateway's stderr", async () => {
  const { share, toolkit } = makeInstalledToolkit();
  const cfgDir = mkdtempSync(join(tmpdir(), "vac-tk-cfg2-"));
  const cfg = join(cfgDir, "config");
  // No canonical repository anywhere: the worst case, where every candidate
  // path is a real directory that is not a repository.
  writeFileSync(cfg, `ALLOY_REPO="${join(share, "nope")}"\n`);
  mkdirSync(join(share, "nope"), { recursive: true });

  const proc = execFileSync(process.execPath, ["--input-type=module", "-e", `
    const m = await import(${JSON.stringify(join(toolkit, "lib", "vacilando", "identity.mjs"))});
    // Poll it the way the Gateway does. Before the fix each call printed
    // "fatal: not a git repository" into the service log.
    for (let i = 0; i < 5; i += 1) m.runtimeHost();
    process.stdout.write("done");
  `], {
    encoding: "utf8",
    cwd: toolkit,
    env: { ...process.env, ALLOY_CONFIG_FILE: cfg, HOME: share },
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(proc.trim(), "done");

  // execFileSync throws on non-zero exit and captures stderr separately; the
  // assertion that matters is that stderr stayed empty, checked via spawnSync.
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const m = await import(${JSON.stringify(join(toolkit, "lib", "vacilando", "identity.mjs"))});
    for (let i = 0; i < 5; i += 1) m.runtimeHost();
  `], {
    encoding: "utf8",
    cwd: toolkit,
    env: { ...process.env, ALLOY_CONFIG_FILE: cfg, HOME: share },
  });
  assert.equal(r.status, 0, `exited cleanly: ${r.stderr}`);
  assert.ok(
    !/not a git repository/i.test(r.stderr || ""),
    `git stderr leaked into the service log:\n${r.stderr}`,
  );

  rmSync(share, { recursive: true, force: true });
  rmSync(cfgDir, { recursive: true, force: true });
});
