#!/usr/bin/env node
/**
 * Apply documentation path migrations across markdown files.
 * Usage: node scripts/docs-path-migrate.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** old substring => new substring (applied to link targets and backtick paths) */
const REPLACEMENTS = [
  // Data system promotion (Part A)
  ["docs/canonical-data-system.md", "docs/platform/core/data/data-system.md"],
  ["canonical-data-system.md", "platform/core/data/data-system.md"],
  ["docs/canonical-entity-specification.md", "docs/platform/core/data/entity-specification.md"],
  ["canonical-entity-specification.md", "platform/core/data/entity-specification.md"],
  ["docs/canonical-relationship-model.md", "docs/platform/core/data/relationship-model.md"],
  ["canonical-relationship-model.md", "platform/core/data/relationship-model.md"],
  ["docs/canonical-field-catalog.md", "docs/platform/core/data/field-catalog.md"],
  ["canonical-field-catalog.md", "platform/core/data/field-catalog.md"],
  ["docs/universal-field-system.md", "platform/core/data/field-system.md"],
  ["universal-field-system.md", "platform/core/data/field-system.md"],
  ["docs/canonical-status-architecture.md", "docs/platform/core/data/status-architecture.md"],
  ["canonical-status-architecture.md", "platform/core/data/status-architecture.md"],
  ["docs/canonical-action-status-field-matrix.md", "docs/platform/core/data/action-status-field-matrix.md"],
  ["canonical-action-status-field-matrix.md", "platform/core/data/action-status-field-matrix.md"],
  ["docs/canonical-configuration-data-alignment.md", "docs/platform/core/data/configuration-data-alignment.md"],
  ["canonical-configuration-data-alignment.md", "platform/core/data/configuration-data-alignment.md"],
  ["docs/canonical-runtime-data-alignment.md", "docs/platform/core/data/runtime-data-alignment.md"],
  ["canonical-runtime-data-alignment.md", "platform/core/data/runtime-data-alignment.md"],
  // Operational doctrines to core (Part E)
  ["docs/platform/operational-truth-flow-doctrine.md", "docs/platform/core/operational-truth-flow-doctrine.md"],
  ["platform/operational-truth-flow-doctrine.md", "platform/core/operational-truth-flow-doctrine.md"],
  ["docs/platform/operational-ux-doctrine.md", "docs/platform/core/operational-ux-doctrine.md"],
  ["platform/operational-ux-doctrine.md", "platform/core/operational-ux-doctrine.md"],
  // Milestones (Part D)
  ["platform/foundation/platform-certification-july-2026.md", "platform/milestones/certification-july-2026.md"],
  ["docs/platform/foundation/platform-certification-july-2026.md", "docs/platform/milestones/certification-july-2026.md"],
  ["platform/foundation/platform-freeze-july-2026.md", "platform/milestones/freeze-july-2026.md"],
  ["docs/platform/foundation/platform-freeze-july-2026.md", "docs/platform/milestones/freeze-july-2026.md"],
  ["platform/milestones/platform-stabilization-july-2026.md", "platform/milestones/stabilization-july-2026.md"],
  // Platform capabilities rename (Part E)
  ["platform/platform-capabilities.md", "platform/foundation/capability-model-doctrine.md"],
  ["docs/platform/platform-capabilities.md", "docs/platform/foundation/capability-model-doctrine.md"],
  // Governance consolidation (Part G)
  ["docs/governance/agent-repo-boundaries.md", "docs/platform/governance/agent-repo-boundaries.md"],
  ["governance/agent-repo-boundaries.md", "platform/governance/agent-repo-boundaries.md"],
  ["docs/governance/workspace-orchestration.md", "docs/platform/governance/workspace-orchestration.md"],
  ["docs/governance/typescript-performance.md", "docs/platform/governance/typescript-performance.md"],
  // Sprint evictions (Part C)
  ["docs/platform/premium-operational-experience/", "docs/sprints/archive/06_2026/premium-operational-experience/"],
  ["platform/premium-operational-experience/", "sprints/archive/06_2026/premium-operational-experience/"],
  ["docs/platform/operational-expansion-wave1-cursor-execution-packet.md", "docs/sprints/archive/06_2026/operational-expansion/wave1-cursor-execution-packet.md"],
  ["docs/platform/operational-expansion-wave1-implementation-spec.md", "docs/sprints/archive/06_2026/operational-expansion/wave1-implementation-spec.md"],
  ["docs/platform/operational-expansion-phase1-architecture-rfc.md", "docs/platform/rfcs/operational-expansion-phase1.md"],
  // Experience closeouts (Part C)
  ["docs/platform/experience/presentation-runtime-v2-handoff.md", "docs/sprints/completed/presentation-runtime-v2/handoff.md"],
  ["docs/platform/experience/presentation-runtime-v2-focus-panel-surface-composer-closeout.md", "docs/sprints/completed/presentation-runtime-v2/focus-panel-surface-composer-closeout.md"],
  // Runtime closeout (Part C)
  ["docs/platform/runtime/work-unit-runtime-simplification-closeout.md", "docs/sprints/completed/work-unit-runtime-simplification-closeout.md"],
  // Programs to commercial (Part G)
  ["docs/platform/programs/program-offerings.md", "docs/platform/commercial/program-offerings.md"],
  ["platform/programs/program-offerings.md", "platform/commercial/program-offerings.md"],
  // Card archetypes merge survivor
  ["platform/operator/card-archetypes.md", "platform/operator/universal-card-archetypes.md"],
  // System duplicates archive
  ["docs/system/entity-model.md", "docs/archive/2026-06-superseded-system/entity-model.md"],
  ["docs/system/record-system.md", "docs/archive/2026-06-superseded-system/record-system.md"],
  ["docs/system/actions-and-workflows.md", "docs/archive/2026-06-superseded-system/actions-and-workflows.md"],
  ["docs/system/navigation-doctrine.md", "docs/archive/2026-06-superseded-system/navigation-doctrine.md"],
  ["docs/system/workspace-system.md", "docs/archive/2026-06-superseded-system/workspace-system.md"],
  ["docs/system/api-contracts.md", "docs/archive/2026-06-superseded-system/api-contracts.md"],
  ["docs/system/roles-and-permissions.md", "docs/archive/2026-06-superseded-system/roles-and-permissions.md"],
  // Relative path fixes after restructuring
  ["../operational-ux-doctrine.md", "../core/operational-ux-doctrine.md"],
  ["../operational-truth-flow-doctrine.md", "../core/operational-truth-flow-doctrine.md"],
  ["../../operational-ux-doctrine.md", "../../core/operational-ux-doctrine.md"],
  ["../../operational-truth-flow-doctrine.md", "../../core/operational-truth-flow-doctrine.md"],
  ["../milestones/platform-stabilization-july-2026.md", "../milestones/stabilization-july-2026.md"],
  ["../../milestones/platform-stabilization-july-2026.md", "../../milestones/stabilization-july-2026.md"],
  ["./platform-freeze-july-2026.md", "../milestones/freeze-july-2026.md"],
  ["./platform-certification-july-2026.md", "../milestones/certification-july-2026.md"],
  ["platform-freeze-july-2026.md", "milestones/freeze-july-2026.md"],
  ["platform-certification-july-2026.md", "milestones/certification-july-2026.md"],
  ["../operational-expansion-phase1-architecture-rfc.md", "../rfcs/operational-expansion-phase1.md"],
  ["./card-archetypes.md", "./universal-card-archetypes.md"],
  ["card-archetypes.md", "universal-card-archetypes.md"],
  ["docs/platform_convergence/", "docs/archive/2026-06-runtime-convergence/platform_convergence/"],
  ["platform_convergence/", "archive/2026-06-runtime-convergence/platform_convergence/"],
  ["docs/handoffs/", "docs/archive/2026-06-handoffs/handoffs/"],
  ["../../handoffs/", "../../archive/2026-06-handoffs/handoffs/"],
  ["sprints/05_2026/", "sprints/archive/05_2026/"],
  ["sprints/06_2026/", "sprints/archive/06_2026/"],
  ["sprints/07_2026/", "sprints/archive/07_2026/"],
  ["sprints/08_2026/", "sprints/archive/08_2026/"],
  ["../sprints/06_2026/", "../sprints/archive/06_2026/"],
  ["../../sprints/06_2026/", "../../sprints/archive/06_2026/"],
  ["../../../sprints/06_2026/", "../../../sprints/archive/06_2026/"],
  ["../sprints/07_2026/", "../sprints/archive/07_2026/"],
  ["../../sprints/07_2026/", "../../sprints/archive/07_2026/"],
  ["../sprints/08_2026/", "../sprints/archive/08_2026/"],
  ["../../sprints/08_2026/", "../../sprints/archive/08_2026/"],
  ["../../product/documents-and-forms.md", "../../platform/modules/documents-and-forms.md"],
  ["../../product/communications.md", "../../archive/2026-06-product/communications.md"],
  ["../../product/billing-and-financials.md", "../../archive/2026-06-product/billing-and-financials.md"],
  ["docs/export/", "docs/archive/2026-06-handoff-packs/"],
  ["docs/core/glossary.md", "docs/platform/governance/glossary.md"],
  ["docs/core/system-overview.md", "docs/platform/foundation/system-overview.md"],
  ["core/glossary.md", "platform/governance/glossary.md"],
  ["core/system-overview.md", "platform/foundation/system-overview.md"],
  ["docs/governance/", "docs/platform/governance/"],
  ["presentation-runtime-doctrine.md", "archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md"],
  ["../operator/presentation-runtime-doctrine.md", "../../archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md"],
];

function listMarkdownFiles(dir) {
  const out = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md") || e.name.endsWith(".mdc") || e.name.endsWith(".ts")) out.push(p);
    }
  }
  for (const base of ["docs", "web", ".cursor", "README.md", "scripts"]) {
    const p = path.join(ROOT, base);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isFile()) out.push(p);
    else walk(p);
  }
  return out;
}

function applyReplacements(text) {
  let result = text;
  let changed = false;
  // Sort longest first to avoid partial replacements
  const sorted = [...REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  for (const [oldPath, newPath] of sorted) {
    if (result.includes(oldPath)) {
      result = result.split(oldPath).join(newPath);
      changed = true;
    }
  }
  return { result, changed };
}

let filesChanged = 0;
for (const file of listMarkdownFiles(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  const { result, changed } = applyReplacements(text);
  if (changed) {
    fs.writeFileSync(file, result, "utf8");
    filesChanged++;
  }
}
console.log(`Updated ${filesChanged} files`);
