/**
 * WHAT A CHANGE IS GOING TO BE JUDGED BY, BEFORE THE PULL REQUEST SAYS SO.
 *
 * The repeated shape: a change is green locally, the PR opens, a check nobody
 * on the change knew about goes red, and the repair costs a second promotion.
 * PR 947 is the canonical instance — `reconciliation-registry.mjs` has contract
 * tests in TWO test roots, `scripts/local-dev/tests` and `web/tests/scripts`,
 * and a grep scoped to the first cannot see the second. CI found it at PR time.
 *
 * This answers the question earlier, from the repository rather than from
 * memory: given the files a candidate changes, which tests reference them, and
 * which required checks will run.
 *
 * DELIBERATELY NOT A DEPENDENCY GRAPH. A real module graph across a Next.js app,
 * a shell toolkit, SQL fixtures and four test runners is a large thing to build
 * and a larger thing to trust, and it would still miss the case that matters
 * most here: a test that names a contract in a string rather than importing it.
 * Textual reference across every test root catches that, and its failure mode is
 * over-reporting — which costs a test run, not a promotion.
 *
 * The output is a claim a mission can put in front of a human:
 *
 *   EXPECTED_TEST_SURFACE   the tests that mention what changed
 *   EXPECTED_CHECK_CLASSES  the workflows whose path filters match
 *
 * Neither is a promise that nothing else can fail. It is the difference between
 * discovering a sibling suite now and discovering it after the branch is pushed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

/**
 * Every place this repository keeps tests.
 *
 * Additive by design: adding a root here is cheap, missing one costs a
 * promotion. That is not hypothetical — the root that was missing from a
 * hand-run grep is the one CI failed on.
 */
export const TEST_ROOTS = Object.freeze([
  "scripts/local-dev/tests",
  "web/tests",
  "certification/playwright",
  "web/playwright",
]);

const TEST_EXT = new Set([".mjs", ".js", ".ts", ".tsx"]);

export function isTestFile(p) {
  return /\.(test|spec)\.[mc]?[jt]sx?$/.test(p) || /\.cert\.spec\.[jt]sx?$/.test(p);
}

/**
 * How a test must be run, which decides whether a red is about the code.
 *
 * `host` needs tmux and lanes; `live` needs a deployed target or a seeded
 * tenant; `repo_audit` reads repository files rather than exercising runtime,
 * so it passes or fails on the TREE and cannot run from an installed toolkit.
 * That last class is not pedantry — two such files were reported as runtime
 * failures during the hosted fixture work and were neither.
 */
export function classifyTest(absPath, text) {
  const name = absPath.split(sep).pop() || "";
  if (/^(deployed-|qa-|production-apply-|migration-|certification-)/.test(name)) return "live";
  if (/\.cert\.spec\./.test(name) || absPath.includes(`${sep}live${sep}`)) return "live";
  const tmux = /tmux/.test(text);
  const isolated = /ALLOY_RUNTIME_ROOT|mkdtemp/.test(text);
  if (tmux && !isolated) return "host";
  if (/readHostedFixture|readFileSync\(\s*`\$\{ROOT\}/.test(text)) return "repo_audit";
  return "deterministic";
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e.startsWith(".tmp-")) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (TEST_EXT.has(extname(p)) && isTestFile(p)) out.push(p);
  }
  return out;
}

/** Every test file in the repository, across every declared root. */
export function allTestFiles(repoRoot, roots = TEST_ROOTS) {
  const out = [];
  for (const r of roots) {
    const abs = join(repoRoot, r);
    if (existsSync(abs)) walk(abs, out);
  }
  return out.map((p) => relative(repoRoot, p)).sort();
}

/**
 * The names a test would use to refer to a changed file.
 *
 * Both the module basename and, for source files, the exported symbols —
 * because the sibling suite that cost PR 947 names the CONTRACT rather than the
 * path, and a path-only search cannot see it.
 */
export function referenceTokens(repoRoot, changedPath) {
  const base = (changedPath.split("/").pop() || "").replace(/\.(mjs|js|ts|tsx|sql|sh|ya?ml)$/, "");
  const tokens = new Set([base]);
  const abs = join(repoRoot, changedPath);
  if (/\.(mjs|js|ts|tsx)$/.test(changedPath) && existsSync(abs)) {
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      tokens.add(m[1]);
    }
    for (const m of text.matchAll(/^export\s*\{([^}]+)\}/gm)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) tokens.add(name);
      }
    }
  }
  // Short tokens match everything and therefore say nothing.
  return [...tokens].filter((t) => t.length >= 4);
}

/** Which tests mention anything the candidate changed, and how each must be run. */
export function expectedTestSurface(repoRoot, changedPaths, { roots = TEST_ROOTS } = {}) {
  const tests = allTestFiles(repoRoot, roots);
  const bodies = new Map();
  const rows = [];
  const bodyOf = (t) => {
    if (!bodies.has(t)) {
      try { bodies.set(t, readFileSync(join(repoRoot, t), "utf8")); } catch { bodies.set(t, ""); }
    }
    return bodies.get(t);
  };
  for (const changed of changedPaths) {
    if (isTestFile(changed)) {
      const abs = join(repoRoot, changed);
      const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
      rows.push({ test: changed, because: changed, via: "changed_directly", kind: classifyTest(abs, text) });
      continue;
    }
    const tokens = referenceTokens(repoRoot, changed);
    if (!tokens.length) continue;
    for (const t of tests) {
      const text = bodyOf(t);
      const hit = tokens.find((tok) => text.includes(tok));
      if (hit) rows.push({ test: t, because: changed, via: hit, kind: classifyTest(join(repoRoot, t), text) });
    }
  }
  const byTest = new Map();
  for (const row of rows) {
    const cur = byTest.get(row.test) || { test: row.test, kind: row.kind, reasons: [] };
    cur.reasons.push({ because: row.because, via: row.via });
    byTest.set(row.test, cur);
  }
  return [...byTest.values()].sort((a, b) => a.test.localeCompare(b.test));
}

/**
 * The subset of glob syntax GitHub path filters actually use here.
 *
 * Scanned once rather than built from chained `replace` calls. Both `**` and
 * `*` expand into patterns that themselves contain `*`, so successive
 * replacements rewrite each other's output; the first draft of this needed two
 * sentinel characters to stop that, which is a sign the approach was wrong.
 */
export function globMatches(glob, path) {
  let rx = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") { rx += "(?:.*/)?"; i += 2; } else { rx += ".*"; i += 1; }
      continue;
    }
    if (c === "*") { rx += "[^/]*"; continue; }
    if (c === "?") { rx += "[^/]"; continue; }
    rx += /[.+^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${rx}$`).test(path);
}

/**
 * Which workflows a candidate will actually trigger.
 *
 * Read from the workflow rather than remembered. A workflow with NO `paths:`
 * runs on everything, and saying so explicitly is the point — "no filter" is
 * the case people forget when they predict their own check set.
 */
export function expectedCheckClasses(repoRoot, changedPaths, { dir = ".github/workflows" } = {}) {
  const abs = join(repoRoot, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const f of readdirSync(abs).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const text = readFileSync(join(abs, f), "utf8");
    const name = (text.match(/^name:\s*(.+)$/m) || [])[1]?.trim() || f;
    if (!/^\s*pull_request:/m.test(text)) {
      out.push({ workflow: f, name, triggers: false, why: "not a pull_request workflow", matched: [] });
      continue;
    }
    const block = text.match(/^\s{2}pull_request:[\s\S]*?(?=^\s{2}\S|^\S)/m)?.[0] || "";
    const globs = [...block.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)]
      .map((m) => m[1].trim())
      .filter((g) => g.includes("/") || g.includes("*"));
    if (!globs.length) {
      out.push({ workflow: f, name, triggers: true, why: "no path filter — runs on every pull request", matched: [] });
      continue;
    }
    const matched = changedPaths.filter((p) => globs.some((g) => globMatches(g, p)));
    out.push({
      workflow: f,
      name,
      triggers: matched.length > 0,
      why: matched.length
        ? `path filter matched ${matched.length} changed file(s)`
        : "no changed file matched its path filter",
      matched,
    });
  }
  return out;
}

/** Files a candidate changes, from git rather than from a description of it. */
export function changedPaths(repoRoot, baseRef, headRef = "HEAD") {
  const out = execFileSync("git", ["-C", repoRoot, "diff", "--name-only", `${baseRef}...${headRef}`], { encoding: "utf8" });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** The whole discovery, as one answer. */
export function discoverImpact(repoRoot, { baseRef, headRef = "HEAD", paths = null, roots = TEST_ROOTS } = {}) {
  const changed = paths || changedPaths(repoRoot, baseRef, headRef);
  const surface = expectedTestSurface(repoRoot, changed, { roots });
  const checks = expectedCheckClasses(repoRoot, changed);
  const byKind = {};
  for (const s of surface) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  /*
   * A changed module whose name appears in no test at all is worth saying out
   * loud. It is either genuinely uncovered, or named in a way nothing
   * references — and both are things to know before promoting, not after.
   */
  const uncovered = changed.filter((c) => !isTestFile(c)
    && !surface.some((s) => s.reasons.some((r) => r.because === c)));
  return {
    changed_files: changed,
    expected_test_surface: surface,
    expected_check_classes: checks,
    test_kinds: byKind,
    changed_without_test_reference: uncovered,
    roots_searched: [...roots],
  };
}
