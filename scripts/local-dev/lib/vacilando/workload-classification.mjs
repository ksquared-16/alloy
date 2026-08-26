/**
 * S3 — authoritative workload classification.
 *
 * WHAT THIS REPLACES. A regex over a command string. `isUnbrokeredHeavyCommand`
 * matched tsc and next build and nothing else, and vitest was allowlisted
 * because focused runs are cheap — so `vitest run one.test.ts` and
 * `vitest run tests/` were indistinguishable. Both of the suites that drove this
 * host to load 54.47 were vitest, and both were invisible.
 *
 * THE CORRECTION. A binary name is not a workload. Scope is. The same `vitest`
 * binary classifies as targeted_test or heavy_test depending on what it was
 * pointed at, and the worker count it was given changes what it is expected to
 * cost. Classification reads invocation semantics — tool, scope, explicit
 * flags — and never a directory or a heuristic over shell prose.
 *
 * HONESTY OVER COVERAGE. Three confidences exist and `unknown` is a first-class
 * answer. An invocation this module does not recognise stays unknown rather
 * than being promoted into the nearest known class, because a confident wrong
 * class is what future enforcement would act on.
 *
 * SCOPE OF S3. Classification and measurement only. Nothing here throttles,
 * rejects, caps or terminates. The weights are policy defaults, versioned so
 * telemetry can revise them before S5 turns any of it into a budget.
 */

export const WORKLOAD_SCHEMA = "vacilando.workload.v1";

/** Stable machine keys. Human labels live beside them, never in the keys. */
export const WORKLOAD_CLASSES = Object.freeze({
  interactive: "Provider work",
  light_validation: "Light validation",
  targeted_test: "Targeted test",
  heavy_test: "Heavy test suite",
  typecheck: "Typecheck",
  production_build: "Production build",
  browser_e2e: "Browser / E2E",
  machine_exclusive: "Machine-exclusive certification",
});

export const CLASSIFICATION_CONFIDENCE = Object.freeze(["authoritative", "best_effort", "unknown"]);

/**
 * Expected cost, as POLICY — not architecture.
 *
 * Centralised and versioned on purpose: the doctrine's V1 numbers are estimates,
 * S3 exists partly to gather the telemetry that will revise them, and a weight
 * scattered through classifier branches could never be revised coherently.
 * `heavy_test` is the one function of workers, because that is where a suite's
 * real cost lives.
 */
export const WEIGHT_POLICY = Object.freeze({
  version: "v1",
  source: "capacity-doctrine-2026-08-26",
  weights: Object.freeze({
    interactive: 1,
    light_validation: 1,
    targeted_test: 2,
    heavy_test: null, // workers × per_worker
    typecheck: 4,
    production_build: 6,
    browser_e2e: 4,
    machine_exclusive: null, // all available validation capacity
  }),
  heavy_test_per_worker: 2,
  /** Default assumed workers when a runner fans out and did not say how far. */
  default_workers: 4,
});

/**
 * Expected weight for a class.
 *
 * `machine_exclusive` returns Infinity deliberately: it consumes all validation
 * capacity, and encoding that as a large number would invite a future budget to
 * treat it as merely expensive.
 */
export function expectedWeight(workloadClass, { workers = null, policy = WEIGHT_POLICY } = {}) {
  if (workloadClass === "machine_exclusive") return Infinity;
  if (workloadClass === "heavy_test") {
    const w = Number.isFinite(workers) && workers > 0 ? workers : policy.default_workers;
    return w * policy.heavy_test_per_worker;
  }
  const fixed = policy.weights[workloadClass];
  return Number.isFinite(fixed) ? fixed : null;
}

// ── Invocation normalisation ─────────────────────────────────────────────────

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;
const ANY_FILE_RE = /\.[a-z0-9]+$/i;

/** A concrete test file, not a directory or a glob. */
export function looksLikeTestFile(arg) {
  const a = String(arg || "");
  if (!a || a.startsWith("-")) return false;
  if (a.includes("*")) return false;
  return TEST_FILE_RE.test(a);
}

/** A directory scope: a trailing slash, or a bare path with no file extension. */
export function looksLikeDirectoryScope(arg) {
  const a = String(arg || "");
  if (!a || a.startsWith("-")) return false;
  if (a.endsWith("/")) return true;
  if (a.includes("*")) return true;
  return a.includes("/") && !ANY_FILE_RE.test(a);
}

/** Explicit worker flags across vitest, jest and node runners. */
export function parseWorkerFlags(args = []) {
  const joined = args.map(String);
  for (let i = 0; i < joined.length; i += 1) {
    const a = joined[i];
    let m = a.match(/^--(?:max-?workers|maxWorkers|poolOptions\.threads\.maxThreads|max-threads)[=](\d+)$/i);
    if (m) return { workers: Number(m[1]), flag: a };
    if (/^--(?:max-?workers|maxWorkers|max-threads)$/i.test(a) && /^\d+$/.test(joined[i + 1] || "")) {
      return { workers: Number(joined[i + 1]), flag: `${a} ${joined[i + 1]}` };
    }
    m = a.match(/^--(?:max-?workers|maxWorkers)=(\d+)%$/i);
    if (m) return { workers: null, flag: a, percent: Number(m[1]) };
    if (/^--(?:no-threads|single-thread|runInBand|run-in-band)$/i.test(a)) {
      return { workers: 1, flag: a };
    }
    if (/^--pool=(forks|threads|vmThreads)$/i.test(a)) {
      // Pool choice alone does not set a count; recorded, not counted.
      return { workers: null, flag: a, pool: a.split("=")[1] };
    }
  }
  return { workers: null, flag: null };
}

/**
 * Split a command line into a tool and its arguments.
 *
 * Deliberately shallow. This reads an invocation, it does not interpret shell
 * prose: no attempt is made to follow pipes, subshells or `&&` chains, because
 * inferring correctness-critical meaning from arbitrary shell is exactly the
 * kind of guess that produced the original blind spot.
 */
export function normalizeInvocation(command) {
  const raw = String(command || "").trim();
  if (!raw) return { raw: "", tool: null, args: [], brokered: false };
  const tokens = raw.split(/\s+/);

  const brokered = /\b(vac-run|alloy-validate)\b/.test(raw) || /\bvac\s+run\b/.test(raw);

  // Strip interpreter and package-runner prefixes to reach the real tool.
  const skip = new Set(["sudo", "env", "time", "npx", "pnpm", "yarn", "bun"]);
  let i = 0;
  while (i < tokens.length && (skip.has(tokens[i]) || /^[A-Z_]+=[^\s]*$/.test(tokens[i]))) i += 1;

  // `npm exec <tool>` / `npm run <script>`
  if (/(^|\/)npm$/.test(tokens[i] || "")) {
    if (tokens[i + 1] === "exec") i += 2;
    else if (tokens[i + 1] === "run" || tokens[i + 1] === "run-script") {
      return { raw, tool: "npm-script", script: tokens[i + 2] || null, args: tokens.slice(i + 3), brokered };
    } else i += 1;
  }
  // `node <path/to/tool>` — the tool is the script, not node.
  if (/(^|\/)node$/.test(tokens[i] || "")) {
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("--")) j += 1;
    if (j < tokens.length) i = j;
  }

  const toolPath = tokens[i] || "";
  const base = toolPath.split("/").filter(Boolean).pop() || toolPath;
  const tool = base.replace(/\.[cm]?js$/, "");
  return { raw, tool: tool || null, tool_path: toolPath || null, args: tokens.slice(i + 1), brokered };
}

// ── Classification ───────────────────────────────────────────────────────────

function decide(workloadClass, basis, confidence, extra = {}) {
  return { workload_class: workloadClass, classification_basis: basis, confidence, ...extra };
}

/**
 * Classify a normalised invocation.
 *
 * The scope rules for test runners are the incident-critical part: explicit test
 * FILES are targeted; a DIRECTORY or NO scope at all is a full fan-out and is
 * heavy. This is what makes one binary produce two classes.
 */
export function classifyNormalized(n) {
  if (!n || !n.tool) return decide(null, "no_recognisable_tool", "unknown");
  const tool = String(n.tool).toLowerCase();
  const args = (n.args || []).map(String);
  const positional = args.filter((a) => !a.startsWith("-"));
  const workerFlags = parseWorkerFlags(args);

  // npm scripts resolve through the canonical Alloy script names.
  if (tool === "npm-script") {
    const script = String(n.script || "").toLowerCase();
    if (script === "typecheck" || script === "typecheck:tests") {
      return decide("typecheck", `npm_script:${script}`, "authoritative");
    }
    if (script === "build") return decide("production_build", "npm_script:build", "authoritative");
    if (script === "test") {
      return decide("heavy_test", "npm_script:test_full_suite", "authoritative",
        { workers_requested: workerFlags.workers });
    }
    if (script === "dev") return decide("interactive", "npm_script:dev", "authoritative");
    if (/^lint/.test(script)) return decide("light_validation", `npm_script:${script}`, "authoritative");
    return decide(null, `npm_script:${script || "unnamed"}`, "unknown");
  }

  // Test runners — scope decides the class.
  if (tool === "vitest" || tool === "jest") {
    const scoped = positional.filter((a) => a !== "run" && a !== "--");
    const files = scoped.filter(looksLikeTestFile);
    const dirs = scoped.filter(looksLikeDirectoryScope);
    const common = {
      workers_requested: workerFlags.workers,
      worker_flag: workerFlags.flag,
      scope_files: files.length,
      scope_dirs: dirs.length,
    };
    if (dirs.length > 0) {
      return decide("heavy_test", "runner_scope:directory", "authoritative", common);
    }
    if (files.length > 0 && files.length === scoped.length) {
      // Every scope argument is a concrete test file: bounded by construction.
      return decide("targeted_test", `runner_scope:${files.length}_explicit_file${files.length > 1 ? "s" : ""}`, "authoritative", common);
    }
    if (scoped.length === 0) {
      return decide("heavy_test", "runner_scope:no_scope_full_suite", "authoritative", common);
    }
    // Mixed or unrecognised scope shapes: real, but we cannot bound them.
    return decide("heavy_test", "runner_scope:unbounded_scope", "best_effort", common);
  }

  // TypeScript.
  if (tool === "tsc") {
    if (args.includes("--noEmit")) return decide("typecheck", "tsc_noemit", "authoritative");
    return decide("typecheck", "tsc_invocation", "best_effort");
  }

  // Next: build is production, dev is emphatically NOT.
  if (tool === "next") {
    const sub = positional[0];
    if (sub === "build") return decide("production_build", "next_build", "authoritative");
    if (sub === "dev" || sub === "start") return decide("interactive", `next_${sub}`, "authoritative");
    return decide(null, `next_${sub || "unknown"}`, "unknown");
  }

  // Browser / E2E.
  if (tool === "playwright" || tool === "playwright-core") {
    return decide("browser_e2e", "playwright", "authoritative");
  }
  if (/^alloy-agent-verify$/.test(tool) || /^alloy-certify/.test(tool)) {
    return decide("browser_e2e", `alloy_browser:${tool}`, "authoritative");
  }

  // Machine-exclusive: described here, still OWNED by execution-exclusive.
  if (/^alloy-runtime-timing/.test(tool) || /runtime[-_]timing[-_]certification/.test(n.raw)) {
    return decide("machine_exclusive", "runtime_timing_certification", "authoritative");
  }

  // Cheap checks.
  if (tool === "eslint" || tool === "prettier" || tool === "stylelint") {
    return decide("light_validation", `linter:${tool}`, "authoritative");
  }

  return decide(null, `unrecognised_tool:${tool}`, "unknown");
}

/**
 * Full classification for one observed command.
 *
 * `attribution` is an S1 record. Ownership is COPIED from it, never re-derived —
 * and a workload outside a registered worktree classifies exactly the same,
 * because scope decides class and ancestry decides owner.
 */
export function classifyWorkload({
  command,
  pid = null,
  attribution = null,
  now = null,
  policy = WEIGHT_POLICY,
} = {}) {
  const normalized = normalizeInvocation(command);
  const verdict = classifyNormalized(normalized);
  const workers = Number.isFinite(verdict.workers_requested) ? verdict.workers_requested : null;

  return {
    schema_version: WORKLOAD_SCHEMA,
    workload_id: `wl_${pid ?? "x"}_${(now ? Date.parse(now) : 0) || 0}`,
    pid,
    root_provider_pid: attribution?.root_provider_pid ?? null,
    lane_id: attribution?.lane_id ?? null,
    lane_name: attribution?.lane_name ?? null,
    execution_run_id: attribution?.execution_run_id ?? null,
    repository_id: attribution?.repository_id ?? null,
    worktree_path: attribution?.worktree_path ?? null,
    execution_location: attribution?.execution_location ?? null,

    command: normalized.raw,
    tool: normalized.tool,
    tool_path: normalized.tool_path ?? null,
    normalized_args: normalized.args,
    brokered: normalized.brokered,

    workload_class: verdict.workload_class,
    workload_label: verdict.workload_class ? WORKLOAD_CLASSES[verdict.workload_class] : null,
    classification_basis: verdict.classification_basis,
    confidence: verdict.confidence,

    workers_requested: workers,
    workers_default: verdict.workload_class === "heavy_test" && workers == null ? policy.default_workers : null,
    worker_flag: verdict.worker_flag ?? null,
    scope_files: verdict.scope_files ?? null,
    scope_dirs: verdict.scope_dirs ?? null,

    expected_weight: verdict.workload_class ? expectedWeight(verdict.workload_class, { workers, policy }) : null,
    weight_policy_version: policy.version,
    classified_at: now || new Date().toISOString(),
  };
}

// ── Classification drift ─────────────────────────────────────────────────────

/**
 * Did a workload behave like its class?
 *
 * Evidence gathering for S5, not a reclassification. A `targeted_test` that fans
 * out to twelve workers is exactly the case the doctrine names: the declared
 * class says bounded, the observation says otherwise, and someone should see
 * that before a budget is built on the declaration.
 */
export function detectClassificationDrift(record, observed = {}) {
  if (!record?.workload_class) return null;
  const cls = record.workload_class;
  const workers = Number(observed.observed_workers);
  const expected = record.expected_weight;

  const notes = [];
  if (cls === "targeted_test" && Number.isFinite(workers) && workers > 2) {
    notes.push(`declared targeted_test but fanned out to ${workers} workers`);
  }
  if (cls === "light_validation" && Number.isFinite(workers) && workers > 1) {
    notes.push(`declared light_validation but ran ${workers} workers`);
  }
  if (Number.isFinite(workers) && Number.isFinite(record.workers_requested) && workers > record.workers_requested) {
    notes.push(`requested ${record.workers_requested} workers, observed ${workers}`);
  }
  if (!notes.length) return null;

  const observedWeight = cls === "targeted_test" || cls === "light_validation"
    ? workers * WEIGHT_POLICY.heavy_test_per_worker
    : expected;
  return {
    workload_id: record.workload_id,
    declared_class: cls,
    declared_weight: expected,
    observed_workers: workers,
    observed_weight_if_heavy: observedWeight,
    notes,
    // S3 gathers evidence; it never reclassifies and never enforces.
    action: "recorded_for_s5",
  };
}
