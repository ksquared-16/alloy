#!/usr/bin/env node
/**
 * Final hardening pass — fix active canonical link corruption and sprint dependencies.
 * Usage: node scripts/docs-hardening-fixes.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const REPLACEMENTS = [
  ["universal-universal-card-archetypes", "universal-card-archetypes"],
  ["./archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md", "../../archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md"],
  ["../foundation/runtime-architecture-map.md", "../foundation/os-runtime-map.md"],
  ["../../foundation/runtime-architecture-map.md", "../../foundation/os-runtime-map.md"],
  ["./platform-manifesto.md", "../foundation/platform-manifesto.md"],
  ["./system-overview.md", "../foundation/system-overview.md"],
  ["./platform-capabilities.md", "../foundation/platform-capabilities.md"],
  ["foundation/platform-capabilities.md", "../foundation/platform-capabilities.md"],
  ["foundation/architecture.md", "./architecture.md"],
  ["../api/", "../../api/"],
  ["./modules/operational-consumption-platform.md", "../modules/operational-consumption-platform.md"],
  ["./operator/", "../operator/"],
  ["./milestones/platform-stabilization-july-2026.md", "../milestones/stabilization-july-2026.md"],
  ["platform/runtime/enrollment-process-runtime.md", "../../runtime/enrollment-process-runtime.md"],
  ["../rfcs/operational-expansion-phase1-architecture-rfc.md", "../rfcs/operational-expansion-phase1.md"],
  ["../archive/2026-06-runtime-convergence/", "../../archive/2026-06-runtime-convergence/"],
  ["../product/billing-and-financials.md", "../modules/billing-financials-platform.md"],
  ["../../governance/typescript-performance.md", "../governance/typescript-performance.md"],
  ["../foundation/milestones/certification-july-2026.md", "./certification-july-2026.md"],
  ["../../archive/2026-06-presentation-runtime/archive/2026-06-presentation-runtime/", "../../archive/2026-06-presentation-runtime/"],
  ["../runtime/operational-runtime-topology.md", "../../archive/2026-06-runtime/operational-runtime-topology.md"],
  ["../operational-expansion-wave1-implementation-spec.md", "../../sprints/archive/06_2026/operational-expansion/wave1-implementation-spec.md"],
  ["../audits/operational-expansion-architecture-audit-2026-07.md", "../../audits/active/operational-expansion-architecture-audit-2026-07.md"],
  ["../../audits/supabase-schema-alignment-audit.md", "../../audits/active/supabase-schema-alignment-audit.md"],
  ["../../sprints/2026-07/", "../../sprints/archive/2026-07/"],
  ["commercial-configuration.md)", "../modules/commercial-configuration.md)"],
  ["./record-system.md", "../../platform/core/record-system.md"],
  ["./workspace-system.md", "../../platform/core/navigation-and-workspace-doctrine.md"],
  ["./work-unit-runtime-simplification-closeout.md", "../../sprints/completed/work-unit-runtime-simplification-closeout.md"],
];

/** Convert markdown sprint links to backtick historical references in platform/system docs */
function neutralizeSprintLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)\s]*sprints\/[^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, target) => {
    return `${label} (historical: \`${target}\`)`;
  });
}

function inferOwner(filePath) {
  if (filePath.startsWith("docs/platform/operator/")) return "operator";
  if (filePath.startsWith("docs/platform/experience/")) return "experience";
  if (filePath.startsWith("docs/platform/modules/")) return "modules";
  if (filePath.startsWith("docs/platform/governance/")) return "platform";
  if (filePath.startsWith("docs/platform/milestones/")) return "platform";
  if (filePath.startsWith("docs/platform/rfcs/")) return "platform";
  if (filePath.startsWith("docs/platform/foundation/")) return "platform";
  if (filePath.startsWith("docs/platform/core/data/")) return "platform";
  if (filePath.startsWith("docs/platform/core/")) return "platform";
  if (filePath.startsWith("docs/platform/commercial/")) return "commercial";
  if (filePath.startsWith("docs/platform/runtime/")) return "runtime";
  if (filePath.startsWith("docs/platform/analytics/")) return "analytics";
  if (filePath.startsWith("docs/system/")) return "runtime";
  if (filePath.startsWith("docs/product/")) return "product";
  if (filePath === "docs/README.md") return "platform";
  return "platform";
}

function inferStatus(filePath) {
  if (filePath.includes("/milestones/") || filePath.includes("freeze-july")) return "frozen";
  if (filePath.startsWith("docs/product/")) return "proposed";
  if (filePath.startsWith("docs/system/")) return "frozen";
  return "canonical";
}

function addFrontmatterIfMissing(filePath, text) {
  if (text.startsWith("---\n")) return text;
  const owner = inferOwner(filePath);
  const status = inferStatus(filePath);
  const fm = `---\nowner: ${owner}\nstatus: ${status}\nlast_reviewed: 2026-07-12\nsupersedes: []\n---\n\n`;
  return fm + text;
}

function walkMd(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function shouldHarden(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join("/");
  return (
    rel === "docs/README.md" ||
    rel.startsWith("docs/platform/") ||
    rel.startsWith("docs/system/") ||
    rel.startsWith("docs/product/")
  );
}

let changed = 0;
const targets = [
  path.join(ROOT, "docs/README.md"),
  ...walkMd(path.join(ROOT, "docs/platform")),
  ...walkMd(path.join(ROOT, "docs/system")),
  ...walkMd(path.join(ROOT, "docs/product")),
];

for (const abs of targets) {
  if (!shouldHarden(abs)) continue;
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  let text = fs.readFileSync(abs, "utf8");
  let next = text;
  const sorted = [...REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  next = neutralizeSprintLinks(next);
  next = addFrontmatterIfMissing(rel, next);
  if (next !== text) {
    fs.writeFileSync(abs, next, "utf8");
    changed++;
  }
}

console.log(`Hardened ${changed} files`);
