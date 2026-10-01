#!/usr/bin/env node
/**
 * Build the distributable Alloy Context Package.
 *
 * Generator: `node scripts/build-context-package.mjs` (add `--check` to verify without writing).
 * Do not hand-edit the files this writes.
 *
 * WHY THIS IS GENERATED RATHER THAN HAND-WRITTEN.
 *
 * The GPT source manifest and the Vacilando lane manifest describe the same corpus for two
 * different consumers. Hand-maintaining both is how they drift: a lane gains a DIRECT owner, the
 * GPT tier list does not, and a model is then told to reason about a domain with a document the
 * lane registry says is authority and the tier list never loads. So Tier 2 and Tier 3 are DERIVED
 * from the lane registry, and the only hand-authored inputs are:
 *
 *   docs/context/package/alloy-context-package.json   package identity + Tier 1 foundation
 *   docs/context/package/vacilando-lanes.json         lane ownership (the judgement)
 *   docs/context/package/recertification-triggers.json
 *
 * Outputs:
 *   docs/context/package/gpt-project-sources.json     derived, committed (GPT needs it standalone)
 *   docs/context/package/distribution-manifest.json    derived, committed (path + blob sha manifest)
 *   dist/alloy-context-v1/                             materialized bundle, gitignored
 *
 * PATH MANIFEST, NOT COPIES. The distribution records each included document's path and its CURRENT
 * git blob SHA rather than duplicating its text into the bundle. A detached copy becomes a second
 * authority the moment the source moves, which is the exact failure the benchmark corpus exists to
 * prevent. The blob SHA makes drift detectable instead of invisible.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PKG_DIR = "docs/context/package";
const CHECK = process.argv.includes("--check");

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const pkg = readJson(`${PKG_DIR}/alloy-context-package.json`);
const lanes = readJson(`${PKG_DIR}/vacilando-lanes.json`);
const triggers = readJson(`${PKG_DIR}/recertification-triggers.json`);

/** Git blob SHA for a tracked file, or null when untracked (a new document in the same commit). */
function blobSha(rel) {
    try {
        // stdio pipe: an untracked file is expected here (a document added in this same commit),
        // and git's "does not exist in HEAD" on stderr is noise, not an error.
        return execFileSync("git", ["rev-parse", `HEAD:${rel}`], {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

const VOLATILITY_BY_TIER = { 1: "static-doctrine", 2: "implementation-contract", 3: "reference" };

/** Lanes, shared packages and pending lanes in one list, each tagged with its group. */
function allLanes() {
    return [
        ...lanes.lanes.map((l) => ({ ...l, group: "lane" })),
        ...lanes.shared_context_packages.map((l) => ({ ...l, group: "shared" })),
        ...lanes.pending_lanes.map((l) => ({ ...l, group: "pending" })),
    ];
}

function buildGptSources() {
    const entries = [];
    const seen = new Map();

    const add = (e) => {
        const prior = seen.get(e.path);
        // A document reachable from two lanes keeps the STRONGER tier (lower number) and records
        // both domains, rather than appearing twice with contradictory load conditions.
        if (prior) {
            if (e.tier < prior.tier) Object.assign(prior, e, { domain: prior.domain });
            if (!prior.domain.includes(e.domain)) prior.domain = `${prior.domain}, ${e.domain}`;
            return;
        }
        seen.set(e.path, e);
        entries.push(e);
    };

    for (const f of pkg.foundation) {
        add({
            path: f.path,
            tier: 1,
            domain: "global",
            authority_role: f.authority,
            load_condition: "always",
            volatility: f.volatility,
            load_mode: f.load_mode,
            safe_for_default_context: true,
        });
    }

    for (const lane of allLanes()) {
        // A PENDING_DISABLED lane contributes no default context at all. That is the whole point of
        // the status: its documents must not become Tier 2 just because the lane exists.
        const pending = lane.status === "PENDING_DISABLED";
        for (const p of lane.direct ?? []) {
            add({
                path: p,
                tier: 2,
                domain: lane.id,
                authority_role: "canonical owner",
                load_condition: `lane:${lane.id}`,
                volatility: VOLATILITY_BY_TIER[2],
                load_mode: "EMBED",
                safe_for_default_context: !pending,
            });
        }
        for (const p of [...(lane.reference ?? []), ...(lane.generated ?? [])]) {
            const generated = (lane.generated ?? []).includes(p);
            add({
                path: p,
                tier: 3,
                domain: lane.id,
                authority_role: generated ? "generated contract" : "reference owner",
                load_condition: `on-demand:${lane.id}`,
                volatility: generated ? "generated-spec" : VOLATILITY_BY_TIER[3],
                load_mode: generated ? "FETCH_LIVE" : "REFERENCE_ONLY",
                safe_for_default_context: false,
            });
        }
        for (const p of lane.planned_only ?? []) {
            add({
                path: p,
                tier: 3,
                domain: lane.id,
                authority_role: "PLANNED_ONLY — intent, never implementation",
                load_condition: "explicit-planning-task-only",
                volatility: "planned",
                load_mode: "REFERENCE_ONLY",
                safe_for_default_context: false,
            });
        }
    }

    entries.sort((a, b) => a.tier - b.tier || a.path.localeCompare(b.path));

    return {
        schema: "alloy.gpt-project-sources.v1",
        package: pkg.package_id,
        generated_by: "scripts/build-context-package.mjs",
        note: "Derived from alloy-context-package.json (Tier 1) and vacilando-lanes.json (Tiers 2-3). Do not hand-edit; re-run the generator.",
        tier1_cap: pkg.tier1_cap,
        counts: {
            tier1: entries.filter((e) => e.tier === 1).length,
            tier2: entries.filter((e) => e.tier === 2).length,
            tier3: entries.filter((e) => e.tier === 3).length,
        },
        sources: entries,
        exclude: pkg.excluded_trees,
    };
}

function buildDistributionManifest(gpt) {
    const included = [];
    for (const e of gpt.sources) {
        included.push({ path: e.path, tier: e.tier, blob_sha: blobSha(e.path), exists: existsSync(path.join(ROOT, e.path)) });
    }
    for (const rel of Object.values(pkg.contracts)) {
        included.push({ path: rel, tier: "contract", blob_sha: blobSha(rel), exists: existsSync(path.join(ROOT, rel)) });
    }
    for (const rel of [`${PKG_DIR}/alloy-context-package.json`, `${PKG_DIR}/vacilando-lanes.json`, `${PKG_DIR}/recertification-triggers.json`, `${PKG_DIR}/gpt-project-sources.json`]) {
        included.push({ path: rel, tier: "manifest", blob_sha: blobSha(rel), exists: existsSync(path.join(ROOT, rel)) });
    }
    return {
        schema: "alloy.context-distribution.v1",
        package: pkg.package_id,
        schema_version: pkg.schema_version,
        package_status: pkg.package_status,
        source_staging_sha: pkg.source_staging_sha,
        generated_by: "scripts/build-context-package.mjs",
        strategy: "path-manifest",
        strategy_note: "Paths and blob SHAs, not copies. A detached copy becomes a competing authority the moment the source moves.",
        files: included,
    };
}

const gpt = buildGptSources();
const dist = buildDistributionManifest(gpt);

const outputs = [
    [`${PKG_DIR}/gpt-project-sources.json`, `${JSON.stringify(gpt, null, 2)}\n`],
    [`${PKG_DIR}/distribution-manifest.json`, `${JSON.stringify(dist, null, 2)}\n`],
];

let drift = false;
for (const [rel, body] of outputs) {
    const full = path.join(ROOT, rel);
    const current = existsSync(full) ? readFileSync(full, "utf8") : null;
    if (current === body) continue;
    drift = true;
    if (CHECK) {
        console.error(`drift: ${rel} is not what the generator would write`);
    } else {
        writeFileSync(full, body);
        console.log(`wrote ${rel}`);
    }
}

if (!CHECK) {
    const outDir = path.join(ROOT, "dist/alloy-context-v1");
    mkdirSync(outDir, { recursive: true });
    for (const [rel, body] of outputs) writeFileSync(path.join(outDir, path.basename(rel)), body);
    for (const rel of [`${PKG_DIR}/alloy-context-package.json`, `${PKG_DIR}/vacilando-lanes.json`, `${PKG_DIR}/recertification-triggers.json`]) {
        writeFileSync(path.join(outDir, path.basename(rel)), read(rel));
    }
    for (const rel of Object.values(pkg.contracts)) {
        if (existsSync(path.join(ROOT, rel))) writeFileSync(path.join(outDir, path.basename(rel)), read(rel));
    }
    console.log(`materialized dist/alloy-context-v1/ (${gpt.counts.tier1} tier1, ${gpt.counts.tier2} tier2, ${gpt.counts.tier3} tier3, ${triggers.lane_triggers.length} lane triggers)`);
}

if (CHECK && drift) process.exit(1);
if (CHECK) console.log("context package generated artifacts are current");
