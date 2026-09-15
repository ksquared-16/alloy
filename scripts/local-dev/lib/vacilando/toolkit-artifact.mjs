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
 * WHAT MAKES A TOOLKIT ARTIFACT TRUSTWORTHY — GENERATION 2.
 *
 * GENERATION 1 answered "is this toolkit legitimate?" with: the ref resolves in
 * the canonical ALLOY repository, and its SHA is the one Alloy promoted to
 * staging. That was exactly right while Alloy was where Vacilando's runtime came
 * from. It is the last thing tying Vacilando's runtime to Alloy's release train.
 *
 * GENERATION 2 answers the same question with ARTIFACT IDENTITY: a manifest
 * naming a sanctioned producer, a source commit, a CI run, and a content hash
 * that the bytes actually have.
 *
 * THE RULE THAT MAKES THIS SAFE, and it is the whole design:
 *
 *   A MANIFEST INSIDE AN ARCHIVE IS A CLAIM, NOT EVIDENCE.
 *
 * Anything that can be edited by whoever produced the archive proves only that
 * they produced it. So every identity field is compared against an EXPECTED
 * identity that arrived through governed authority, and the artifact is accepted
 * only where the two agree. The manifest's job is to be checkable, not to be
 * believed.
 *
 * WHAT THIS DELIBERATELY IS NOT. There is no `install(url)` here. A capability
 * that installs arbitrary bytes from an arbitrary place is a different and much
 * larger capability wearing a narrow name — the same argument Generation 1 used
 * to refuse `ref` as an input, and it is just as true of `url`.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

/** The layouts this installer knows how to lay down. */
export const ARTIFACT_FORMATS = Object.freeze(["vacilando.toolkit_artifact.v1"]);

/** Generations, named so nothing has to guess which it is looking at. */
export const GENERATION = Object.freeze({ ALLOY_GIT: "gen1.alloy_git", VACILANDO_ARTIFACT: "gen2.vacilando_artifact" });

/**
 * Producers whose artifacts may become a runtime.
 *
 * Deliberately a list and not a flag: "is this a sanctioned producer" must be a
 * question with a small, readable answer, and adding one must look like adding
 * one. The registry supplies more at run time; this is the floor.
 */
export const SANCTIONED_PRODUCERS = Object.freeze(["ksquared-16/vacilando"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const norm = (v) => String(v || "").trim().toLowerCase().replace(/\.git$/, "");

/**
 * Read the manifest that travels WITH an artifact.
 * Returns the claim. Believing it is a separate act, below.
 */
export function readArtifactManifest(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) {
    return { ok: false, code: "manifest_missing", detail: `no manifest at ${manifestPath}` };
  }
  let raw;
  try { raw = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch (e) { return { ok: false, code: "manifest_unreadable", detail: String(e.message) }; }
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "manifest_unreadable", detail: "manifest is not an object" };
  }
  return { ok: true, manifest: raw };
}

/**
 * THE PROVENANCE LAW.
 *
 * `expected` comes from governed authority — the approved action's inputs — and
 * `manifestPath`/`artifactPath` are what is actually on disk. Every field is
 * compared; nothing is inferred from the archive alone.
 *
 * Returns `{ ok: true, identity }` or a refusal naming the field that disagreed,
 * because a refusal that does not say which value was wrong produces a retry
 * loop rather than a fix.
 */
export function verifyArtifactProvenance({
  artifactPath,
  manifestPath,
  expected = {},
  sanctionedProducers = SANCTIONED_PRODUCERS,
} = {}) {
  const need = (field) => ({ ok: false, code: "expected_identity_incomplete", detail: `governed authority supplied no ${field}` });
  if (!expected.artifact_sha256) return need("artifact_sha256");
  if (!expected.source_repository) return need("source_repository");
  if (!expected.source_sha) return need("source_sha");
  if (!expected.version) return need("version");

  if (!artifactPath || !existsSync(artifactPath)) {
    return { ok: false, code: "artifact_missing", detail: `no artifact at ${artifactPath}` };
  }
  const read = readArtifactManifest(manifestPath);
  if (!read.ok) return read;
  const m = read.manifest;

  /* 7. The format decides the layout, so an unknown one is refused before use. */
  if (!ARTIFACT_FORMATS.includes(String(m.schema || ""))) {
    return { ok: false, code: "unsupported_artifact_format", detail: `format ${m.schema || "(none)"} is not installable` };
  }

  /* 8. Only a sanctioned producer's artifact may become a runtime. */
  if (!sanctionedProducers.map(norm).includes(norm(m.source_repository))) {
    return {
      ok: false,
      code: "producer_not_sanctioned",
      detail: `${m.source_repository || "(none)"} is not a sanctioned artifact producer`,
      sanctioned: [...sanctionedProducers],
    };
  }

  /* 2-4. The manifest must say the same thing governance approved. */
  const mismatches = [];
  if (norm(m.source_repository) !== norm(expected.source_repository)) mismatches.push("source_repository");
  if (norm(m.source_sha) !== norm(expected.source_sha)) mismatches.push("source_sha");
  if (norm(m.version) !== norm(expected.version)) mismatches.push("version");
  if (norm(m.artifact_sha256) !== norm(expected.artifact_sha256)) mismatches.push("artifact_sha256");
  if (mismatches.length) {
    return {
      ok: false,
      code: "manifest_identity_mismatch",
      detail: `the artifact claims a different ${mismatches.join(", ")} than governance approved`,
      fields: mismatches,
    };
  }

  /* CI provenance must be present and name a run; a build nobody can find is not provenance. */
  const ci = m.ci || {};
  if (!ci.run_id || !ci.workflow || !norm(ci.repository)) {
    return { ok: false, code: "ci_provenance_missing", detail: "manifest names no CI run, workflow and repository" };
  }
  if (norm(ci.repository) !== norm(m.source_repository)) {
    return { ok: false, code: "ci_provenance_foreign", detail: `built by ${ci.repository}, claims source ${m.source_repository}` };
  }
  /* 6. The CI SHA and the archived source SHA must be one commit. */
  if (ci.sha && norm(ci.sha) !== norm(m.source_sha)) {
    return { ok: false, code: "ci_source_disagreement", detail: `CI built ${ci.sha}, manifest claims ${m.source_sha}` };
  }

  /* 5. LAST AND DECISIVE: the bytes must hash to what everyone agreed. */
  const actual = sha256(readFileSync(artifactPath));
  if (actual !== norm(expected.artifact_sha256)) {
    return {
      ok: false,
      code: "artifact_hash_mismatch",
      detail: "the artifact on disk is not the artifact that was approved",
      expected: expected.artifact_sha256,
      actual,
    };
  }

  return {
    ok: true,
    identity: Object.freeze({
      generation: GENERATION.VACILANDO_ARTIFACT,
      format: m.schema,
      version: m.version,
      source_repository: m.source_repository,
      source_sha: m.source_sha,
      source_sha_short: String(m.source_sha).slice(0, 12),
      artifact_sha256: actual,
      artifact_bytes: statSync(artifactPath).size,
      ci_run_id: String(ci.run_id),
      ci_workflow: ci.workflow,
      built_at: m.built_at || null,
    }),
  };
}

/**
 * The identity of whatever is installed at a toolkit version directory.
 *
 * BOTH GENERATIONS ANSWER. A Generation 1 install left an INSTALL-MANIFEST
 * naming an Alloy commit; Generation 2 leaves one naming an artifact. Rollback
 * has to understand both, so this reads both rather than assuming the newer one.
 */
export function installedIdentity(versionDir) {
  const file = `${versionDir}/INSTALL-MANIFEST`;
  if (!existsSync(file)) return { generation: null, detail: "no INSTALL-MANIFEST" };
  const kv = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (kv.artifact_version) {
    return {
      generation: GENERATION.VACILANDO_ARTIFACT,
      version: kv.artifact_version,
      source_repository: kv.source_repository || null,
      source_sha: kv.source_commit || null,
      artifact_sha256: kv.artifact_sha256 || null,
      ci_run_id: kv.ci_run_id || null,
    };
  }
  if (kv.source_commit) {
    return {
      generation: GENERATION.ALLOY_GIT,
      version: kv.source_commit_short || String(kv.source_commit).slice(0, 12),
      source_repository: kv.source_repo || null,
      source_sha: kv.source_commit,
      source_ref: kv.source_ref || null,
    };
  }
  return { generation: null, detail: "INSTALL-MANIFEST names neither generation" };
}

/**
 * COMPARE-AND-SET, across generations.
 *
 * Generation 1 compared an Alloy staging SHA. That question is meaningless for
 * an artifact, so the comparison is on INSTALLED IDENTITY: the state governance
 * approved against the state on disk right now.
 *
 * Installing onto a different state than the one approved is how a host ends up
 * running something nobody chose — the same reasoning Generation 1 gave for its
 * own CAS, carried across rather than dropped.
 */
export function compareAndSet({ currentIdentity, expectedCurrent, target } = {}) {
  if (!target || !target.version) {
    return { ok: false, code: "target_identity_missing", detail: "no target artifact identity" };
  }
  if (expectedCurrent === undefined || expectedCurrent === null) {
    return { ok: false, code: "expected_current_missing", detail: "state what is installed now, or the decision cannot be bound to it" };
  }
  const now = currentIdentity?.version || null;
  const want = typeof expectedCurrent === "string" ? expectedCurrent : expectedCurrent.version;
  if (norm(now) !== norm(want)) {
    return {
      ok: false,
      code: "installed_identity_moved",
      detail: `approval was made against ${want || "(none)"}; ${now || "(none)"} is installed now`,
      expected: want,
      actual: now,
    };
  }
  if (norm(now) === norm(target.version)) {
    return { ok: true, already_converged: true, identity: currentIdentity };
  }
  return { ok: true, already_converged: false };
}

/** The git SHA a Generation 1 toolkit was built from, for rollback bookkeeping. */
export function gen1ShaFor(canonicalRepo, ref) {
  try {
    return execFileSync("git", ["-C", canonicalRepo, "rev-parse", ref], { encoding: "utf8" }).trim();
  } catch { return null; }
}
