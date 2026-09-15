/**
 * BOOTSTRAP COPY — THE BRIDGE, NOT A FORK.
 *
 * The canonical owner of this file is ksquared-16/vacilando. It exists here for
 * exactly one job: the toolkit that is RUNNING was built from this repository,
 * so it is the only thing that can perform the first install of a
 * Vacilando-built artifact. Once the host is running a generation-2 toolkit,
 * this copy is inert and S6/S7 delete it.
 *
 * Do not edit this copy. Change it in Vacilando and ship a new artifact.
 *
 * INSTALL A GENERATION 2 TOOLKIT — THE VACILANDO CI ARTIFACT.
 *
 * Generation 1 installed by `git archive`-ing a commit out of the canonical
 * Alloy repository. This installs a verified artifact instead, and the ORDER of
 * what it does is the safety design:
 *
 *   verify provenance -> compare-and-set -> extract -> alias -> record -> activate
 *
 * Nothing is activated before it is verified, and the previous version is never
 * removed, so the generation being replaced stays a valid rollback target. That
 * matters more here than in any earlier install: this is the first time the
 * runtime stops coming from Alloy, and the way back has to exist before the way
 * forward is taken.
 *
 * THE COMPATIBILITY LAYOUT, and why it is this small. The canonical artifact
 * keeps executables in `bin/` and modules flat in `lib/`. Measured against the
 * live host, what actually addresses the toolkit from outside is: the launchd
 * service, which runs `current/lib/vacilando-gateway-host.mjs` — ALREADY
 * canonical — and a handful of root-level executables. So generation 2 lays down
 * canonical bytes and adds ROOT SYMLINKS to `bin/`, nothing else. No copied
 * implementation, no second source of truth, and `rm` on the links is the whole
 * removal when S7 retires them.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { GENERATION, compareAndSet, installedIdentity, verifyArtifactProvenance } from "./toolkit-artifact.mjs";

/** Files that must exist in an extracted generation-2 toolkit for it to be one. */
const REQUIRED = ["lib/vacilando-gateway-host.mjs", "lib/vacilando-server.mjs", "bin/vac", "bin/alloy-toolkit"];

/**
 * Lay the artifact down and make it addressable the way the host addresses a
 * toolkit. Returns the version directory.
 */
export function extractArtifact({ artifactPath, destDir, tar = defaultTar }) {
  mkdirSync(destDir, { recursive: true });
  tar(artifactPath, destDir);
  const missing = REQUIRED.filter((p) => !existsSync(join(destDir, p)));
  if (missing.length) {
    return { ok: false, code: "artifact_incomplete", detail: `extracted tree is missing ${missing.join(", ")}` };
  }
  return { ok: true, destDir };
}

function defaultTar(artifactPath, destDir) {
  execFileSync("tar", ["-xzf", artifactPath, "-C", destDir], { stdio: ["ignore", "ignore", "pipe"] });
}

/**
 * Root aliases for the executables in bin/.
 *
 * Deterministic: exactly the files in bin/, nothing inferred, nothing searched
 * for. Relative links, so the version directory stays relocatable and a copy of
 * it keeps working.
 */
export function writeCompatibilityAliases(versionDir) {
  const binDir = join(versionDir, "bin");
  if (!existsSync(binDir)) return { ok: false, code: "no_bin_dir", detail: "artifact has no bin/" };
  const made = [];
  for (const name of readdirSync(binDir).sort()) {
    const target = join(binDir, name);
    if (!statSync(target).isFile()) continue;
    const link = join(versionDir, name);
    if (existsSync(link)) continue;                 // never shadow canonical content
    try {
      symlinkSync(join("bin", name), link);
      made.push(name);
    } catch { /* a filesystem without symlinks gets no aliases, and says so below */ }
  }
  return { ok: made.length > 0, aliases: made };
}

/** Executability does not always survive extraction. */
export function restoreExecutableBits(versionDir) {
  for (const dir of [join(versionDir, "bin"), join(versionDir, "hooks"), join(versionDir, "hooks", "git")]) {
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      try { if (statSync(p).isFile()) chmodSync(p, 0o755); } catch { /* best effort */ }
    }
  }
}

/** What this version is, written where both generations look for it. */
export function writeInstallManifest(versionDir, identity, { installedAt = new Date().toISOString() } = {}) {
  const lines = [
    `generation=${identity.generation}`,
    `artifact_version=${identity.version}`,
    `artifact_sha256=${identity.artifact_sha256}`,
    `source_repository=${identity.source_repository}`,
    `source_commit=${identity.source_sha}`,
    `source_commit_short=${identity.source_sha_short}`,
    `ci_run_id=${identity.ci_run_id}`,
    `ci_workflow=${identity.ci_workflow}`,
    `artifact_format=${identity.format}`,
    `installed_at=${installedAt}`,
    `installed_by=alloy-toolkit install-artifact`,
  ];
  writeFileSync(join(versionDir, "INSTALL-MANIFEST"), `${lines.join("\n")}\n`, "utf8");
}

/**
 * Flip `current`.
 *
 * `ln -sfn` replaces the LINK. A staged temp link plus `mv` follows an existing
 * symlink-to-directory and drops the temp inside the old version instead — an
 * install that reports success while the toolkit stays where it was. Generation
 * 1 learned that; generation 2 does not get to relearn it.
 */
export function activate(toolkitRoot, versionDir) {
  const link = join(toolkitRoot, "current");
  const previous = existsSync(link) ? readlinkSafe(link) : null;
  execFileSync("ln", ["-sfn", versionDir, link]);
  return { ok: readlinkSafe(link) === versionDir, previous, now: readlinkSafe(link) };
}

function readlinkSafe(p) {
  try { return execFileSync("readlink", [p], { encoding: "utf8" }).trim(); } catch { return null; }
}

/**
 * THE WHOLE INSTALL, in the order that keeps it safe.
 *
 * `expected` is the identity governance approved. `expectedCurrent` is the state
 * it approved AGAINST. Both are required: the first says what to install, the
 * second says what it is allowed to replace.
 */
export function installArtifact({
  artifactPath, manifestPath, toolkitRoot,
  expected, expectedCurrent,
  sanctionedProducers, tar = defaultTar, activateNow = true,
} = {}) {
  const provenance = verifyArtifactProvenance({ artifactPath, manifestPath, expected, sanctionedProducers });
  if (!provenance.ok) return provenance;
  const identity = provenance.identity;

  const currentLink = join(toolkitRoot, "current");
  const currentDir = existsSync(currentLink) ? readlinkSafe(currentLink) : null;
  const currentIdentity = currentDir ? installedIdentity(currentDir) : { generation: null };

  const cas = compareAndSet({ currentIdentity, expectedCurrent, target: identity });
  if (!cas.ok) return cas;
  if (cas.already_converged) {
    return { ok: true, already_converged: true, identity, previous: currentIdentity };
  }

  const versionDir = join(toolkitRoot, identity.source_sha_short);
  if (existsSync(versionDir)) rmSync(versionDir, { recursive: true, force: true });
  const ex = extractArtifact({ artifactPath, destDir: versionDir, tar });
  if (!ex.ok) { rmSync(versionDir, { recursive: true, force: true }); return ex; }

  restoreExecutableBits(versionDir);
  const aliases = writeCompatibilityAliases(versionDir);
  if (!aliases.ok) {
    rmSync(versionDir, { recursive: true, force: true });
    return { ok: false, code: "compatibility_aliases_failed", detail: "generation 2 needs root aliases for bin/ and none could be made" };
  }
  writeInstallManifest(versionDir, identity);

  if (!activateNow) {
    return { ok: true, staged: true, identity, versionDir, aliases: aliases.aliases, previous: currentIdentity };
  }
  const flip = activate(toolkitRoot, versionDir);
  if (!flip.ok) return { ok: false, code: "activation_failed", detail: `current points at ${flip.now}` };

  /* The previous version is RETAINED, deliberately: it is the rollback target. */
  return {
    ok: true,
    identity,
    versionDir,
    aliases: aliases.aliases,
    previous: currentIdentity,
    previous_dir: currentDir,
    rollback_available: Boolean(currentDir && existsSync(currentDir)),
  };
}

/**
 * Roll back to a specific version directory, of EITHER generation.
 *
 * Generation-aware by reading the target's own manifest rather than assuming
 * what it is. A rollback that only understands the generation it is rolling back
 * FROM cannot restore the one it replaced, which is the only rollback that
 * matters during a cutover.
 */
export function rollbackTo({ toolkitRoot, versionDir }) {
  if (!existsSync(versionDir)) {
    return { ok: false, code: "rollback_target_missing", detail: `${versionDir} is not installed` };
  }
  const identity = installedIdentity(versionDir);
  if (!identity.generation) {
    return { ok: false, code: "rollback_target_unidentified", detail: "target has no readable INSTALL-MANIFEST" };
  }
  const flip = activate(toolkitRoot, versionDir);
  if (!flip.ok) return { ok: false, code: "activation_failed", detail: `current points at ${flip.now}` };
  return { ok: true, identity, generation: identity.generation, restored: versionDir };
}

/** Every installed version and what generation it is. For `list` and rollback choice. */
export function installedVersions(toolkitRoot) {
  if (!existsSync(toolkitRoot)) return [];
  return readdirSync(toolkitRoot)
    .filter((n) => n !== "current")
    .map((n) => join(toolkitRoot, n))
    .filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } })
    .map((p) => ({ dir: p, name: basename(p), ...installedIdentity(p) }));
}
