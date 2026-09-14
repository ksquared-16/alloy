/**
 * MOVING APPROVED FILES BETWEEN TWO REGISTERED PROJECTS.
 *
 * S4 has to seed Vacilando's own source into the Vacilando repository, and the
 * only way to do that today is `cp` in a terminal — outside governance, outside
 * evidence, and outside anything that could refuse it. This is the missing
 * product capability, and it is deliberately small: it EXECUTES AN APPROVED
 * PLAN. It does not decide what should move, does not discover ownership, and
 * has no opinion about Vacilando at all.
 *
 * WHAT IT REFUSES TO BE. Not an importer, not an ingestion subsystem, not a
 * file store. There is no database here and nothing is kept: files land in the
 * destination checkout as ordinary working-tree changes, and the lane's normal
 * Git workflow sees them like any other edit.
 *
 * THE PLAN IS A MANIFEST, NEVER A PROMPT. "Move all the Vacilando files" is not
 * executable and cannot become executable here. A plan names each source path
 * and where it lands, and the executor re-derives the plan's fingerprint before
 * touching anything — the same doctrine `apply_reconciliation_plan` already
 * states: a caller-supplied item list must never be executable on the caller's
 * word alone.
 *
 * COPY ONLY, IN V1. The independence sequence freezes Alloy's copy before
 * retiring it, so deletion from the source is a separately governed operation
 * in a later slice. Nothing here removes anything from anywhere.
 *
 * CONSERVATIVE BY DEFAULT. A destination that does not exist is copied; one
 * that is byte-identical is UNCHANGED, which is what makes a replay safe; one
 * that DIFFERS is refused unless the approved plan said, in writing and in
 * advance, that this specific path may be replaced. Silence never overwrites.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { projectScope } from "./repository-registry.mjs";

export const TRANSFER_PLAN_SCHEMA = "vacilando.repository_transfer_plan.v1";
export const TRANSFER_ACTION_KEY = "repository.transfer_files";

/** What a single entry will do. Preview and execution speak the same words. */
export const DISPOSITION = Object.freeze({
  COPY: "copy",
  UNCHANGED: "unchanged",
  REPLACE: "replace",
  REFUSE: "refuse",
});

/** Why an entry was refused. Each is a distinct operator decision, never one blur. */
export const REFUSAL = Object.freeze({
  SOURCE_MISSING: "source_missing",
  SOURCE_ESCAPE: "source_outside_repository",
  DESTINATION_ESCAPE: "destination_outside_repository",
  SYMLINK: "symlink_not_transferable",
  DESTINATION_DIFFERS: "destination_differs_without_replace_authority",
  SOURCE_CHANGED: "source_changed_since_approval",
  UNRESOLVED_SOURCE_PROJECT: "source_project_unresolved",
  UNRESOLVED_DESTINATION_PROJECT: "destination_project_unresolved",
  SAME_PROJECT: "source_and_destination_are_the_same_project",
});

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * The plan's identity, derived from what it will DO.
 *
 * Deliberately over the normalised entries rather than the caller's JSON: two
 * plans that transfer the same paths the same way are the same plan however
 * they were spelled, and a plan whose entries changed is a different plan even
 * if its id did not.
 */
export function planFingerprint(plan = {}) {
  const entries = (plan.entries || []).map((e) => [
    String(e.source || ""), String(e.destination || ""),
    e.replace_approved ? "replace" : "copy", String(e.expected_sha256 || ""),
  ].join(" "));
  return sha256([
    String(plan.source_repository_id || ""),
    String(plan.destination_repository_id || ""),
    String(plan.mode || "copy"),
    ...entries.sort(),
  ].join("")).slice(0, 32);
}

/**
 * Both ends of the transfer, through canonical project authority ONLY.
 *
 * No literal path appears here and none may: `prj_vacilando` resolves
 * `/Users/vacilando/Code/vacilando` because the registry says so, and on a host
 * where it says something else that is the answer. A project that is not
 * registered resolves to a refusal — never to the incumbent, which is the
 * fallback every earlier slice removed and the one a transfer could not survive.
 */
export function resolveTransferEndpoints(plan = {}, { root = undefined } = {}) {
  const opts = root ? { root } : undefined;
  const src = projectScope(plan.source_repository_id, opts);
  const dst = projectScope(plan.destination_repository_id, opts);
  if (!src.known || !src.root) return { ok: false, code: REFUSAL.UNRESOLVED_SOURCE_PROJECT };
  if (!dst.known || !dst.root) return { ok: false, code: REFUSAL.UNRESOLVED_DESTINATION_PROJECT };
  if (src.repository_id === dst.repository_id) return { ok: false, code: REFUSAL.SAME_PROJECT };
  return {
    ok: true,
    source: { repository_id: src.repository_id, project_id: src.project_id, root: src.root },
    destination: { repository_id: dst.repository_id, project_id: dst.project_id, root: dst.root },
  };
}

/**
 * Resolve a relative path beneath a repository root, or refuse.
 *
 * REALPATH IS THE POINT. A prefix test on the textual path passes for
 * `repo/../../etc`, and passes for a symlink inside the repository that points
 * outside it. Containment is checked on the RESOLVED location, with a separator,
 * so a sibling named `vacilando-other` cannot pass as being inside `vacilando`.
 *
 * The nearest existing parent is resolved when the leaf does not exist yet,
 * because a destination that has not been written is the ordinary case.
 */
export function containInRepository(root, relPath) {
  const raw = String(relPath || "");
  if (!raw || isAbsolute(raw)) return { ok: false, code: "absolute_or_empty" };
  if (raw.split("/").includes("..")) return { ok: false, code: "traversal" };
  const target = resolve(root, raw);
  let realRoot;
  try { realRoot = realpathSync(root); } catch { return { ok: false, code: "unresolvable_root" }; }
  let probe = target;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  let realProbe;
  try { realProbe = realpathSync(probe); } catch { return { ok: false, code: "unresolvable" }; }
  const tail = relative(probe, target);
  const real = tail ? join(realProbe, tail) : realProbe;
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return { ok: false, code: "escape" };
  return { ok: true, path: real, relative: relative(realRoot, real) };
}

/** Expand a directory entry into its files, so a plan of one line stays explicit in preview. */
function filesUnder(absolute) {
  const out = [];
  const walk = (abs, r) => {
    for (const name of readdirSync(abs).sort()) {
      const childAbs = join(abs, name);
      const childRel = r ? `${r}/${name}` : name;
      const st = lstatSync(childAbs);
      if (st.isSymbolicLink()) { out.push({ rel: childRel, symlink: true }); continue; }
      if (st.isDirectory()) { walk(childAbs, childRel); continue; }
      out.push({ rel: childRel, size: st.size });
    }
  };
  walk(absolute, "");
  return out;
}

const joinRel = (a, b) => `${a}/${b}`.replace(/\/+/g, "/");

/**
 * What the transfer WOULD do. Reads only.
 *
 * Nothing in this function or anything it calls creates, writes or removes a
 * path — `development-repository-transfer` fails if a write primitive ever
 * appears in its body, because a preview that mutates is not a preview and an
 * operator confirming one has been told a lie.
 */
export function previewTransfer(plan = {}, { root = undefined } = {}) {
  const ends = resolveTransferEndpoints(plan, { root });
  if (!ends.ok) return { ok: false, code: ends.code, entries: [], summary: emptySummary() };

  const entries = [];
  for (const entry of plan.entries || []) {
    const srcContained = containInRepository(ends.source.root, entry.source);
    if (!srcContained.ok) { entries.push(refuse(entry, REFUSAL.SOURCE_ESCAPE, srcContained.code)); continue; }
    if (!existsSync(srcContained.path)) { entries.push(refuse(entry, REFUSAL.SOURCE_MISSING)); continue; }

    const st = lstatSync(resolve(ends.source.root, entry.source));
    if (st.isSymbolicLink()) { entries.push(refuse(entry, REFUSAL.SYMLINK)); continue; }

    const leaves = statSafeIsDirectory(srcContained.path)
      ? filesUnder(srcContained.path).map((f) => ({
        source: joinRel(entry.source, f.rel),
        destination: joinRel(entry.destination, f.rel),
        replace_approved: entry.replace_approved === true,
        expected_sha256: null,
        symlink: f.symlink === true,
      }))
      : [{
        source: entry.source,
        destination: entry.destination,
        replace_approved: entry.replace_approved === true,
        expected_sha256: entry.expected_sha256 || null,
        symlink: false,
      }];

    for (const leaf of leaves) {
      if (leaf.symlink) { entries.push(refuse(leaf, REFUSAL.SYMLINK)); continue; }
      const s = containInRepository(ends.source.root, leaf.source);
      if (!s.ok) { entries.push(refuse(leaf, REFUSAL.SOURCE_ESCAPE, s.code)); continue; }
      const d = containInRepository(ends.destination.root, leaf.destination);
      if (!d.ok) { entries.push(refuse(leaf, REFUSAL.DESTINATION_ESCAPE, d.code)); continue; }
      if (!existsSync(s.path)) { entries.push(refuse(leaf, REFUSAL.SOURCE_MISSING)); continue; }

      const bytes = readFileSync(s.path);
      const digest = sha256(bytes);
      /*
       * A plan approved against one version of a file must not execute against
       * another. Where the plan bound a hash, a changed source is a stale plan
       * and is refused rather than quietly transferring the newer bytes.
       */
      if (leaf.expected_sha256 && leaf.expected_sha256 !== digest) {
        entries.push(refuse(leaf, REFUSAL.SOURCE_CHANGED,
          `approved ${String(leaf.expected_sha256).slice(0, 12)}, source is ${digest.slice(0, 12)}`));
        continue;
      }

      const row = {
        source: leaf.source, destination: leaf.destination,
        bytes: bytes.length, source_sha256: digest, refusal: null, detail: null,
      };
      if (!existsSync(d.path)) { entries.push({ ...row, disposition: DISPOSITION.COPY }); continue; }
      const current = sha256(readFileSync(d.path));
      if (current === digest) { entries.push({ ...row, disposition: DISPOSITION.UNCHANGED }); continue; }
      if (leaf.replace_approved) {
        entries.push({ ...row, disposition: DISPOSITION.REPLACE, destination_sha256: current });
        continue;
      }
      entries.push({
        ...row, disposition: DISPOSITION.REFUSE,
        refusal: REFUSAL.DESTINATION_DIFFERS, destination_sha256: current,
      });
    }
  }
  return {
    ok: true,
    schema: TRANSFER_PLAN_SCHEMA,
    plan_fingerprint: planFingerprint(plan),
    source: ends.source,
    destination: ends.destination,
    entries,
    summary: summarise(entries),
  };
}

function statSafeIsDirectory(path) {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}

function refuse(entry, refusal, detail = null) {
  return {
    source: entry.source ?? null, destination: entry.destination ?? null,
    bytes: 0, source_sha256: null, disposition: DISPOSITION.REFUSE, refusal, detail,
  };
}

const emptySummary = () => ({
  files: 0, bytes: 0, copy: 0, unchanged: 0, replace: 0, refuse: 0, directories: 0,
});

function summarise(entries) {
  const s = emptySummary();
  const dirs = new Set();
  for (const e of entries) {
    s.files += 1;
    s[e.disposition] = (s[e.disposition] || 0) + 1;
    if (e.disposition !== DISPOSITION.REFUSE) s.bytes += e.bytes || 0;
    if (e.destination && e.destination.includes("/")) dirs.add(dirname(e.destination));
  }
  s.directories = dirs.size;
  return s;
}

/** Does this preview contain anything that must stop the whole transfer? */
export function blockingRefusals(preview) {
  return (preview?.entries || []).filter((e) => e.disposition === DISPOSITION.REFUSE);
}

/**
 * Apply a previewed plan. Writes ONLY into the destination repository.
 *
 * The preview is recomputed here rather than trusted from the caller, and the
 * plan's fingerprint must match the one that was approved: a plan whose entries
 * changed after approval is a different plan, and this is where that is caught.
 *
 * ALL OR NOTHING ON REFUSALS. One refused entry stops the transfer instead of
 * copying the rest, because a half-applied seed is the state nobody can reason
 * about — least of all the operator who approved a manifest and got a subset.
 */
export function executeTransfer(plan = {}, { approvedFingerprint = null, root = undefined } = {}) {
  const fingerprint = planFingerprint(plan);
  if (approvedFingerprint && approvedFingerprint !== fingerprint) {
    return { ok: false, code: "plan_fingerprint_mismatch", expected: approvedFingerprint, actual: fingerprint };
  }
  const preview = previewTransfer(plan, { root });
  if (!preview.ok) return { ok: false, code: preview.code };
  const refusals = blockingRefusals(preview);
  if (refusals.length) {
    return { ok: false, code: "transfer_refused", refusals, summary: preview.summary, plan_fingerprint: fingerprint };
  }

  const applied = [];
  for (const e of preview.entries) {
    if (e.disposition === DISPOSITION.UNCHANGED) { applied.push({ ...e, written: false }); continue; }
    const d = containInRepository(preview.destination.root, e.destination);
    const s = containInRepository(preview.source.root, e.source);
    // The preview already proved both; re-proving them here is the belt, and it
    // is what keeps containment true if this loop is ever reached another way.
    if (!d.ok) return { ok: false, code: "transfer_refused", refusals: [refuse(e, REFUSAL.DESTINATION_ESCAPE, d.code)] };
    if (!s.ok) return { ok: false, code: "transfer_refused", refusals: [refuse(e, REFUSAL.SOURCE_ESCAPE, s.code)] };
    mkdirSync(dirname(d.path), { recursive: true });
    copyFileSync(s.path, d.path);
    applied.push({ ...e, written: true });
  }
  return {
    ok: true,
    schema: TRANSFER_PLAN_SCHEMA,
    plan_fingerprint: fingerprint,
    source: preview.source,
    destination: preview.destination,
    applied,
    summary: preview.summary,
    // Stated, not implied: this capability owns file transfer and stops there.
    git_effect: "destination working tree only; no commit, push, merge or promotion",
  };
}
