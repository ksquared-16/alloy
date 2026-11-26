#!/usr/bin/env node
/**
 * ALLOY RUNTIME CERTIFICATION — the one entry point.
 *
 *   npm run cert:runtime -- --env local-production
 *   npm run cert:runtime -- --env deployed-staging          # final acceptance
 *   npm run cert:runtime -- --env deployed-staging --subset focus-panel,operations
 *
 * Runtime performance is a platform contract, not a past project. This orchestrates the existing
 * measurement primitives (./measure.mjs) against the canonical ownership map (./ownership.mjs) and
 * the certified baseline (./baseline.json). It does not define a second way to measure anything.
 *
 * ── TWO KINDS OF RESULT, AND THEY ARE NOT THE SAME ──
 *
 * HARD INVARIANTS are laws: one Focus Panel subtree, one authoritative read per subject intent, one
 * roster request per new (site,date), zero document loads on in-app transitions. A violation fails
 * certification at any latency.
 *
 * PERFORMANCE BANDS are derived from a measured distribution on real hardware over a real network.
 * A breach is a signal to investigate. Do not convert a band into a law by tightening it until it
 * fails on a slow morning — that trains people to ignore the harness.
 *
 * ── ENVIRONMENTS ARE NEVER POOLED ──
 *
 * Every result records its environment. `local-production` is for deterministic pre-merge work;
 * `deployed-staging` is the only environment that can grant final acceptance. A number measured on
 * localhost has never been evidence about the product — this programme retired a "1343 ms
 * /organization regression" that was Turbopack compiling on demand.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(readFileSync(join(HERE, "baseline.json"), "utf8"));

const ENVIRONMENTS = {
    "deployed-staging": {
        baseUrl: "https://staging.workwithalloy.com",
        storageState: `${process.env.HOME}/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json`,
        grantsFinalAcceptance: true,
    },
    "local-production": {
        baseUrl: process.env.ALLOY_LOCAL_URL ?? "http://localhost:3011",
        storageState: process.env.ALLOY_LOCAL_STORAGE_STATE ?? null,
        grantsFinalAcceptance: false,
    },
};

export const SUBSETS = ["work-unit", "focus-panel", "waitlist", "operations", "workspace", "organization"];

/**
 * WHO MEASURES EACH SUBSET.
 *
 * A subset name in `SUBSETS` is a promise that requesting it certifies something. `waitlist` broke
 * that promise: it was routed here by TRIGGER_MATRIX (`lib/orchestration/placement/**` →
 * ["waitlist","work-unit"]) but `runCertification` has no waitlist branch, so
 * `npm run cert:runtime -- --subset waitlist` opened no page, measured nothing, found zero
 * failures and printed PASS with exit 0. That is the precise failure this file's own probe-
 * integrity gate exists to prevent, and the gate could not see it: every check is written as
 * `if (results.<key>)`, so a subset that produces NO results object is checked by nothing.
 *
 * The fix is not to measure waitlist here. Deployed waitlist mutation truth already has an owner —
 * duplicating it would create the second producer the doctrine forbids. The fix is to say so in
 * data, and to refuse to call a delegated subset "passed" on this harness's authority.
 */
export const SUBSET_OWNERSHIP = {
    "work-unit": { measuredHere: true },
    "focus-panel": { measuredHere: true },
    operations: { measuredHere: true },
    workspace: { measuredHere: true },
    organization: { measuredHere: true },
    waitlist: {
        measuredHere: false,
        certifiedBy: "certification/playwright/waitlist-manual-position-truth.cert.spec.ts",
        tier: 3,
    },
};

/**
 * What a harness-measured subset must have produced for the run to have measured anything at all.
 * Returning a falsy value means "this subset was asked for and nothing came back".
 */
export const SUBSET_EVIDENCE = {
    "work-unit": (r) => r.workUnit,
    "focus-panel": (r) => r.focusPanel ?? r.workUnit,
    operations: (r) => r.operations,
    workspace: (r) => r.workspace?.transitions,
    organization: (r) => r.workspace?.transitions,
};

/**
 * Every hard invariant in baseline.json must be asserted by `evaluate` or delegated to a named
 * runner. Three were declared and silently consulted by nothing — a baseline entry that reads like
 * a law but is inert. Listing them here forces the drift to be visible: add an invariant to the
 * baseline without asserting it, and certification fails until it is asserted or delegated.
 */
export const INVARIANTS_ASSERTED_HERE = new Set([
    "focus_panel_subtree_mounts_once_per_entry",
    "financials_reads_per_subject_intent",
    "attendance_reads_per_subject_intent",
    "health_reads_per_subject_intent",
    "roster_requests_per_new_site_date",
    "roster_requests_when_site_date_already_satisfied",
    "document_loads_on_in_app_transition",
    "workspace_shell_preserved_by_node_identity",
    "redundant_duplicate_authoritative_reads",
]);

export const INVARIANTS_DELEGATED = {
    waitlist_order_survives_reload: "certification/playwright/waitlist-manual-position-truth.cert.spec.ts",
    children_summary_is_bounded: "web/tests/presentation/focusPanelChildrenSummaryDensity.test.ts",
    drawer_vm_settlement_is_prop_change_not_remount: "web/tests/presentation/focusPanelBodyKeyStability.test.ts",
};

/**
 * Which certification subset a change class must run.
 *
 * Prefer reachability over filename lists where the repo supports it; this map is the floor, not a
 * substitute for judgement. A change that can reach the certified runtime and runs nothing is not
 * exempt — it is uncertified.
 */
export const TRIGGER_MATRIX = [
    { when: /lib\/runtime\/provisioning\//, run: ["work-unit", "focus-panel"] },
    { when: /lib\/queues\//, run: ["work-unit"] },
    { when: /lib\/presentation\/runtime\//, run: ["work-unit", "focus-panel"] },
    { when: /focusPanel|FocusPanel/, run: ["focus-panel"] },
    { when: /components\/admin\/focusPanel\/cards\//, run: ["focus-panel"] },
    { when: /lib\/orchestration\/placement\//, run: ["waitlist", "work-unit"] },
    { when: /roster|Roster|scheduling/, run: ["operations"] },
    { when: /adminV2\/(runtime|components)\/|WorkspaceShell|navigation/, run: ["workspace", "organization"] },
    { when: /contexts\/(AdminAuth|WorkspaceOrg|WorkspaceSiteFilter)/, run: ["workspace", "work-unit"] },
];

/** Which subsets a changed file set must certify. Empty means "prove unreachable, or run all". */
export function subsetsFor(changedFiles) {
    const out = new Set();
    for (const f of changedFiles) for (const r of TRIGGER_MATRIX) if (r.when.test(f)) r.run.forEach((s) => out.add(s));
    return [...out];
}

function parseArgs(argv) {
    const a = { env: "deployed-staging", subset: SUBSETS, samples: 3, json: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--env") a.env = argv[++i];
        else if (argv[i] === "--subset") a.subset = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
        else if (argv[i] === "--samples") a.samples = Number(argv[++i]);
        else if (argv[i] === "--json") a.json = true;
        else if (argv[i] === "--changed") a.subset = subsetsFor(argv[++i].split(","));
    }
    return a;
}

/** Evaluate results against the baseline. Invariants fail; bands warn. */
export function evaluate(results) {
    const inv = BASELINE.hard_invariants;
    const failures = [], warnings = [];
    const push = (ok, msg) => { if (!ok) failures.push(msg); };

    /*
     * ── PROBE INTEGRITY COMES FIRST ──
     *
     * A harness that reports PASS on a run where it measured nothing is worse than no harness: it
     * manufactures false confidence and it will be believed. This gate caught itself on its first
     * real run — an expired QA session produced `api requests=0` and null marks, and the verdict
     * came back PASS.
     *
     * An unmeasured run is NOT a passing run. It is an inconclusive run, and it fails.
     */
    /*
     * Requested-subset accounting. `if (results.x)` cannot notice a subset that produced nothing,
     * so ask the other question first: for every subset the operator ASKED for, did anything come
     * back? A delegated subset is reported as delegated and never counted as measured here.
     */
    const requested = results.subsets ?? [];
    const delegated = [];
    let measuredHereCount = 0;
    for (const s of requested) {
        const own = SUBSET_OWNERSHIP[s];
        if (!own) { failures.push(`PROBE FAILURE: unknown subset "${s}" — it certifies nothing.`); continue; }
        if (!own.measuredHere) { delegated.push({ subset: s, certifiedBy: own.certifiedBy, tier: own.tier }); continue; }
        if (!SUBSET_EVIDENCE[s]?.(results)) {
            failures.push(`PROBE FAILURE: subset "${s}" was requested but produced no measurements. Nothing was measured; this is not a pass.`);
            continue;
        }
        measuredHereCount += 1;
    }
    if (requested.length && measuredHereCount === 0) {
        const via = delegated.map((d) => `${d.subset} → ${d.certifiedBy}`).join("; ");
        failures.push(
            `PROBE FAILURE: this harness measured nothing. ${delegated.length ? `Requested subsets are certified elsewhere (${via}); run that runner — this run is not evidence about them.` : "No requested subset produced measurements."}`
        );
    }

    // Baseline drift: a declared law that nothing asserts is not a law.
    for (const k of Object.keys(inv)) {
        if (k.startsWith("_")) continue;
        if (INVARIANTS_ASSERTED_HERE.has(k) || INVARIANTS_DELEGATED[k]) continue;
        failures.push(`PROBE FAILURE: hard invariant "${k}" is declared in baseline.json but nothing asserts it. Assert it here or delegate it to a named runner.`);
    }

    if (results.workUnit) {
        const r = results.workUnit;
        if (!r.apiTotal) failures.push("PROBE FAILURE: no API traffic observed — the session is probably unauthenticated. Nothing was measured; this is not a pass.");
        for (const k of ["shell", "rows", "firstUsefulCard"]) {
            if (r.p50?.[k] == null) failures.push(`PROBE FAILURE: "${k}" never resolved — not measured, not fast.`);
        }
    }
    if (results.workspace?.transitions) {
        for (const t of results.workspace.transitions) {
            if (t.probeFailure) failures.push(`PROBE FAILURE: "${t.name}" — ${t.probeFailure}`);
        }
    }
    if (results.operations?.probeFailure) failures.push(`PROBE FAILURE: operations — ${results.operations.probeFailure}`);

    if (results.workUnit) {
        const r = results.workUnit;
        if (r.remounts?.length) failures.push(`INVARIANT: Focus Panel subtree remounted — ${r.remounts.map((x) => `${x.id} x${x.mounts}`).join(", ")}`);
        for (const k of ["financials", "attendance", "health"]) {
            const seen = r.cardReads?.[k]?.maxPerSubject ?? 0;
            push(seen <= inv[`${k}_reads_per_subject_intent`], `INVARIANT: ${k} read ${seen}x for one subject intent (max ${inv[`${k}_reads_per_subject_intent`]})`);
        }
        if (r.duplicates?.redundant?.length) failures.push(`INVARIANT: ${r.duplicates.redundant.length} redundant duplicate read(s): ${r.duplicates.redundant.map((d) => d.url.slice(0, 60)).join("; ")}`);
        const band = BASELINE.performance_bands.work_unit_cold_entry;
        for (const [k, key] of [["ttfb", "ttfb_ms"], ["shell", "shell_ms"], ["rows", "rows_ms"]]) {
            const v = r.p50?.[k];
            if (v != null && v > band[key].band_max) warnings.push(`BAND: work unit ${k} p50 ${v}ms > ${band[key].band_max}ms`);
        }
    }
    if (results.focusPanel?.geometry) {
        const g = results.focusPanel.geometry, b = BASELINE.performance_bands.focus_panel;
        if (g.scrollDisplacement > b.scroll_displacement_px.band_max) failures.push(`INVARIANT: scroll displaced ${g.scrollDisplacement}px during reveal`);
        if (g.growth > b.growth_px.band_max) warnings.push(`BAND: grid growth ${g.growth}px > ${b.growth_px.band_max}px`);
        if (g.waves > b.waves.band_max) warnings.push(`BAND: ${g.waves} content waves > ${b.waves.band_max}`);
    }
    if (results.operations) {
        const o = results.operations;
        if (o.openRosterRequests != null) push(o.openRosterRequests === inv.roster_requests_per_new_site_date, `INVARIANT: Operations open issued ${o.openRosterRequests} roster requests (expected ${inv.roster_requests_per_new_site_date})`);
        if (o.satisfiedRefetch != null) push(o.satisfiedRefetch === inv.roster_requests_when_site_date_already_satisfied, `INVARIANT: satisfied site/day refetched ${o.satisfiedRefetch}x`);
    }
    if (results.workspace?.transitions) {
        for (const t of results.workspace.transitions) {
            if (t.docLoads > inv.document_loads_on_in_app_transition) failures.push(`INVARIANT: "${t.name}" caused ${t.docLoads} document load(s)`);
            if (t.shellSameNode === false) failures.push(`INVARIANT: "${t.name}" did not preserve the workspace shell node`);
        }
    }
    return { failures, warnings, delegated, pass: failures.length === 0 };
}

export function report(results, verdict, env) {
    const L = [];
    L.push("═".repeat(78));
    L.push("ALLOY RUNTIME CERTIFICATION");
    L.push("═".repeat(78));
    L.push(`environment      : ${env.name}${env.grantsFinalAcceptance ? "  (grants final acceptance)" : "  (pre-merge only — cannot grant acceptance)"}`);
    L.push(`base url         : ${env.baseUrl}`);
    L.push(`deployed sha     : ${results.deployedSha ?? "n/a"}`);
    L.push(`baseline sha     : ${BASELINE.certified.deployed_sha}`);
    L.push(`subsets          : ${results.subsets?.join(", ") ?? "-"}`);
    L.push("");
    if (results.workUnit) {
        const r = results.workUnit;
        L.push("── WORK UNIT (cold document entry) ──");
        L.push(`  p50 ttfb=${r.p50?.ttfb}ms shell=${r.p50?.shell}ms rows=${r.p50?.rows}ms firstUsefulCard=${r.p50?.firstUsefulCard}ms`);
        L.push(`  api requests=${r.apiTotal}  card reads=${JSON.stringify(r.cardReads)}`);
        L.push(`  remounts(card-bearing)=${r.remounts?.length ?? 0}  redundant duplicates=${r.duplicates?.redundant?.length ?? 0}`);
        for (const ir of r.intentionalRemounts ?? []) L.push(`  intentional remount ${ir.id} x${ir.mounts} — ${ir.why}`);
    }
    if (results.focusPanel?.geometry) {
        const g = results.focusPanel.geometry;
        L.push("── FOCUS PANEL ──");
        L.push(`  grid ${g.initialH}→${g.finalH}px (+${g.growth}) largestDelta=${g.largestDelta}px waves=${g.waves} stable=${g.stableAt}ms`);
        L.push(`  scrollDisplacement=${g.scrollDisplacement}px neighbourMovement=${g.neighbourMovement}px`);
    }
    if (results.operations) L.push(`── OPERATIONS ──\n  open roster requests=${results.operations.openRosterRequests}  satisfied refetch=${results.operations.satisfiedRefetch}`);
    if (results.workspace?.transitions) {
        L.push("── WORKSPACE / ORGANIZATION ──");
        for (const t of results.workspace.transitions) L.push(`  ${String(t.name).padEnd(34)} fb=${t.feedback}ms useful=${t.useful}ms docLoads=${t.docLoads} shellSameNode=${t.shellSameNode}`);
    }
    L.push("");
    for (const d of verdict.delegated ?? []) {
        L.push(`DELEGATED: subset "${d.subset}" is certified by ${d.certifiedBy} (tier ${d.tier}) — not measured here.`);
    }
    L.push(verdict.failures.length ? "INVARIANT FAILURES:" : "INVARIANT FAILURES: none");
    verdict.failures.forEach((f) => L.push("  ✗ " + f));
    L.push(verdict.warnings.length ? "BAND WARNINGS (investigate, not automatic failure):" : "BAND WARNINGS: none");
    verdict.warnings.forEach((w) => L.push("  ! " + w));
    L.push("");
    L.push(`RUNTIME CERTIFICATION — ${verdict.pass ? "PASS" : "FAIL"}${verdict.pass && !env.grantsFinalAcceptance ? " (pre-merge; deployed-staging still required for acceptance)" : ""}`);
    L.push("═".repeat(78));
    return L.join("\n");
}

export { BASELINE, ENVIRONMENTS, parseArgs };

if (process.argv[1] && process.argv[1].endsWith("runtimeCertification.mjs")) {
    const args = parseArgs(process.argv.slice(2));
    const env = ENVIRONMENTS[args.env];
    if (!env) { console.error(`unknown --env "${args.env}". known: ${Object.keys(ENVIRONMENTS).join(", ")}`); process.exit(2); }
    const { runCertification } = await import("./run.mjs");
    const results = await runCertification({ ...args, env: { ...env, name: args.env } });
    const verdict = evaluate(results);
    if (args.json) console.log(JSON.stringify({ env: args.env, results, verdict }, null, 2));
    else console.log(report(results, verdict, { ...env, name: args.env }));
    process.exit(verdict.pass ? 0 : 1);
}
