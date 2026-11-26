#!/usr/bin/env node
/**
 * Alloy Product Runtime V1 — deterministic audit and contract artifacts.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";

const STOP_WORDS = new Set([
  "alloy", "and", "with", "from", "that", "this", "through", "using",
  "into", "without", "before", "after", "product", "operator", "system",
  "settings", "configuration", "provide", "improve", "complete",
]);

function die(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function quote(value) {
  return JSON.stringify(String(value ?? ""));
}

function cleanListItem(value) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  return text.replace(/^(?:[-*+]\s+)+/, "").trim();
}

function markdownList(values, empty = "None") {
  const cleaned = (values ?? []).map(cleanListItem).filter(Boolean);
  return cleaned.length ? cleaned.map((value) => `- ${value}`).join("\n") : `- ${empty}`;
}

function yamlList(values, indent = 0) {
  const pad = " ".repeat(indent);
  const cleaned = (values ?? []).map(cleanListItem).filter(Boolean);
  return cleaned.length ? cleaned.map((value) => `${pad}- ${quote(value)}`).join("\n") : `${pad}[]`;
}

function yamlObjectList(items, fields, indent = 0) {
  const pad = " ".repeat(indent);
  if (!items.length) return `${pad}[]`;
  return items.map((item) => fields.map((field, index) => {
    const prefix = index === 0 ? `${pad}- ` : `${pad}  `;
    const value = item[field];
    if (Array.isArray(value)) {
      const nested = value.length
        ? value.map((entry) => `${pad}    - ${quote(entry)}`).join("\n")
        : `${pad}    []`;
      return `${prefix}${field}:\n${nested}`;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return `${prefix}${field}: ${value}`;
    }
    return `${prefix}${field}: ${quote(value ?? "")}`;
  }).join("\n")).join("\n");
}

function termsFromBrief(brief) {
  const source = [
    brief.product?.title,
    brief.product?.summary,
    ...(brief.product_direction ?? []),
    ...(brief.operator_outcomes ?? []),
    ...(brief.jobs_to_be_done ?? []),
  ].join(" ");
  const terms = source.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
  return [...new Set(terms.filter((term) => !STOP_WORDS.has(term)))].slice(0, 12);
}

function safeRead(path, max = 128_000) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > max) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function boundedFiles(root, roots, maxFiles = 5000) {
  const output = [];
  const ignored = new Set([
    ".git", "node_modules", ".next", "coverage", "dist", "build",
    "docs/archive", "docs/sprints/archive",
  ]);
  function walk(abs, rel) {
    if (output.length >= maxFiles) return;
    const normalized = rel.split(sep).join("/");
    if ([...ignored].some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return;
    let entries = [];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (output.length >= maxFiles) break;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) output.push(childRel);
    }
  }
  for (const relRoot of roots) {
    const abs = join(root, relRoot);
    if (existsSync(abs)) walk(abs, relRoot);
  }
  return output;
}

function scorePath(path, terms, root) {
  const lowerPath = path.toLowerCase();
  const content = safeRead(join(root, path), 96_000).toLowerCase();
  let score = 0;
  const matched = [];
  for (const term of terms) {
    if (lowerPath.includes(term)) {
      score += 4;
      matched.push(term);
    } else if (content.includes(term)) {
      score += 1;
      matched.push(term);
    }
  }
  return { score, matched: [...new Set(matched)] };
}

function classificationFor(path) {
  if (path.startsWith("docs/platform/")) return "canonical_documentation";
  if (path.startsWith("docs/system/")) return "runtime_doctrine";
  if (path.startsWith("docs/sprints/") || path.startsWith("docs/archive/")) return "historical_context";
  if (/test|spec/i.test(path)) return "related_test";
  if (path.startsWith("web/")) return "implementation_candidate";
  return "repository_reference";
}

function authorityFor(path, classification) {
  if (classification === "canonical_documentation") return "canonical";
  if (classification === "historical_context") return "historical";
  if (classification === "implementation_candidate") return "current_implementation";
  if (/\.(png|jpg|jpeg|webp|svg)$/i.test(path)) return "reference_only";
  return "canonical";
}

function canonicalDefaults() {
  return [
    ["docs/README.md", "Canonical documentation navigation and authority ordering."],
    ["docs/platform/foundation/alloy-platform-handbook.md", "Canonical platform framing."],
    ["docs/platform/governance/design-and-operational-doctrine.md", "Behavior-change invariants."],
    ["docs/platform/governance/documentation-governance.md", "Canonical vs historical precedence."],
    ["docs/platform/operator/drawer-system.md", "Operator drawer interaction doctrine."],
    ["docs/platform/operator/queue-system.md", "Queue preview/selection doctrine."],
    ["docs/platform/modules/configuration-platform.md", "Configuration platform doctrine."],
  ];
}

function visualDoctrineDefaults() {
  return [
    ["docs/platform/governance/design-and-operational-doctrine.md", "Visual and interaction guardrails."],
  ];
}

function audit({ repo, briefPath, outputDir, stagingSha }) {
  const brief = readJson(briefPath);
  const terms = termsFromBrief(brief);
  const allFiles = boundedFiles(repo, ["docs", "web", "scripts/local-dev"]);

  const explicitDocs = brief.reference_docs ?? [];
  const explicitFiles = [
    ...(brief.reference_files ?? []),
    ...(brief.reference_components ?? []),
  ];
  const requestedRoutes = brief.reference_routes ?? [];
  const visualRefs = brief.visual_references ?? [];

  const doctrine = [];
  const seen = new Set();
  function addEntry(list, path, classification, reason, source, confidence) {
    if (seen.has(`${list}:${path}`)) return;
    seen.add(`${list}:${path}`);
    list.push({
      path,
      classification,
      relevance_reason: reason,
      source,
      confidence,
      authority: authorityFor(path, classification),
    });
  }

  for (const [path, reason] of canonicalDefaults()) {
    if (existsSync(join(repo, path))) {
      addEntry(doctrine, path, classificationFor(path), reason, "discovered", "confirmed");
    }
  }
  for (const path of explicitDocs) {
    addEntry(
      doctrine,
      path,
      classificationFor(path),
      `Explicitly supplied in Product Brief as reference_docs.`,
      "explicit",
      existsSync(join(repo, path)) ? "confirmed" : "candidate",
    );
  }

  const surfaces = [];
  for (const route of requestedRoutes) {
    addEntry(
      surfaces,
      route,
      "reference_route",
      "Explicitly supplied reference route in Product Brief.",
      "explicit",
      "confirmed",
    );
  }
  for (const path of explicitFiles) {
    addEntry(
      surfaces,
      path,
      classificationFor(path),
      "Explicitly supplied reference file/component in Product Brief.",
      "explicit",
      existsSync(join(repo, path)) ? "confirmed" : "candidate",
    );
  }
  const candidates = allFiles
    .filter((path) => path.startsWith("web/"))
    .map((path) => ({ path, ...scorePath(path, terms, repo) }))
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 20);
  for (const entry of candidates) {
    addEntry(
      surfaces,
      entry.path,
      classificationFor(entry.path),
      `Candidate matched bounded search terms: ${entry.matched.join(", ") || "n/a"}.`,
      "discovered",
      "candidate",
    );
  }

  const visual = [];
  for (const path of visualRefs) {
    addEntry(
      visual,
      path,
      /\.(png|jpg|jpeg|webp|svg)$/i.test(path) ? "screenshot_mockup" : "visual_reference",
      "Explicitly supplied visual reference in Product Brief.",
      "explicit",
      existsSync(join(repo, path)) ? "confirmed" : "candidate",
    );
  }
  for (const [path, reason] of visualDoctrineDefaults()) {
    if (existsSync(join(repo, path))) {
      addEntry(visual, path, "visual_doctrine", reason, "discovered", "confirmed");
    }
  }

  const risks = [];
  const missing = [];
  if (!explicitDocs.length && !requestedRoutes.length) {
    missing.push("No explicit reference_docs or reference_routes supplied.");
  }
  if (!visualRefs.length && !brief.visual_basis) {
    risks.push({
      id: "risk-visual-basis-missing",
      severity: "high",
      summary: "No visual_basis or visual_references supplied for user-visible work.",
      mitigation: "Choose exact_reference, pattern_reference, or bounded_exploration before approval.",
    });
  }
  const legacy = surfaces.filter((s) => /(legacy|compat|deprecated|archive|old)/i.test(s.path));
  for (const item of legacy) {
    risks.push({
      id: `risk-legacy-${item.path.replace(/[^a-z0-9]+/gi, "-")}`,
      severity: "medium",
      summary: `Possible legacy surface: ${item.path}`,
      mitigation: "Confirm with canonical doctrine before inheriting pattern.",
    });
  }

  const referencesMd = [
    `# Product audit references — ${brief.product.key}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Staging baseline: ${stagingSha}`,
    "",
    "## Search terms (bounded)",
    markdownList(terms),
    "",
    "## Explicit references",
    markdownList([
      ...explicitDocs.map((d) => `doc: ${d}`),
      ...requestedRoutes.map((r) => `route: ${r}`),
      ...explicitFiles.map((f) => `file: ${f}`),
      ...visualRefs.map((v) => `visual: ${v}`),
    ], "None supplied"),
    "",
    "## Missing information",
    markdownList(missing, "None"),
    "",
    "## Conflicts / ambiguity",
    markdownList(legacy.map((l) => `${l.path} — candidate legacy surface`), "None identified"),
  ].join("\n");

  write(join(outputDir, "references.md"), referencesMd);
  write(join(outputDir, "doctrine-manifest.yaml"), [
    "generated_at: " + quote(new Date().toISOString()),
    "staging_sha: " + quote(stagingSha),
    "entries:",
    yamlObjectList(doctrine, ["path", "classification", "relevance_reason", "source", "confidence", "authority"], 2),
  ].join("\n"));
  write(join(outputDir, "surface-manifest.yaml"), [
    "generated_at: " + quote(new Date().toISOString()),
    "entries:",
    yamlObjectList(surfaces, ["path", "classification", "relevance_reason", "source", "confidence", "authority"], 2),
  ].join("\n"));
  write(join(outputDir, "visual-reference-manifest.yaml"), [
    "generated_at: " + quote(new Date().toISOString()),
    "entries:",
    yamlObjectList(visual, ["path", "classification", "relevance_reason", "source", "confidence", "authority"], 2),
  ].join("\n"));
  write(join(outputDir, "risks.yaml"), [
    "generated_at: " + quote(new Date().toISOString()),
    "risks:",
    risks.length
      ? risks.map((r) => `  - id: ${quote(r.id)}\n    severity: ${quote(r.severity)}\n    summary: ${quote(r.summary)}\n    mitigation: ${quote(r.mitigation)}`).join("\n")
      : "  []",
    "missing_information:",
    yamlList(missing, 2),
  ].join("\n"));

  return JSON.stringify({
    doctrine_count: doctrine.length,
    surface_count: surfaces.length,
    visual_count: visual.length,
    risk_count: risks.length,
    missing_count: missing.length,
    blocking_decisions: risks.filter((r) => r.severity === "high").map((r) => r.summary),
  });
}

const VAGUE_ADJECTIVES = [
  "premium", "compact", "calm", "polished", "configuration-like",
  "modern", "elegant", "sleek", "beautiful", "intuitive", "clean",
];

function detectVague(text) {
  const lower = String(text ?? "").toLowerCase();
  return VAGUE_ADJECTIVES.filter((adj) => lower.includes(adj));
}

function inferVisualBasis(brief) {
  if (brief.visual_basis && typeof brief.visual_basis === "object") {
    return {
      type: brief.visual_basis.type ?? "pattern_reference",
      approval_status: "proposed",
    };
  }
  if ((brief.visual_references ?? []).length) {
    return { type: "exact_reference", approval_status: "proposed" };
  }
  if ((brief.reference_routes ?? []).length || (brief.reference_components ?? []).length) {
    return { type: "pattern_reference", approval_status: "proposed" };
  }
  return null;
}

function contract({ briefPath, auditDir, contractDir, decisionsDir }) {
  const brief = readJson(briefPath);
  const key = brief.product.key;
  const visualBasis = inferVisualBasis(brief);
  const proposedDecisions = [];
  let decisionNum = 1;

  const vagueSources = [
    ...brief.product_direction,
    ...(brief.density_expectations ?? []),
    ...(brief.interaction_expectations ?? []),
    brief.visual_basis?.constraints ?? "",
  ].join(" ");
  const vague = detectVague(vagueSources);
  for (const adj of vague) {
    proposedDecisions.push({
      decision_id: `decision-${String(decisionNum++).padStart(3, "0")}`,
      question: `Translate vague visual direction "${adj}" into measurable rules or choose a reference surface.`,
      category: "visual_direction",
      why_it_matters: "Vague adjectives cannot serve as acceptance criteria without explicit translation.",
      options: [
        "Supply exact reference screenshot/mockup",
        "Name an existing Alloy surface as pattern reference",
        "Define measurable layout/density rules",
      ],
      recommendation: "Name a pattern reference or supply exact visual reference.",
      affected_contract_sections: ["visual_contract", "ux_contract", "acceptance"],
      blocking: true,
      work_that_can_continue: "Repository audit and non-visual contract sections",
      status: "open",
    });
  }

  if (!visualBasis && (brief.scope?.in_scope ?? []).some((s) => /ui|screen|page|panel|modal|drawer|settings/i.test(s))) {
    proposedDecisions.push({
      decision_id: `decision-${String(decisionNum++).padStart(3, "0")}`,
      question: "Choose exactly one visual basis for user-visible work.",
      category: "visual_direction",
      why_it_matters: "User-visible contracts require exact_reference, pattern_reference, or bounded_exploration.",
      options: ["exact_reference", "pattern_reference", "bounded_exploration"],
      recommendation: "pattern_reference when an existing Settings surface is the model.",
      affected_contract_sections: ["visual_contract"],
      blocking: true,
      work_that_can_continue: "Problem statement and scope documentation",
      status: "open",
    });
  }

  for (const q of brief.open_questions ?? []) {
    proposedDecisions.push({
      decision_id: `decision-${String(decisionNum++).padStart(3, "0")}`,
      question: cleanListItem(q),
      category: "product_direction",
      why_it_matters: "Open question from Product Brief requires human resolution.",
      options: ["Resolve now", "Defer with explicit constraint", "Move out of scope"],
      recommendation: "Resolve before Product Contract approval if blocking.",
      affected_contract_sections: ["scope", "acceptance"],
      blocking: true,
      work_that_can_continue: "Audit and contract drafting",
      status: "open",
    });
  }

  mkdirSync(decisionsDir, { recursive: true });
  for (const d of proposedDecisions) {
    write(join(decisionsDir, `${d.decision_id}.yaml`), [
      `decision_id: ${quote(d.decision_id)}`,
      `question: ${quote(d.question)}`,
      `category: ${quote(d.category)}`,
      `why_it_matters: ${quote(d.why_it_matters)}`,
      "options:",
      yamlList(d.options, 2),
      `recommendation: ${quote(d.recommendation)}`,
      "affected_contract_sections:",
      yamlList(d.affected_contract_sections, 2),
      `blocking: ${d.blocking}`,
      `work_that_can_continue: ${quote(d.work_that_can_continue)}`,
      `status: ${quote(d.status)}`,
    ].join("\n"));
  }

  const productContractMd = [
    `# Product Contract — ${brief.product.title}`,
    "",
    `Key: \`${key}\``,
    `Generated: ${new Date().toISOString()}`,
    "",
    "---",
    "",
    "## A. Human-provided facts",
    "",
    "### Product summary",
    brief.product.summary,
    "",
    "### Problem",
    `**Current state:** ${brief.problem.current_state}`,
    "",
    "**Pain points:**",
    markdownList(brief.problem.pain_points),
    "",
    "### Users",
    `**Primary:** ${(brief.users.primary ?? []).join(", ")}`,
    `**Secondary:** ${(brief.users.secondary ?? []).join(", ") || "None"}`,
    "",
    "### Jobs to be done",
    markdownList(brief.jobs_to_be_done),
    "",
    "### Operator outcomes",
    markdownList(brief.operator_outcomes),
    "",
    "### Business outcomes",
    markdownList(brief.business_outcomes),
    "",
    "### Product direction",
    markdownList(brief.product_direction),
    "",
    "## B. Repository/doctrine findings",
    "",
    "See `product/audit/doctrine-manifest.yaml`, `surface-manifest.yaml`, and `visual-reference-manifest.yaml`.",
    "Canonical docs precede sprint/archive history unless explicitly requested.",
    "",
    "## C. Product decisions already approved in brief",
    "",
    markdownList((brief.known_decisions ?? []).map(cleanListItem), "None recorded in brief"),
    "",
    "## D. Proposed decisions requiring approval",
    "",
    markdownList(proposedDecisions.map((d) => `${d.decision_id}: ${d.question}`), "None"),
    "",
    "## E. Unknowns",
    "",
    markdownList(brief.open_questions ?? [], "None beyond proposed decisions"),
    "",
    "## F. Standard Product Runtime policy",
    "",
    "- Workers must not invent product direction, visual intent, or scope.",
    "- Engineering Runtime must not resolve unresolved product decisions.",
    "- Material product changes require Product Runtime revision and reapproval.",
    "- Push, merge, PR, and release require human promotion approval.",
    "",
    "---",
    "",
    "## Scope",
    "",
    "### In scope",
    markdownList(brief.scope.in_scope),
    "",
    "### Out of scope",
    markdownList(brief.scope.out_of_scope),
    "",
    "## Canonical constraints",
    markdownList(brief.architecture_constraints ?? [
      "Follow docs/platform/governance/design-and-operational-doctrine.md",
      "Scope tenant reads/writes by org_id",
      "Queues are preview/selection only",
    ]),
    "",
    "## Surface / interaction anatomy",
    markdownList(brief.interaction_expectations ?? ["Inherit existing Alloy configuration patterns where referenced"]),
    "",
    "## Visual basis",
    visualBasis
      ? `Type: **${visualBasis.type}** (approval_status: ${visualBasis.approval_status})`
      : "**Not set — blocking for user-visible work**",
    "",
    "## UX behavior",
    markdownList(brief.interaction_expectations ?? []),
    "",
    "## Content / hierarchy expectations",
    markdownList(brief.density_expectations ?? []),
    "",
    "## Edit behavior",
    markdownList(brief.editing_expectations ?? []),
    "",
    "## Navigation / context preservation",
    markdownList(brief.reference_routes?.map((r) => `Preserve context relative to ${r}`) ?? []),
    "",
    "## Loading / empty / error expectations",
    markdownList(["Follow platform loading/empty semantics — no false empty states during cold load"]),
    "",
    "## Responsive behavior",
    markdownList(brief.responsive_expectations ?? ["Follow existing admin workspace breakpoints"]),
    "",
    "## Scroll and overflow constraints",
    markdownList(brief.scroll_constraints ?? []),
    "",
    "## Accessibility expectations",
    markdownList(["Follow existing admin accessibility patterns"]),
    "",
    "## Acceptance criteria",
    markdownList(brief.acceptance),
    "",
    "## Verification targets",
    markdownList(brief.reference_routes ?? []),
    "",
    "## Test-data contract",
    markdownList(brief.test_data_requirements ?? []),
    "",
    "## Known risks",
    markdownList((brief.known_risks ?? []).map(cleanListItem)),
    "",
    "## Open decisions",
    markdownList(proposedDecisions.filter((d) => d.status === "open").map((d) => d.question)),
    "",
    "## Explicit engineering discretion",
    markdownList([
      "Internal hook decomposition within established patterns",
      "Test helper organization",
      "File naming within module conventions",
    ]),
    "",
    "## Explicit forbidden interpretations",
    markdownList([
      "Do not expand scope beyond approved in_scope",
      "Do not invent visual styling without approved visual basis",
      "Do not reinterpret operator outcomes",
      "Do not push, merge, or create PRs without human approval",
    ]),
  ].join("\n");

  write(join(contractDir, "product-contract.md"), productContractMd);

  const uxContract = {
    visual_basis: visualBasis ?? { type: "pattern_reference", approval_status: "proposed" },
    references: {
      screenshots: brief.visual_references ?? [],
      routes: brief.reference_routes ?? [],
      components: brief.reference_components ?? [],
      files: brief.reference_files ?? [],
    },
    layout: {
      regions: brief.layout_regions ?? [],
      hierarchy: brief.density_expectations ?? [],
      density: brief.density_expectations ?? [],
      panel_behavior: brief.editing_expectations ?? [],
    },
    interaction: {
      navigation: brief.interaction_expectations ?? [],
      editing: brief.editing_expectations ?? [],
    },
    constraints: {
      page_scroll: brief.scroll_constraints ?? [],
      responsive: brief.responsive_expectations ?? [],
    },
    visual_tokens: {
      approved_semantic_roles: ["Use existing admin semantic roles"],
      prohibited_new_colors: true,
      prohibited_one_off_styling: true,
    },
  };
  write(join(contractDir, "ux-contract.yaml"), [
    "visual_basis:",
    `  type: ${quote(uxContract.visual_basis.type)}`,
    `  approval_status: ${quote(uxContract.visual_basis.approval_status)}`,
    "references:",
    `  screenshots: ${JSON.stringify(uxContract.references.screenshots)}`,
    `  routes: ${JSON.stringify(uxContract.references.routes)}`,
    `  components: ${JSON.stringify(uxContract.references.components)}`,
    `  files: ${JSON.stringify(uxContract.references.files)}`,
  ].join("\n"));
  write(join(contractDir, "visual-contract.yaml"), [
    "visual_basis:",
    `  type: ${quote(uxContract.visual_basis.type)}`,
    `  approval_status: ${quote(uxContract.visual_basis.approval_status)}`,
    "constraints:",
    "  prohibited_new_colors: true",
    "  prohibited_one_off_styling: true",
  ].join("\n"));
  write(join(contractDir, "acceptance.yaml"), [
    "acceptance:",
    yamlList(brief.acceptance, 2),
  ].join("\n"));
  write(join(contractDir, "test-data-contract.yaml"), [
    "requirements:",
    yamlList(brief.test_data_requirements ?? [], 2),
  ].join("\n"));
  write(join(contractDir, "scope.yaml"), [
    "in_scope:",
    yamlList(brief.scope.in_scope, 2),
    "out_of_scope:",
    yamlList(brief.scope.out_of_scope, 2),
  ].join("\n"));
  write(join(contractDir, "product-contract.yaml"), [
    `key: ${quote(key)}`,
    `title: ${quote(brief.product.title)}`,
    `summary: ${quote(brief.product.summary)}`,
    "operator_outcomes:",
    yamlList(brief.operator_outcomes, 2),
    "business_outcomes:",
    yamlList(brief.business_outcomes, 2),
    "visual_basis:",
    visualBasis
      ? `  type: ${quote(visualBasis.type)}\n  approval_status: ${quote(visualBasis.approval_status)}`
      : "  type: null\n  approval_status: proposed",
    `proposed_decisions_count: ${proposedDecisions.length}`,
    `blocking_decisions_count: ${proposedDecisions.filter((d) => d.blocking).length}`,
  ].join("\n"));

  return JSON.stringify({
    proposed_decisions: proposedDecisions.length,
    blocking_decisions: proposedDecisions.filter((d) => d.blocking).length,
    has_visual_basis: Boolean(visualBasis),
  });
}

function main() {
  const cmd = process.argv[2];
  if (cmd === "audit") {
    const repo = process.argv[3];
    const briefPath = process.argv[4];
    const outputDir = process.argv[5];
    const stagingSha = process.argv[6] ?? "unknown";
    process.stdout.write(audit({ repo, briefPath, outputDir, stagingSha }));
    return;
  }
  if (cmd === "contract") {
    const briefPath = process.argv[3];
    const auditDir = process.argv[4];
    const contractDir = process.argv[5];
    const decisionsDir = process.argv[6];
    process.stdout.write(contract({ briefPath, auditDir, contractDir, decisionsDir }));
    return;
  }
  die("usage: product-artifacts.mjs audit|contract ...");
}

main();
