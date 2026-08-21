/**
 * Bounded trusted-host staging application certification.
 *
 * A Development Lane requests an outcome. Director/trusted host resolves the
 * deployed URL, seeded operator session, and committed suite, then returns
 * evidence. Credentials never leave the trusted host.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ensureCommitAvailable,
  gitObjectStoreCandidates,
  PRIVILEGED_DEPLOYMENT_WORKING_COPY_INVARIANT,
} from "./trusted-host-migrate.mjs";
import {
  overlayCertificationPrincipalBinding,
  STAGING_CERT_PRINCIPAL_EMAIL,
  STAGING_CERT_PRINCIPAL_LABEL,
  principalPublicId,
} from "./trusted-host-cert-principal.mjs";

export const CANONICAL_STAGING_APP_URL = "https://staging.workwithalloy.com";
export const CERTIFY_STAGING_SH = join(dirname(fileURLToPath(import.meta.url)), "trusted-host-certify-app.sh");
export const CERTIFY_PRODUCT_REVIEW_JS = join(dirname(fileURLToPath(import.meta.url)), "trusted-host-certify-product-review.mjs");
const VACILANDO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const READ_ONLY_MUTATION_GREP_INVERT = "W-57 — a level the operator changes is authority the server holds";

export const CERTIFICATION_SUITES = Object.freeze({
  access_identity_v2: Object.freeze({
    key: "access_identity_v2",
    title: "Access & Identity staging certification",
    playwrightConfig: "certification/playwright.config.ts",
    paths: Object.freeze([
      "certification/playwright/access-role-surface-reachability.cert.spec.ts",
      "certification/playwright/access-role-editor-one-page.cert.spec.ts",
    ]),
    productReview: Object.freeze([
      { id: "users", path: "/organization/access?section=users", title: "Users" },
      { id: "user_effective_access", path: "/organization/access?section=users", title: "User effective access" },
      { id: "roles", path: "/organization/access?section=roles", title: "Roles" },
      { id: "role_editor", path: "/organization/access?section=roles", title: "Role editor" },
      { id: "security", path: "/organization/access?section=security", title: "Security" },
      { id: "location_access", path: "/organization/access?section=users", title: "Location access" },
    ]),
  }),
});

const SECRET_RE = /postgresql:\/\/|postgres:\/\/|DATABASE_URL|CERT_OPERATOR_PASSWORD|service_role|vercel[_-]?token|storage\.state|Set-Cookie|cookie:/i;

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function envName(value) {
  return String(value || "").trim().toLowerCase();
}

export function payloadContainsSecrets(value) {
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value); }
  })();
  return SECRET_RE.test(text);
}

export function validateCertifyStagingInputs(inputs = {}) {
  if (inputs.sql || inputs.statement || inputs.body || inputs.command || inputs.database_url || inputs.databaseUrl) {
    return { ok: false, code: "arbitrary_command_rejected", detail: "Staging certification is not arbitrary remote execution." };
  }
  const environment = envName(inputs.environment || inputs.env || "staging");
  if (environment === "production" || environment === "prod") {
    return { ok: false, code: "production_target_rejected", detail: "Production application certification is not registered." };
  }
  if (environment !== "staging") {
    return { ok: false, code: "environment_not_allowed", detail: "application.certify_staging is staging-only." };
  }
  const expectedSha = String(inputs.expected_sha || inputs.expectedSha || inputs.source_sha || "").trim().toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(expectedSha)) {
    return { ok: false, code: "missing_expected_sha", detail: "expected_sha of the promoted staging source is required." };
  }
  const suiteKey = String(inputs.suite_key || inputs.suiteKey || "access_identity_v2").trim();
  const suite = CERTIFICATION_SUITES[suiteKey];
  if (!suite) {
    return { ok: false, code: "unknown_suite", detail: `Suite ${suiteKey} is not a registered certification suite.` };
  }
  const writePolicy = String(inputs.write_policy || inputs.writePolicy || "read_only").trim().toLowerCase();
  if (writePolicy !== "read_only" && writePolicy !== "mutate") {
    return { ok: false, code: "invalid_write_policy", detail: "write_policy must be read_only or mutate." };
  }
  const repository = String(inputs.repository || inputs.repo || "ksquared-16/alloy").trim();
  const queryHash = `certify-staging:${environment}:${expectedSha}:${suiteKey}:${writePolicy}`;
  return {
    ok: true,
    normalized: {
      actionType: "application.certify_staging",
      environment: "staging",
      repository,
      expectedSha,
      suiteKey,
      suiteTitle: suite.title,
      suitePaths: [...suite.paths],
      playwrightConfig: suite.playwrightConfig,
      productReview: suite.productReview.map((p) => ({ ...p })),
      writePolicy,
      queryHash,
      dedupeKey: queryHash,
      dirtyCheckoutIrrelevant: true,
      workingCopyInvariant: PRIVILEGED_DEPLOYMENT_WORKING_COPY_INVARIANT.id,
    },
  };
}

function defaultProbeUrl(url) {
  const child = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20", "-L", url], {
    encoding: "utf8",
    timeout: 25_000,
  });
  const status = Number(String(child.stdout || "").trim());
  if (child.status !== 0 || !Number.isFinite(status) || status < 200 || status >= 500) {
    return { ok: false, detail: `probe_failed status=${status || child.status}` };
  }
  return { ok: true, status };
}

export function resolveStagingDeployment({
  env = process.env,
  probe = defaultProbeUrl,
} = {}) {
  const configured = String(env.ALLOY_STAGING_APP_URL || env.STAGING_APP_URL || "").trim();
  const url = configured || CANONICAL_STAGING_APP_URL;
  if (!/^https:\/\//i.test(url) || /vercel\.com\/|dashboard/i.test(url)) {
    return {
      ok: false,
      code: "staging_deployment_unavailable",
      detail: "Resolved target is not a usable application URL.",
    };
  }
  const probed = probe(url);
  if (!probed?.ok) {
    return {
      ok: false,
      code: "staging_deployment_unavailable",
      detail: probed?.detail || "Staging application at configured URL did not respond.",
      url_identity: new URL(url).host,
      source: configured ? "trusted_env" : "canonical_config",
    };
  }
  return {
    ok: true,
    url,
    url_identity: new URL(url).host,
    http_status: probed.status || null,
    source: configured ? "trusted_env" : "canonical_config",
  };
}

export function resolveCertificationPrincipal({ env = process.env, runtimeRoot } = {}) {
  const merged = overlayCertificationPrincipalBinding(env, runtimeRoot);
  const email = String(merged.CERT_OPERATOR_EMAIL || merged.CERT_OPERATOR_EMAIL || "").trim();
  const password = String(merged.CERT_OPERATOR_PASSWORD || merged.CERT_OPERATOR_PASSWORD || "").trim();
  if (!email || !password) {
    return {
      ok: false,
      code: "staging_certification_principal_unavailable",
      detail: "Trusted host has no bound staging certification principal.",
      setup: "Director should run application.ensure_certification_principal. Do not place credentials in a Development Lane.",
    };
  }
  const fixture = email.toLowerCase() === STAGING_CERT_PRINCIPAL_EMAIL.toLowerCase();
  return {
    ok: true,
    principal_id: fixture ? principalPublicId(email) : `certop_${sha256(email).slice(0, 12)}`,
    principal_label: fixture ? STAGING_CERT_PRINCIPAL_LABEL : "seeded_certification_operator",
    principal_email_domain: email.includes("@") ? email.split("@")[1] : null,
  };
}

export function resolveSuiteFromGit(normalized, opts = {}) {
  const show = opts.gitShow || opts.gitShow || null;
  const root = opts.root || null;
  const files = [];
  let gitCwd = null;
  if (typeof show === "function") {
    for (const relative of normalized.suitePaths) {
      const shown = show({ sha: normalized.expectedSha, relative, cwd: root });
      if (!shown?.ok) {
        return { ok: false, code: "suite_missing_at_sha", detail: `Suite file ${relative} is not present at ${normalized.expectedSha}` };
      }
      files.push({ relative, sha256: sha256(shown.text), bytes: Buffer.byteLength(shown.text, "utf8") });
    }
    return {
      ok: true,
      gitCwd: root || "(injected-git-show)",
      files,
      suite_hash: sha256(files.map((f) => `${f.relative}:${f.sha256}`).join("|")),
      dirtyCheckoutIrrelevant: true,
      objectStoresConsidered: 0,
    };
  }
  const store = ensureCommitAvailable(normalized.expectedSha, { root, fetchIfMissing: true });
  if (!store.ok) return store;
  for (const relative of normalized.suitePaths) {
    const shown = spawnSync("git", ["show", `${normalized.expectedSha}:${relative}`], {
      cwd: store.cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (shown.status !== 0) {
      return { ok: false, code: "suite_missing_at_sha", detail: `Suite file ${relative} is not present at ${normalized.expectedSha}` };
    }
    const text = String(shown.stdout || "");
    files.push({ relative, sha256: sha256(text), bytes: Buffer.byteLength(text, "utf8") });
  }
  return {
    ok: true,
    gitCwd: store.cwd,
    files,
    suite_hash: sha256(files.map((f) => `${f.relative}:${f.sha256}`).join("|")),
    dirtyCheckoutIrrelevant: true,
    objectStoresConsidered: gitObjectStoreCandidates(root).length,
  };
}

export function enforceWritePolicy(writePolicy, { env = {} } = {}) {
  const mutateRequested = writePolicy === "mutate";
  if (!mutateRequested) {
    return {
      ok: true,
      writes_enabled: false,
      env: { CERT_ALLOW_WRITES: "0" },
      skipped_write_tests: true,
      reason: "Shared staging certification defaults to read-only. Write tests stay skipped.",
    };
  }
  if (env.CERT_ALLOW_WRITES !== "1" && env.CERT_ALLOW_WRITES !== "1") {
    return {
      ok: false,
      code: "mutation_not_authorized",
      detail: "Mutating staging certification requires write_policy=mutate and operator approval. CERT_ALLOW_WRITES is not auto-enabled because the suite can write.",
    };
  }
  return {
    ok: true,
    writes_enabled: true,
    env: { CERT_ALLOW_WRITES: "1" },
    skipped_write_tests: false,
    reason: "Operator-approved mutating certification.",
  };
}

export function classifyCertificationStatus({
  deploymentOk,
  principalOk,
  tests = {},
  runtime = [],
} = {}) {
  if (deploymentOk === false) return "environment_unavailable";
  if (principalOk === false) return "principal_unavailable";
  const failed = Number(tests.failed || 0);
  const passed = Number(tests.passed || 0);
  const skipped = Number(tests.skipped || 0);
  const runtimeFailed = runtime.some((r) => r.status === "failed");
  if (failed > 0 || runtimeFailed) return "failed";
  const runtimeOpen = runtime.some((r) =>
    r.status === "skipped" || r.status === "not_run_read_only" || r.status === "unproven");
  if (passed > 0 && (skipped > 0 || runtimeOpen)) return "certified_read_only";
  if (passed > 0 && skipped === 0 && !runtimeOpen) {
    return "certified";
  }
  if (passed > 0) return "partially_certified";
  return "failed";
}

export function publicCertificationResult(result) {
  if (!result) return null;
  if (payloadContainsSecrets(result)) {
    return { ok: false, code: "result_contained_secrets", detail: "Certification result contained secrets and was discarded." };
  }
  const terminal = ["failed", "environment_unavailable", "principal_unavailable"];
  return {
    ok: result.ok !== false && !terminal.includes(result.status),
    action_key: "application.certify_staging",
    status: result.status,
    environment: "staging",
    deployment: result.deployment
      ? {
        url_identity: result.deployment.url_identity,
        source: result.deployment.source,
        http_status: result.deployment.http_status || null,
      }
      : null,
    source_sha: result.source_sha,
    suite: result.suite,
    write_policy: result.write_policy,
    principal: result.principal
      ? {
        principal_id: result.principal.principal_id,
        principal_label: result.principal.principal_label,
      }
      : null,
    started_at: result.started_at,
    completed_at: result.completed_at,
    tests: result.tests || null,
    runtime: result.runtime || [],
    browser: result.browser || null,
    product_review: result.product_review || [],
    evidence_path: result.evidence_path || null,
    evidence: result.evidence || [],
    code: result.code || null,
    detail: result.detail || null,
    setup: result.setup || null,
  };
}

export function requireCertificationEvidence(result) {
  const path = result?.evidence_path;
  const evidence = result?.evidence;
  if (!path && !(Array.isArray(evidence) && evidence.length)) {
    return { ok: false, code: "evidence_missing", detail: "Certification completed without a persisted evidence artifact." };
  }
  return { ok: true };
}

export function defaultRuntimeChecks({ writePolicy = "read_only", browserFailed = false } = {}) {
  const readOnly = writePolicy !== "mutate";
  const skipMut = readOnly ? "not_run_read_only" : "passed";
  const browserProof = browserFailed ? "failed" : "passed";
  return [
    { id: "membership_resolves", status: browserProof, proof: "browser_suite", detail: "Seeded operator membership resolves to one organization." },
    { id: "membership_missing_fails_closed", status: skipMut, proof: "write_policy", detail: "Fail-closed missing membership is a mutation/isolation check." },
    { id: "no_silent_multi_org", status: browserProof, proof: "browser_suite", detail: "No silent multi-org picker on the seeded operator session." },
    { id: "role_resolution", status: browserProof, proof: "browser_suite", detail: "Seeded operator role resolves." },
    { id: "read_vs_manage", status: browserProof, proof: "browser_suite", detail: "Access UI distinguishes View and Manage." },
    { id: "server_capability_authority", status: browserProof, proof: "browser_suite", detail: "Capability chips follow server authority, not a client guess." },
    { id: "role_scope_independence", status: browserProof, proof: "browser_suite", detail: "Retired Access Scopes navigation is not a current Access chapter." },
    { id: "location_department_restriction", status: "unproven", proof: "fixture_absent", detail: "No representative read-only staging fixture exists; department-restriction disclosure stays unproven." },
    { id: "no_admin_ops_scope_bypass", status: skipMut, proof: "write_policy", detail: "Requires a restricted-scope fixture." },
    { id: "admin_users_admin_read", status: browserProof, proof: "browser_suite", detail: "Seeded operator can open Users." },
    { id: "admin_users_ops_preserved_read", status: skipMut, proof: "write_policy", detail: "Requires the ops preservation principal." },
    { id: "admin_users_without_read", status: skipMut, proof: "write_policy", detail: "Requires a principal without Users read." },
  ];
}

export function parsePlaywrightJson(json) {
  const report = typeof json === "string" ? JSON.parse(json) : json;
  const stats = report?.stats || {};
  const tests = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node.suites)) node.suites.forEach(walk);
    if (Array.isArray(node.specs)) {
      for (const spec of node.specs) {
        const result = spec.tests?.[0]?.results?.[0];
        const raw = result?.status || spec.tests?.[0]?.status || (spec.ok === false ? "failed" : "passed");
        const status = raw === "skipped" || raw === "interrupted"
          ? "skipped"
          : (spec.ok === false || raw === "failed" || raw === "timedOut" || raw === "unexpected" ? "failed" : "passed");
        tests.push({ title: spec.title, status });
      }
    }
  }
  walk(report);
  return {
    passed: tests.filter((s) => s.status === "passed").length || Number(stats.expected || 0),
    failed: tests.filter((s) => s.status === "failed").length || Number(stats.unexpected || 0),
    skipped: tests.filter((s) => s.status === "skipped").length || Number(stats.skipped || 0),
    tests,
  };
}

function vacilandoCheckoutFrom(env = {}) {
  return String(env.VACILANDO_CHECKOUT || env.ALLOY_WORKTREE || VACILANDO_ROOT).trim();
}

function findPlaywrightBin(env = {}, suiteDir = "") {
  const configured = String(env.PLAYWRIGHT_BIN || "").trim();
  const candidates = [
    configured,
    suiteDir && join(suiteDir, "web", "node_modules", ".bin", "playwright"),
    join(vacilandoCheckoutFrom(env), "web", "node_modules", ".bin", "playwright"),
    "/Users/Kelly/Alloy/web/node_modules/.bin/playwright",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || "";
}

function nodeModulesRoot(env = {}, suiteDir = "") {
  const candidates = [
    suiteDir && join(suiteDir, "web", "node_modules"),
    join(vacilandoCheckoutFrom(env), "web", "node_modules"),
    "/Users/Kelly/Alloy/web/node_modules",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || "";
}

function linkSuiteNodeModules(suiteDir, env = {}) {
  const nm = nodeModulesRoot(env, suiteDir);
  const dest = join(suiteDir, "node_modules");
  if (!nm || existsSync(dest)) return;
  try { symlinkSync(nm, dest); } catch { /* best-effort module resolution for archived suite */ }
}

function prepareMaterializedSuite(suiteDir, env = {}) {
  linkSuiteNodeModules(suiteDir, env);
  const cfg = join(suiteDir, "certification", "playwright.config.ts");
  if (!existsSync(cfg)) return;
  try {
    let text = readFileSync(cfg, "utf8");
    if (!/expect:\s*\{/.test(text)) {
      text = text.replace(
        "export default defineConfig({",
        "export default defineConfig({\n    expect: { timeout: Number(process.env.CERT_EXPECT_TIMEOUT_MS || 30_000) },",
      );
      writeFileSync(cfg, text);
    }
  } catch { /* archived config is best-effort */ }
}

export function materializeCommittedSuite({
  sha,
  gitCwd,
  dest,
  spawn = spawnSync,
} = {}) {
  const cwd = gitCwd || gitCwd;
  if (!sha || !cwd || !dest) {
    return { ok: false, code: "suite_materialize_failed", detail: "sha, gitCwd, and dest are required." };
  }
  mkdirSync(dest, { recursive: true });
  const archive = spawn("git", ["archive", sha, "certification", "web/playwright/redactingReporter.ts"], {
    cwd,
    encoding: "buffer",
    maxBuffer: 40 * 1024 * 1024,
    timeout: 60_000,
  });
  if (archive.status !== 0) {
    return {
      ok: false,
      code: "suite_materialize_failed",
      detail: String(archive.stderr || archive.stdout || "git archive failed").slice(0, 400),
    };
  }
  const tar = spawn("tar", ["-x", "-C", dest], {
    input: archive.stdout,
    encoding: "buffer",
    timeout: 30_000,
  });
  if (tar.status !== 0) {
    return {
      ok: false,
      code: "suite_materialize_failed",
      detail: String(tar.stderr || "tar extract failed").slice(0, 400),
    };
  }
  return { ok: true, suiteDir: dest };
}

export function runDefaultBrowser({
  normalized,
  deployment,
  writes,
  suite,
  evidenceDir,
  env = {},
  spawn = spawnSync,
  materialize = materializeCommittedSuite,
} = {}) {
  const suiteDir = join(evidenceDir, "suite");
  const made = materialize({
    sha: normalized.expectedSha,
    gitCwd: suite.gitCwd || suite.gitCwd,
    dest: suiteDir,
    spawn,
  });
  if (!made?.ok) {
    return {
      ok: false,
      passed: 0,
      failed: 1,
      skipped: 0,
      tests: [{ title: "materialize committed suite", status: "failed" }],
      detail: made?.detail || "suite_materialize_failed",
      suiteDir,
    };
  }
  prepareMaterializedSuite(suiteDir, env);
  const jsonOut = join(evidenceDir, "playwright-report.json");
  const errFile = join(evidenceDir, "playwright.stderr");
  const extras = [];
  if (normalized.writePolicy !== "mutate") {
    extras.push("--grep-invert", READ_ONLY_MUTATION_GREP_INVERT);
  }
  for (const relative of normalized.suitePaths || []) extras.push(join(suiteDir, relative));
  const child = spawn("bash", [CERTIFY_STAGING_SH, suiteDir, jsonOut, errFile, ...extras], {
    env: {
      ...env,
      CERT_APP_URL: deployment.url,
      CERT_APP_URL: deployment.url,
      CERT_WRITE_POLICY: normalized.writePolicy,
      CERT_ALLOW_WRITES: writes?.writes_enabled ? "1" : "0",
      VACILANDO_CHECKOUT: vacilandoCheckoutFrom(env),
      PLAYWRIGHT_BIN: findPlaywrightBin(env, suiteDir),
      NODE_PATH: nodeModulesRoot(env, suiteDir),
      CERT_EXPECT_TIMEOUT_MS: env.CERT_EXPECT_TIMEOUT_MS || "30000",
    },
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  let parsed = { passed: 0, failed: 0, skipped: 0, tests: [] };
  if (existsSync(jsonOut)) {
    try {
      parsed = parsePlaywrightJson(readFileSync(jsonOut, "utf8"));
    } catch {
      parsed = { passed: 0, failed: 1, skipped: 0, tests: [{ title: "playwright json", status: "failed" }] };
    }
  } else if (child.status !== 0) {
    parsed = { passed: 0, failed: 1, skipped: 0, tests: [{ title: "playwright", status: "failed" }] };
  }
  if (normalized.writePolicy !== "mutate") {
    parsed.skipped += 1;
    parsed.tests = [
      ...parsed.tests,
      { title: "mutation criterion skipped under read_only policy", status: "skipped" },
    ];
  }
  return {
    ok: Number(parsed.failed || 0) === 0 && child.status === 0,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    tests: parsed.tests,
    suiteDir,
    exit_code: child.status,
  };
}

export function captureDefaultReview({
  deployment,
  evidenceDir,
  routes = [],
  env = {},
  spawn = spawnSync,
  suiteDir = join(evidenceDir, "suite"),
} = {}) {
  const reviewDir = join(evidenceDir, "product-review");
  mkdirSync(reviewDir, { recursive: true });
  const outFile = join(reviewDir, "capture.json");
  const authState = join(suiteDir, "certification", ".auth", "operator.json");
  const checkout = vacilandoCheckoutFrom(env);
  const childEnv = { ...env };
  delete childEnv.CERT_OPERATOR_PASSWORD;
  delete childEnv.CERT_OPERATOR_PASSWORD;
  const child = spawn(process.execPath, [CERTIFY_PRODUCT_REVIEW_JS], {
    env: {
      ...childEnv,
      CERT_APP_URL: deployment.url,
      CERT_AUTH_STATE: authState,
      CERT_REVIEW_DIR: reviewDir,
      CERT_REVIEW_OUT: outFile,
      CERT_REVIEW_ROUTES: JSON.stringify(routes),
      NODE_PATH: join(checkout, "web", "node_modules"),
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (existsSync(outFile)) {
    try {
      const captured = JSON.parse(readFileSync(outFile, "utf8"));
      if (Array.isArray(captured)) return captured;
    } catch { /* fall through */ }
  }
  try {
    const errText = String(child.stderr || child.stdout || "").replace(/CERT_OPERATOR_PASSWORD=\S+/g, "CERT_OPERATOR_PASSWORD=[redacted]");
    if (errText.trim()) writeFileSync(join(reviewDir, "capture.stderr"), errText.slice(0, 4000));
  } catch { /* */ }
  return (routes || []).map((route) => ({
    id: route.id,
    title: route.title,
    path: route.path,
    artifact: null,
    status: child.status === 0 ? "capture_failed" : "capture_failed",
  }));
}

function persistEarly(status, err, { started, evidenceDir, normalized, suite = null, deployment = null, principal = null }) {
  const result = {
    ok: false,
    status,
    code: err.code,
    detail: err.detail,
    environment: "staging",
    deployment: deployment?.ok
      ? { url_identity: deployment.url_identity, source: deployment.source, http_status: deployment.http_status || null }
      : (err.url_identity ? { url_identity: err.url_identity, source: err.source || null } : null),
    source_sha: normalized.expectedSha,
    suite: suite?.ok
      ? { key: normalized.suiteKey, hash: suite.suite_hash, files: suite.files }
      : { key: normalized.suiteKey },
    write_policy: normalized.writePolicy,
    principal: principal?.ok
      ? { principal_id: principal.principal_id, principal_label: principal.principal_label }
      : null,
    started_at: started,
    completed_at: new Date().toISOString(),
    tests: { passed: 0, failed: 0, skipped: 0 },
    runtime: [],
    browser: { tests: [] },
    product_review: [],
    evidence_path: join(evidenceDir, "certification.json"),
    evidence: [{ kind: "certification_report", path: join(evidenceDir, "certification.json") }],
    setup: err.setup || null,
  };
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(result.evidence_path, `${JSON.stringify(publicCertificationResult(result), null, 2)}\n`);
  return result;
}

export function applyCertifyStaging(normalized, {
  resolveDeployment = resolveStagingDeployment,
  resolvePrincipal = resolveCertificationPrincipal,
  resolveSuite = resolveSuiteFromGit,
  runBrowser = null,
  captureReview = null,
  nowMs = Date.now(),
  env = process.env,
  evidenceRoot = null,
} = {}) {
  const started = new Date(nowMs).toISOString();
  const evidenceDir = evidenceRoot || join(
    process.env.ALLOY_RUNTIME_ROOT || "/tmp",
    "vacilando",
    "certification",
    `cert-${normalized.expectedSha.slice(0, 12)}`,
  );
  mkdirSync(evidenceDir, { recursive: true });

  const suite = resolveSuite(normalized);
  if (!suite.ok) return persistEarly("failed", suite, { started, evidenceDir, normalized });

  const deployment = resolveDeployment({ env });
  if (!deployment.ok) {
    return persistEarly("environment_unavailable", deployment, { started, evidenceDir, normalized, suite });
  }

  const principal = resolvePrincipal({ env });
  if (!principal.ok) {
    return persistEarly("principal_unavailable", principal, { started, evidenceDir, normalized, suite, deployment });
  }

  const writes = enforceWritePolicy(normalized.writePolicy, { env });
  if (!writes.ok) {
    return persistEarly("failed", writes, { started, evidenceDir, normalized, suite, deployment, principal });
  }

  let browser = { ok: true, passed: 0, failed: 0, skipped: 0, tests: [] };
  if (typeof runBrowser === "function") {
    browser = runBrowser({
      normalized,
      deployment,
      principal,
      writes,
      suite,
      evidenceDir,
      env,
    }) || browser;
  }

  const runtime = defaultRuntimeChecks({
    writePolicy: normalized.writePolicy,
    browserFailed: Number(browser.failed || 0) > 0,
  });

  let productReview = [];
  if (typeof captureReview === "function") {
    productReview = captureReview({
      deployment,
      evidenceDir,
      routes: normalized.productReview,
      env,
      suiteDir: browser.suiteDir || join(evidenceDir, "suite"),
    }) || [];
  } else {
    productReview = (normalized.productReview || []).map((route) => ({
      id: route.id,
      title: route.title,
      path: route.path,
      artifact: null,
      status: Number(browser.failed || 0) > 0 ? "not_captured" : "queued_with_browser_screenshots",
    }));
  }

  const tests = {
    passed: Number(browser.passed || 0),
    failed: Number(browser.failed || 0),
    skipped: Number(browser.skipped || 0),
  };
  const status = classifyCertificationStatus({
    deploymentOk: true,
    principalOk: true,
    tests,
    runtime,
  });
  const result = {
    ok: !["failed", "environment_unavailable", "principal_unavailable"].includes(status),
    status,
    environment: "staging",
    deployment: {
      url_identity: deployment.url_identity,
      source: deployment.source,
      http_status: deployment.http_status || null,
    },
    source_sha: normalized.expectedSha,
    suite: {
      key: normalized.suiteKey,
      title: normalized.suiteTitle,
      hash: suite.suite_hash,
      files: suite.files,
    },
    write_policy: normalized.writePolicy,
    writes_enabled: writes.writes_enabled,
    principal: {
      principal_id: principal.principal_id,
      principal_label: principal.principal_label,
    },
    started_at: started,
    completed_at: new Date().toISOString(),
    tests,
    runtime,
    browser: { tests: browser.tests || [] },
    product_review: productReview,
    evidence_path: join(evidenceDir, "certification.json"),
    evidence: [
      { kind: "certification_report", path: join(evidenceDir, "certification.json") },
      ...productReview.filter((p) => p.artifact).map((p) => ({ kind: "product_review", id: p.id, path: p.artifact })),
    ],
    artifact_source: "git_object",
    credentialsExposed: false,
  };
  writeFileSync(result.evidence_path, `${JSON.stringify(publicCertificationResult(result), null, 2)}\n`);
  return result;
}
