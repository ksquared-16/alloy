#!/usr/bin/env node
/**
 * Documentation validation for Alloy.
 *
 * Usage:
 *   node scripts/docs-lint.mjs                    # report all issues
 *   node scripts/docs-lint.mjs --ci               # enforce changed-file blocking rules
 *   node scripts/docs-lint.mjs --ci --base origin/staging
 *   node scripts/docs-lint.mjs --json
 *   node scripts/docs-lint.mjs --write-baseline   # refresh debt baseline (maintainers)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASELINE_PATH = path.join(__dirname, "docs-lint-baseline.json");

const STATUS_VOCABULARY = new Set([
  "canonical",
  "frozen",
  "proposed",
  "generated",
  "sprint",
  "historical",
  "superseded",
]);

const DOCS_ROOT_ALLOWED = new Set(["README.md"]);

const GOVERNED_GLOBS = [
  /^docs\/README\.md$/,
  /^docs\/platform\//,
  /^docs\/system\//,
  /^docs\/product\//,
];

const ACTIVE_CANONICAL_PREFIXES = [
  "docs/README.md",
  "docs/platform/",
  "docs/system/",
  "docs/product/",
];

const CANONICAL_LINK_SCOPES = [
  /^docs\/README\.md$/,
  /^docs\/platform\//,
  /^docs\/system\//,
];

const GENERATED_MARKERS = [
  { dir: "docs/schema/", pattern: /Generated reference|Do not edit by hand/i },
  { dir: "docs/api/", pattern: /Generated:|Do not edit by hand/i },
];

const BLOCKING_ON_CHANGED = new Set([
  "broken-link",
  "invalid-root-placement",
  "frontmatter-malformed",
  "frontmatter-missing",
  "superseded-missing-successor",
  "retired-doctrine-term",
]);

// --- Operational Expectations doctrine reconciliation guard (P0 / G-Reconciliation) ---
// The frozen two-ledger ontology reserves "Expectation" for the AUTHORED Operational
// Expectations ledger; the former derived "L3 Operational Expectations" layer is renamed
// "Projection", and Law 2 reads "Projections are derived / Expectations are authored".
// This guard is the standing CI form of G-Reconciliation's acceptance grep: no governed doc
// may (re)assert the retired derived-Expectation doctrine. See
// docs/platform/milestones/operational-expectations-doctrine-convergence.md (§4 retired usages).
const RETIRED_DOCTRINE_PATTERNS = [
  { re: /expectations are derived/i, label: '"Expectations are derived" (retired Law 2 wording)' },
  { re: /L3 (Operational )?Expectations/, label: '"L3 (Operational) Expectations" (retired derived-layer label)' },
  { re: /Operational Expectations \(derived\)/i, label: '"Operational Expectations (derived)" (retired label)' },
  { re: /Intent\s*(?:→|->)\s*(?:Operational\s+)?Expectations/i, label: '"Intent → Expectations" (retired truth-flow axis)' },
];

// Frozen corpus + governance docs whose purpose is to RECORD the reconciliation (they quote the
// retired terms as before-text, retired-usage warnings, or historical notes). They are exempt from
// the guard; every other governed doc is scanned. Keep this list minimal and evidence-backed.
const RECONCILIATION_RECORD_ALLOWLIST = new Set([
  "docs/platform/operational-expectations-system-design.md",
  "docs/platform/milestones/operational-expectations-doctrine-convergence.md",
  "docs/platform/milestones/operational-expectations-architecture-closeout.md",
  "docs/platform/milestones/operational-expectations-engineering-realization.md",
  "docs/platform/milestones/operational-expectations-implementation-program.md",
  "docs/platform/milestones/operational-expectations-p0-substrate-reconciliation.md",
  "docs/platform/core/operational-truth-flow-doctrine.md",
  "docs/platform/governance/glossary.md",
]);

export function scanRetiredDoctrine(relPath, text) {
  if (!isGovernedPath(relPath)) return [];
  if (RECONCILIATION_RECORD_ALLOWLIST.has(relPath)) return [];
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { re, label } of RETIRED_DOCTRINE_PATTERNS) {
      if (re.test(lines[i])) {
        out.push({
          type: "retired-doctrine-term",
          file: relPath,
          message: `Retired Operational Expectations doctrine at line ${i + 1}: ${label}. Use "Projection" for derived state; "Expectation" is reserved for the authored ledger.`,
          blocking: true,
          meta: { line: i + 1 },
        });
        break;
      }
    }
  }
  return out;
}

const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseArgs(argv) {
  const args = {
    ci: false,
    json: false,
    writeBaseline: false,
    base: "origin/staging",
    files: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ci") args.ci = true;
    else if (a === "--json") args.json = true;
    else if (a === "--write-baseline") args.writeBaseline = true;
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--files") args.files = argv[++i].split(",").filter(Boolean);
  }
  return args;
}

export function isMarkdownFile(filePath) {
  return filePath.endsWith(".md");
}

export function listMarkdownFiles(rootDir = ROOT) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (isMarkdownFile(entry.name)) out.push(path.relative(rootDir, abs).split(path.sep).join("/"));
    }
  }
  if (fs.existsSync(path.join(rootDir, "docs"))) walk(path.join(rootDir, "docs"));
  if (fs.existsSync(path.join(rootDir, "README.md"))) out.push("README.md");
  return out.sort();
}

export function parseFrontmatter(text) {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { raw: null, data: null, error: null };
  const body = match[1];
  const data = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) return { raw: body, data: null, error: `invalid frontmatter line: ${trimmed}` };
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { raw: body, data, error: null };
}

export function isGovernedPath(relPath) {
  return GOVERNED_GLOBS.some((re) => re.test(relPath));
}

export function isCanonicalLinkScope(relPath) {
  return CANONICAL_LINK_SCOPES.some((re) => re.test(relPath));
}

export function extractMarkdownLinks(text) {
  const links = [];
  for (const match of text.matchAll(LINK_RE)) {
    links.push({ label: match[1], target: match[2] });
  }
  return links;
}

export function resolveLink(fromFile, target, rootDir = ROOT) {
  if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) {
    return { kind: "external", exists: true };
  }
  const [rawPath, anchor] = target.split("#");
  if (!rawPath || rawPath === "#") return { kind: "anchor", exists: true, anchor };
  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, rawPath)).split(path.sep).join("/");
  if (resolved.endsWith("/")) {
    const dirCandidates = [resolved, `${resolved}README.md`];
    for (const candidate of dirCandidates) {
      const abs = path.join(rootDir, candidate);
      if (fs.existsSync(abs)) {
        const stat = fs.statSync(abs);
        if (stat.isDirectory() || (stat.isFile() && candidate.endsWith("README.md"))) {
          return { kind: stat.isDirectory() ? "dir" : "file", exists: true, resolved: candidate, anchor };
        }
      }
    }
    resolved = `${resolved}README.md`;
  }
  const candidates = [resolved];
  if (!resolved.endsWith(".md") && !resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) {
    candidates.push(`${resolved}.md`, `${resolved}.ts`, `${resolved}.tsx`);
  }
  for (const candidate of candidates) {
    const abs = path.join(rootDir, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { kind: "file", exists: true, resolved: candidate, anchor };
    }
  }
  return { kind: "file", exists: false, resolved: candidates[0], anchor };
}

function loadReadmeIndexedPaths(readmeText) {
  const indexed = new Set(["docs/README.md"]);
  for (const link of extractMarkdownLinks(readmeText)) {
    const resolved = resolveLink("docs/README.md", link.target);
    if (resolved.exists && resolved.resolved?.startsWith("docs/")) indexed.add(resolved.resolved);
  }
  for (const match of readmeText.matchAll(/`((?:platform|schema|governance|system|product|api)\/[^`\s]+)`/g)) {
    indexed.add(`docs/${match[1]}`);
    if (!match[1].endsWith(".md")) indexed.add(`docs/${match[1]}.md`);
  }
  return indexed;
}

function isGeneratedDoc(relPath, text) {
  if (!relPath.startsWith("docs/schema/") && !relPath.startsWith("docs/api/")) return false;
  const marker = GENERATED_MARKERS.find((m) => relPath.startsWith(m.dir));
  return marker ? marker.pattern.test(text) : false;
}

export function lintDocumentation(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const files = options.files ?? listMarkdownFiles(rootDir);
  const readmePath = "docs/README.md";
  const readmeText = fs.existsSync(path.join(rootDir, readmePath))
    ? fs.readFileSync(path.join(rootDir, readmePath), "utf8")
    : "";
  const indexedPaths = loadReadmeIndexedPaths(readmeText);

  const violations = [];
  const basenameIndex = new Map();

  for (const relPath of files) {
    const base = path.basename(relPath);
    if (!basenameIndex.has(base)) basenameIndex.set(base, []);
    basenameIndex.get(base).push(relPath);

    const abs = path.join(rootDir, relPath);
    const text = fs.readFileSync(abs, "utf8");

    const docsRootMatch = relPath.match(/^docs\/([^/]+\.md)$/);
    if (docsRootMatch && !DOCS_ROOT_ALLOWED.has(docsRootMatch[1])) {
      violations.push({
        type: "invalid-root-placement",
        file: relPath,
        message: `Markdown file at docs/ root is not permitted (allowed: ${[...DOCS_ROOT_ALLOWED].join(", ")})`,
        blocking: true,
      });
    }

    const fm = parseFrontmatter(text);
    const governed = isGovernedPath(relPath);
    if (governed) {
      if (!fm.data) {
        violations.push({
          type: fm.error ? "frontmatter-malformed" : "frontmatter-missing",
          file: relPath,
          message: fm.error ?? "Governed document requires YAML frontmatter",
          blocking: true,
        });
      } else {
        if (fm.error) {
          violations.push({
            type: "frontmatter-malformed",
            file: relPath,
            message: fm.error,
            blocking: true,
          });
        }
        if (fm.data.status && !STATUS_VOCABULARY.has(String(fm.data.status))) {
          violations.push({
            type: "frontmatter-malformed",
            file: relPath,
            message: `Unknown status '${fm.data.status}'`,
            blocking: true,
          });
        }
        if (fm.data.status === "superseded" && !fm.data.superseded_by) {
          violations.push({
            type: "superseded-missing-successor",
            file: relPath,
            message: "status: superseded requires superseded_by",
            blocking: true,
          });
        }
      }
    }

    if (
      relPath.startsWith("docs/platform/") &&
      fm.data?.status === "superseded" &&
      !text.includes("> **Superseded")
    ) {
      violations.push({
        type: "superseded-in-canonical-tree",
        file: relPath,
        message: "Superseded doctrine remains in docs/platform/ without banner",
        blocking: false,
      });
    }

    if (relPath.startsWith("docs/platform/") && relPath.endsWith(".md") && !indexedPaths.has(relPath)) {
      violations.push({
        type: "orphan-canonical",
        file: relPath,
        message: "Canonical platform doc not referenced from docs/README.md",
        blocking: false,
      });
    }

    if ((relPath.startsWith("docs/schema/") || relPath.startsWith("docs/api/")) && !isGeneratedDoc(relPath, text)) {
      violations.push({
        type: "generated-boundary",
        file: relPath,
        message: "Generated reference doc missing generator marker",
        blocking: false,
      });
    }

    violations.push(...scanRetiredDoctrine(relPath, text));

    for (const link of extractMarkdownLinks(text)) {
      const resolved = resolveLink(relPath, link.target, rootDir);
      if (resolved.kind === "external" || resolved.kind === "anchor") continue;
      if (!resolved.exists) {
        violations.push({
          type: "broken-link",
          file: relPath,
          message: `Broken link '${link.target}' → ${resolved.resolved}`,
          blocking: isCanonicalLinkScope(relPath),
        });
      }
      if (
        relPath.startsWith("docs/platform/") &&
        (link.target.includes("sprints/") || resolved.resolved?.includes("/sprints/"))
      ) {
        violations.push({
          type: "canonical-sprint-dependency",
          file: relPath,
          message: `Canonical doc links to sprint artifact '${link.target}'`,
          blocking: false,
        });
      }
    }
  }

  for (const [base, paths] of basenameIndex.entries()) {
    if (paths.length <= 1 || base === "README.md") continue;
    const activePaths = paths.filter((p) => ACTIVE_CANONICAL_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix)));
    if (activePaths.length < 2) continue;
    violations.push({
      type: "duplicate-basename",
      file: activePaths[0],
      message: `Duplicate basename '${base}' among active canonical docs: ${activePaths.join(", ")}`,
      blocking: false,
      meta: { basename: base, paths: activePaths },
    });
  }

  return violations;
}

function changedFiles(baseRef, rootDir = ROOT) {
  try {
    const out = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.endsWith(".md"));
  } catch {
    return [];
  }
}

function summarize(violations) {
  const summary = {};
  for (const v of violations) {
    summary[v.type] = (summary[v.type] ?? 0) + 1;
  }
  return summary;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function filterChangedViolations(violations, changed) {
  const changedSet = new Set(changed);
  return violations.filter((v) => changedSet.has(v.file));
}

function evaluateCi(violations, changed, baseline) {
  const changedViolations = filterChangedViolations(violations, changed);
  const blockingFailures = changedViolations.filter(
    (v) => BLOCKING_ON_CHANGED.has(v.type) && (v.blocking ?? true),
  );

  const currentSummary = summarize(violations);
  const debtIncreases = [];
  if (baseline?.summary) {
    for (const [type, count] of Object.entries(currentSummary)) {
      const baseCount = baseline.summary[type] ?? 0;
      if (count > baseCount) debtIncreases.push({ type, from: baseCount, to: count });
    }
  }

  return { blockingFailures, changedViolations, debtIncreases, currentSummary };
}

function printHumanReport(result) {
  const { violations, summary, blockingFailures, debtIncreases, mode } = result;
  console.log(`docs-lint (${mode})`);
  console.log("Summary:", summary);
  if (debtIncreases?.length) {
    console.log("\nDebt increased vs baseline:");
    for (const d of debtIncreases) console.log(`  - ${d.type}: ${d.from} → ${d.to}`);
  }
  if (blockingFailures?.length) {
    console.log("\nBlocking failures (changed files):");
    for (const v of blockingFailures.slice(0, 50)) {
      console.log(`  [${v.type}] ${v.file}: ${v.message}`);
    }
    if (blockingFailures.length > 50) console.log(`  …and ${blockingFailures.length - 50} more`);
  } else if (mode === "ci") {
    console.log("\nNo blocking failures in changed governed files.");
  }
  if (!result.ci && violations.length) {
    console.log("\nSample report issues:");
    for (const v of violations.slice(0, 25)) {
      console.log(`  [${v.type}] ${v.file}: ${v.message}`);
    }
    if (violations.length > 25) console.log(`  …and ${violations.length - 25} more`);
  }
}

export function main(argv = process.argv) {
  const args = parseArgs(argv);
  const violations = lintDocumentation({ rootDir: ROOT, files: args.files ? args.files : undefined });
  const summary = summarize(violations);

  if (args.writeBaseline) {
    const payload = {
      generatedAt: new Date().toISOString(),
      summary,
      note: "Pre-existing documentation debt baseline for report-only CI enforcement",
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Wrote baseline ${BASELINE_PATH}`);
    console.log(summary);
    return 0;
  }

  const baseline = loadBaseline();
  let exitCode = 0;
  let blockingFailures = [];
  let debtIncreases = [];
  let changed = [];

  if (args.ci) {
    changed = args.files ?? changedFiles(args.base, ROOT);
    const evalResult = evaluateCi(violations, changed, baseline);
    blockingFailures = evalResult.blockingFailures;
    debtIncreases = evalResult.debtIncreases;
    if (blockingFailures.length) exitCode = 1;
  }

  const result = {
    mode: args.ci ? "ci" : "report",
    summary,
    violations,
    blockingFailures,
    debtIncreases,
    changedCount: changed.length,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReport(result);
  }

  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
