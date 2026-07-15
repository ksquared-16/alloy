#!/usr/bin/env node
/**
 * Deterministic Engineering V1 audit and planning artifacts.
 * No network, no LLM, no execution of intake content.
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
import { basename, dirname, join, relative, sep } from "node:path";

const STOP_WORDS = new Set([
  "alloy", "and", "with", "from", "that", "this", "through", "using",
  "into", "without", "before", "after", "initiative", "operator", "system",
  "implementation", "improve", "provide", "prove", "safely", "complete",
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

function termsFromIntake(intake) {
  const source = [
    intake.initiative?.title,
    intake.initiative?.objective,
    ...(intake.product_direction ?? []),
    ...(intake.operator_outcome ?? []),
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
  if (path.startsWith("scripts/")) return "tooling_candidate";
  return "repository_reference";
}

function relevance(path, matched, explicitKind = "") {
  if (explicitKind) return `Explicitly supplied in intake as ${explicitKind}.`;
  if (matched.length) return `Candidate matched bounded search terms: ${matched.join(", ")}.`;
  return "Selected by canonical documentation policy.";
}

function recentCommits(repo, path) {
  try {
    const out = execFileSync(
      "git",
      ["-C", repo, "log", "-5", "--format=%H%x09%cs%x09%s", "--", path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out ? out.split("\n").map((line) => {
      const [sha, date, ...summary] = line.split("\t");
      return { sha, date, summary: summary.join("\t"), path };
    }) : [];
  } catch {
    return [];
  }
}

function canonicalDefaults() {
  return [
    ["docs/README.md", "Canonical documentation navigation and authority ordering."],
    ["docs/platform/foundation/alloy-platform-handbook.md", "Canonical platform framing and operator model."],
    ["docs/platform/governance/design-and-operational-doctrine.md", "Behavior-change invariants and implementation guardrails."],
    ["docs/platform/governance/documentation-governance.md", "Canonical-versus-historical source precedence."],
    ["docs/platform/governance/agent-repo-boundaries.md", "Worker repository, branch, and promotion boundaries."],
  ];
}

function audit({ repo, intakePath, outputDir, stagingSha, metadataDir }) {
  const intake = readJson(intakePath);
  const terms = termsFromIntake(intake);
  const allFiles = boundedFiles(repo, ["docs", "web", "scripts/local-dev"]);
  const explicitDocs = intake.known_docs ?? [];
  const explicitFiles = intake.known_files ?? [];
  const requestedRoutes = intake.reference_routes ?? [];
  const verificationTargets = intake.verification_targets ?? [];

  const documentation = [];
  const seenDocs = new Set();
  function addDoc(path, classification, reason, source, confidence) {
    if (seenDocs.has(path)) return;
    seenDocs.add(path);
    documentation.push({ path, classification, relevance_reason: reason, source, confidence });
  }
  for (const [path, reason] of canonicalDefaults()) {
    if (existsSync(join(repo, path))) addDoc(path, classificationFor(path), reason, "discovered", "confirmed");
  }
  for (const path of explicitDocs) {
    addDoc(
      path,
      classificationFor(path),
      relevance(path, [], "known_docs"),
      "explicit",
      existsSync(join(repo, path)) ? "confirmed" : "candidate",
    );
  }
  const discoveredDocs = allFiles
    .filter((path) => path.endsWith(".md") && (path.startsWith("docs/platform/") || path.startsWith("docs/system/")))
    .map((path) => ({ path, ...scorePath(path, terms, repo) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 12);
  for (const entry of discoveredDocs) {
    addDoc(
      entry.path,
      classificationFor(entry.path),
      relevance(entry.path, entry.matched),
      "discovered",
      "candidate",
    );
  }

  const codeItems = [];
  const seenCode = new Set();
  function addCode(path, source, confidence, matched = [], explicitKind = "") {
    if (seenCode.has(path)) return;
    seenCode.add(path);
    codeItems.push({
      path,
      classification: classificationFor(path),
      relevance_reason: relevance(path, matched, explicitKind),
      source,
      confidence,
    });
  }
  for (const path of explicitFiles) {
    addCode(path, "explicit", existsSync(join(repo, path)) ? "confirmed" : "candidate", [], "known_files");
  }
  const candidates = allFiles
    .filter((path) => path.startsWith("web/") || path.startsWith("scripts/local-dev/"))
    .map((path) => ({ path, ...scorePath(path, terms, repo) }))
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 24);
  for (const entry of candidates) addCode(entry.path, "discovered", "candidate", entry.matched);

  const tests = allFiles
    .filter((path) => /(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\.[^.]+$/i.test(path))
    .map((path) => ({ path, ...scorePath(path, terms, repo) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 20)
    .map((entry) => ({
      path: entry.path,
      classification: "related_test",
      relevance_reason: relevance(entry.path, entry.matched),
      source: "discovered",
      confidence: "candidate",
    }));

  const commitPaths = [...explicitFiles, ...codeItems.slice(0, 8).map((item) => item.path)];
  const commits = [...new Map(
    commitPaths.flatMap((path) => recentCommits(repo, path)).map((commit) => [commit.sha, commit]),
  ).values()].slice(0, 12);

  const ownership = [];
  for (const item of codeItems) {
    let owner = "";
    if (item.path.startsWith("web/components/")) owner = "presentation/component candidate";
    else if (item.path.startsWith("web/lib/")) owner = "shared/runtime library candidate";
    else if (item.path.startsWith("web/app/") || item.path.startsWith("web/pages/")) owner = "route/API entry-point candidate";
    else if (item.path.startsWith("scripts/local-dev/")) owner = "local-development tooling";
    if (owner && !ownership.some((entry) => entry.boundary === owner)) {
      ownership.push({
        boundary: owner,
        evidence: item.path,
        confidence: item.source === "explicit" ? "confirmed" : "candidate",
      });
    }
  }

  const duplicateLegacy = codeItems
    .filter((item) => /(legacy|compat|deprecated|archive|old)/i.test(item.path))
    .map((item) => ({
      path: item.path,
      reason: "Path naming suggests possible legacy/compatibility ownership; human confirmation required.",
      confidence: "candidate",
    }));

  const missing = [];
  if (!explicitDocs.length) missing.push("No initiative-specific known_docs were supplied.");
  if (!explicitFiles.length) missing.push("No initiative-specific known_files were supplied.");
  if (!codeItems.length) missing.push("No relevant implementation entry points were found by explicit references or bounded search.");
  if (!tests.length) missing.push("No related test files were found by bounded search.");
  if (!requestedRoutes.length && !verificationTargets.length) missing.push("No reference routes or UI verification targets were supplied.");

  const workers = [];
  for (let slot = 1; slot <= 6; slot += 1) {
    const prefix = `wt${slot}-`;
    let occupiedBy = "";
    if (existsSync(metadataDir)) {
      const meta = readdirSync(metadataDir).find((name) => name.startsWith(prefix));
      occupiedBy = meta ? meta.replace(/\.env$/, "") : "";
    }
    workers.push({ slot, status: occupiedBy ? "occupied" : "free", occupied_by: occupiedBy });
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    staging_sha: stagingSha,
    search: {
      roots: ["docs/platform", "docs/system", "web", "scripts/local-dev"],
      terms,
      max_files: 5000,
      historical_excluded_by_default: true,
    },
    requested_reference_routes: requestedRoutes,
    verification_targets: verificationTargets,
    documentation,
    implementation_entry_points: codeItems,
    related_tests: tests,
    recent_commits: commits,
    ownership_boundaries: ownership,
    duplicate_or_legacy_candidates: duplicateLegacy,
    conflicts_or_ambiguity: duplicateLegacy.length
      ? ["Possible legacy/compatibility candidates require human ownership confirmation."]
      : [],
    missing_information: missing,
    worker_availability: workers,
    ui_browser_readiness: verificationTargets.length
      ? {
          requested: true,
          status: "not_checked",
          requirement: "Run alloy-agent-ready for the assigned UI worker before verification.",
        }
      : { requested: false },
  };
  write(join(outputDir, "evidence.json"), JSON.stringify(evidence, null, 2));

  const docYaml = [
    `generated_at: ${quote(evidence.generated_at)}`,
    `staging_sha: ${quote(stagingSha)}`,
    "authority_policy:",
    "  canonical_precedes_historical: true",
    "  historical_selected_only_when_explicit: true",
    "items:",
    yamlObjectList(documentation, [
      "path", "classification", "relevance_reason", "source", "confidence",
    ], 2),
  ].join("\n");
  write(join(outputDir, "documentation-manifest.yaml"), docYaml);

  const codeYaml = [
    `generated_at: ${quote(evidence.generated_at)}`,
    `staging_sha: ${quote(stagingSha)}`,
    "search:",
    "  roots:",
    yamlList(evidence.search.roots, 4),
    "  terms:",
    yamlList(terms, 4),
    `  max_files: ${evidence.search.max_files}`,
    "implementation_entry_points:",
    yamlObjectList(codeItems, [
      "path", "classification", "relevance_reason", "source", "confidence",
    ], 2),
    "related_tests:",
    yamlObjectList(tests, [
      "path", "classification", "relevance_reason", "source", "confidence",
    ], 2),
  ].join("\n");
  write(join(outputDir, "code-manifest.yaml"), codeYaml);

  const risks = [
    ...(intake.known_risks ?? []).map((risk) => ({
      risk,
      classification: "explicit",
      evidence: "initiative intake",
      confidence: "confirmed",
    })),
    ...missing.map((risk) => ({
      risk,
      classification: "missing_information",
      evidence: "deterministic audit",
      confidence: "confirmed",
    })),
    ...duplicateLegacy.map((item) => ({
      risk: item.reason,
      classification: "possible_duplicate_or_legacy",
      evidence: item.path,
      confidence: "candidate",
    })),
  ];
  write(join(outputDir, "risks.yaml"), [
    `generated_at: ${quote(evidence.generated_at)}`,
    "items:",
    yamlObjectList(risks, ["risk", "classification", "evidence", "confidence"], 2),
    "conflicts_or_ambiguity:",
    yamlList(evidence.conflicts_or_ambiguity, 2),
  ].join("\n"));

  const docsText = documentation.length
    ? documentation.map((item) =>
      `- \`${item.path}\` — ${item.relevance_reason} (${item.source}, ${item.confidence})`).join("\n")
    : "- No relevant doctrine found.";
  const codeText = codeItems.length
    ? codeItems.map((item) =>
      `- \`${item.path}\` — ${item.relevance_reason} (${item.source}, ${item.confidence})`).join("\n")
    : "- No relevant implementation entry points found.";
  const testsText = tests.length
    ? tests.map((item) => `- \`${item.path}\` — ${item.relevance_reason} (${item.confidence})`).join("\n")
    : "- No related tests found.";
  const commitsText = commits.length
    ? commits.map((commit) => `- \`${commit.sha.slice(0, 12)}\` ${commit.date} — ${commit.summary} (\`${commit.path}\`)`).join("\n")
    : "- No recent commits found for identified paths.";
  const ownershipText = ownership.length
    ? ownership.map((item) => `- ${item.boundary}: \`${item.evidence}\` (${item.confidence})`).join("\n")
    : "- No ownership boundary could be inferred from identified paths.";
  const legacyText = duplicateLegacy.length
    ? duplicateLegacy.map((item) => `- \`${item.path}\` — ${item.reason}`).join("\n")
    : "- No duplicate/legacy candidates found by path-name evidence.";
  const workersText = workers.map((worker) =>
    `- Slot ${worker.slot}: **${worker.status}**${worker.occupied_by ? ` — ${worker.occupied_by}` : ""}`).join("\n");

  write(join(outputDir, "repository.md"), `# Repository audit — ${intake.initiative.key}

Generated: ${evidence.generated_at}

## Evidence boundary

This is a bounded deterministic audit. Explicit intake references are confirmed inputs.
Discovered matches are candidates, not semantic truth. Search terms and paths are preserved below.

## Staging baseline

- Remote ref: \`origin/staging\`
- SHA: \`${stagingSha}\`
- Repository: \`${repo}\`

## Requested reference routes

${markdownList(requestedRoutes)}

## Explicit known documentation

${markdownList(explicitDocs)}

## Explicit known files

${markdownList(explicitFiles)}

## Search evidence

- Roots: ${evidence.search.roots.map((root) => `\`${root}\``).join(", ")}
- Terms: ${terms.length ? terms.map((term) => `\`${term}\``).join(", ") : "None"}
- Maximum files inspected: ${evidence.search.max_files}
- Historical sprint/archive documents excluded unless explicit: Yes

## Canonical documentation selected

${docsText}

## Current implementation entry-point candidates

${codeText}

## Related test candidates

${testsText}

## Recent commits touching identified areas

${commitsText}

## Likely ownership boundaries

${ownershipText}

## Possible duplicate or legacy systems

${legacyText}

## Conflicts or ambiguity

${markdownList(evidence.conflicts_or_ambiguity)}

## Missing information

${markdownList(missing)}

## Worker availability

${workersText}
${verificationTargets.length ? `
## UI/browser readiness

- UI verification requested: Yes
- Readiness status: Not checked
- Required next check: \`alloy-agent-ready <assigned-slot>\`
` : ""}
`);
}

function taskYaml(task) {
  const arrayFields = new Set([
    "dependencies", "allowed_scope", "prohibited_scope", "constitutional_references",
    "initiative_decisions", "likely_code_areas", "acceptance", "focused_checks",
    "required_outputs", "integration_risks",
  ]);
  const lines = [];
  for (const [key, value] of Object.entries(task)) {
    if (arrayFields.has(key)) {
      lines.push(`${key}:`);
      lines.push(yamlList(value, 2));
    } else if (key === "ui_verification") {
      lines.push("ui_verification:");
      lines.push(`  required: ${value.required}`);
      lines.push("  routes:");
      lines.push(yamlList(value.routes, 4));
    } else {
      lines.push(`${key}: ${quote(value)}`);
    }
  }
  return lines.join("\n");
}

function taskGraphYaml(tasks, decisions) {
  const lines = [
    `generated_at: ${quote(new Date().toISOString())}`,
    "tasks:",
  ];
  for (const task of tasks) {
    const rendered = taskYaml(task).split("\n");
    lines.push(`  - ${rendered[0]}`);
    lines.push(...rendered.slice(1).map((line) => `    ${line}`));
  }
  lines.push("edges:");
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      lines.push(`  - from: ${quote(dependency)}`);
      lines.push(`    to: ${quote(task.task_id)}`);
      lines.push(`    reason: ${quote("Declared task dependency")}`);
    }
  }
  if (!tasks.some((task) => task.dependencies.length)) lines.push("  []");
  lines.push("integration_order:");
  lines.push(yamlList(tasks.map((task) => task.task_id), 2));
  lines.push("overlap_warnings:");
  lines.push("  []");
  lines.push("blocking_human_decisions:");
  lines.push(yamlList(decisions, 2));
  return lines.join("\n");
}

function plan({ intakePath, auditPath, planDir, tasksDir, statePath }) {
  const intake = readJson(intakePath);
  const auditEvidence = readJson(auditPath);
  const state = readJson(statePath);
  const hasUi = (intake.verification_targets ?? []).length > 0;
  const hasVisualReference = (intake.visual_references ?? []).length > 0;
  const hasPatternReference = (intake.reference_routes ?? []).length > 0;
  const codeCandidates = auditEvidence.implementation_entry_points ?? [];
  const confirmedCode = codeCandidates.filter((item) => item.confidence === "confirmed");
  const auditFindings = [
    `${auditEvidence.documentation.length} documentation items selected (${auditEvidence.documentation.filter((item) => item.confidence === "confirmed").length} confirmed).`,
    `${codeCandidates.length} implementation entry-point candidates found (${confirmedCode.length} confirmed).`,
    `${auditEvidence.related_tests.length} related test candidates found.`,
    ...auditEvidence.ownership_boundaries.map((item) =>
      `${item.boundary} evidenced by ${item.evidence} (${item.confidence}).`),
  ];
  const proposed = [];
  const unknowns = [...auditEvidence.missing_information];
  const blockingDecisions = [];

  if (confirmedCode.length) {
    proposed.push("Use explicit confirmed code locations as the initial implementation boundary.");
  } else if (codeCandidates.length) {
    proposed.push("Human must confirm candidate implementation entry points before assignment.");
    blockingDecisions.push("Confirm which discovered implementation entry points are authoritative.");
  } else {
    blockingDecisions.push("Supply or approve implementation entry points before worker assignment.");
  }
  if (hasUi && !hasVisualReference && !hasPatternReference) {
    blockingDecisions.push("Choose exact_reference, pattern_reference, or explicitly authorize bounded_exploration.");
  }
  if (!intake.known_docs?.length) {
    proposed.push("Human should confirm the initiative-specific owner documentation selected by the audit.");
  }

  const constitutional = [
    "Scope tenant reads and writes by org_id.",
    "Prefer persons + customer_persons for human identity.",
    "Queues are preview/selection only — authoritative detail comes from entity or record responders.",
    "Configuration steers; code owns invariants.",
    "Fields have canonical owners.",
    "No direct service-role or privileged writes from client code.",
    "Do not bypass state machines, permissions, audit logs, or workflow events.",
    "Protected AdminV2 reveal and queue semantics require their dedicated runtime test suite.",
  ];

  const decisionCount = (state.human_decisions ?? []).filter((item) => item.status !== "resolved").length
    + blockingDecisions.length;
  const unresolvedState = decisionCount === 0 ? "None" : `${decisionCount} unresolved decisions`;

  write(join(planDir, "specification.md"), `# Specification — ${intake.initiative.title}

Initiative: \`${intake.initiative.key}\`
Generated: ${new Date().toISOString()}

## A. Intake facts

### Objective

${cleanListItem(intake.initiative.objective)}

### Operator outcome

${markdownList(intake.operator_outcome)}

### Product direction

${markdownList(intake.product_direction)}

### Acceptance

${markdownList(intake.acceptance)}

### Constraints

${markdownList(intake.constraints)}

### Explicit known files

${markdownList(intake.known_files ?? [])}

### Explicit known docs

${markdownList(intake.known_docs ?? [])}

## B. Audit findings

${markdownList(auditFindings)}

Evidence: \`audit/repository.md\`, \`audit/documentation-manifest.yaml\`, and \`audit/code-manifest.yaml\`.
Discovered matches remain candidates until a human confirms them.

## C. Proposed decisions requiring approval

${markdownList(proposed)}

## D. Unknowns

${markdownList(unknowns)}

### Human decision state

${unresolvedState}

${blockingDecisions.length ? `Blocking questions:\n\n${markdownList(blockingDecisions)}` : ""}

## Constitutional constraints

${markdownList(constitutional)}

## E. Standard operating policy

- Workers run focused checks during implementation.
- Heavy validation runs through \`alloy-validate\` under the global validation lock.
- UI verification uses the assigned slot and Phase 3 readiness/evidence paths when requested.
- Local commits only. Push, PR creation, merge, and Vercel preview require explicit later approval.

## Evidence labeling

- **Explicit:** supplied by the Initiative Brief.
- **Audit-derived:** grounded in repository paths or git history; candidate unless explicitly confirmed.
- **Deterministic template:** standard V1 workflow policy, not initiative-specific reasoning.
`);

  const confirmedExplicit = codeCandidates
    .filter((item) => item.source === "explicit" && item.confidence === "confirmed")
    .map((item) => item.path);
  const likelyAreas = confirmedExplicit.length
    ? confirmedExplicit
    : codeCandidates.slice(0, 8).map((item) => item.path);
  const confidence = confirmedExplicit.length
    ? "confirmed"
    : likelyAreas.length ? "proposed" : "insufficient_information";
  const implementationStatus = blockingDecisions.length ? "blocked" : "ready";
  const task1 = {
    task_id: "task-001",
    title: "Initiative implementation",
    objective: cleanListItem(intake.initiative.objective),
    role: "Product implementation",
    task_kind: "implementation",
    dependencies: [],
    status: implementationStatus,
    allowed_scope: intake.product_direction ?? [],
    prohibited_scope: (intake.out_of_scope ?? []).length ? intake.out_of_scope : ["Unrelated refactors"],
    constitutional_references: auditEvidence.documentation
      .filter((item) => item.confidence === "confirmed")
      .slice(0, 8)
      .map((item) => item.path),
    initiative_decisions: intake.product_direction ?? [],
    likely_code_areas: likelyAreas,
    acceptance: intake.acceptance ?? [],
    focused_checks: (intake.verification_targets ?? []).length
      ? ["Run focused tests for changed behavior.", "Run route verification for declared targets."]
      : ["Select focused tests from confirmed related test candidates before implementation."],
    ui_verification: {
      required: hasUi,
      routes: intake.verification_targets ?? [],
    },
    required_outputs: ["Local implementation commit", "reports/task-001-result.json"],
    integration_risks: [
      ...auditEvidence.conflicts_or_ambiguity,
      ...auditEvidence.duplicate_or_legacy_candidates.map((item) => item.reason),
    ],
    generation_basis: confirmedExplicit.length ? "explicit" : codeCandidates.length ? "audit_derived" : "deterministic_template",
    confidence,
  };
  const task2 = {
    task_id: "task-002",
    title: "Final readiness review",
    objective: "Review reported implementation and validation evidence against the approved contract.",
    role: "Experimental / QA support",
    task_kind: "final_review",
    dependencies: ["task-001"],
    status: "blocked",
    allowed_scope: ["Review approved contract, reports, evidence, and integration risks."],
    prohibited_scope: ["Implementation changes", "Unapproved scope expansion"],
    constitutional_references: task1.constitutional_references,
    initiative_decisions: intake.product_direction ?? [],
    likely_code_areas: likelyAreas,
    acceptance: ["Structured final review report is complete.", "Blocking findings prevent READY."],
    focused_checks: ["Confirm required report and validation evidence exist."],
    ui_verification: { required: hasUi, routes: intake.verification_targets ?? [] },
    required_outputs: ["reviews/task-002-review.json"],
    integration_risks: task1.integration_risks,
    generation_basis: "deterministic_template",
    confidence: "proposed",
  };
  const tasks = [task1, task2];
  write(join(tasksDir, "task-001.yaml"), taskYaml(task1));
  write(join(tasksDir, "task-002.yaml"), taskYaml(task2));
  write(join(planDir, "task-graph.yaml"), taskGraphYaml(tasks, blockingDecisions));

  const implementationReason = confirmedExplicit.length
    ? "Primary implementation role selected from explicit initiative code scope."
    : codeCandidates.length
      ? "Primary implementation role proposed from bounded audit candidates; human confirmation required."
      : "Primary implementation role reserved, but assignment is blocked pending implementation scope.";
  const finalReviewReason = "Final independent review is standard merge-readiness policy; it starts only after reporting and validation.";
  write(join(planDir, "worker-plan.yaml"), [
    `generated_at: ${quote(new Date().toISOString())}`,
    "assignments:",
    "  - task_id: \"task-001\"",
    "    selected_slot: 1",
    "    role: \"Product implementation\"",
    "    agent: \"cursor\"",
    `    reason_selected: ${quote(implementationReason)}`,
    "    prerequisites:",
    yamlList([
      "Approved specification hash exists.",
      ...(blockingDecisions.length ? ["Blocking human decisions resolved."] : []),
    ], 6),
    "    expected_inputs:",
    yamlList(["Approved specification", "Audit manifests", "Task contract"], 6),
    "    expected_outputs:",
    yamlList(["Local commit", "Structured worker report"], 6),
    "    review_relationship: \"Reviewed by task-002 final review; implementation worker is not sole reviewer.\"",
    `    ui_auth_readiness_required: ${hasUi}`,
    "    estimated_context_sources:",
    yamlList([
      ...task1.constitutional_references,
      ...likelyAreas,
    ].slice(0, 12), 6),
    "    cost_rationale: \"Use one implementation worker; focused checks locally; defer heavy validation to integration gate.\"",
    "  - task_id: \"task-002\"",
    "    selected_slot: 6",
    "    role: \"Experimental / QA support\"",
    "    agent: \"cursor\"",
    `    reason_selected: ${quote(finalReviewReason)}`,
    "    prerequisites:",
    yamlList(["task-001 valid report ingested", "Required validation evidence available"], 6),
    "    expected_inputs:",
    yamlList(["Approved specification", "Worker report", "Validation evidence"], 6),
    "    expected_outputs:",
    yamlList(["Final structured review report"], 6),
    "    review_relationship: \"Independent final reviewer for task-001.\"",
    `    ui_auth_readiness_required: ${hasUi}`,
    "    estimated_context_sources:",
    yamlList(["plan/specification.md", "reports/task-001-result.json", "audit/documentation-manifest.yaml"], 6),
    "    cost_rationale: \"One final reviewer only; no advisory specialist unless initiative evidence requires one.\"",
    "unselected_roles:",
    "  - role: \"Architecture / doctrine\"",
    `    reason_not_selected: ${quote("No explicit architecture tradeoff, doctrine conflict, or ownership decision was supplied.")}`,
    "  - role: \"Performance\"",
    `    reason_not_selected: ${quote("No explicit performance acceptance, risk, or hot-path target was supplied.")}`,
    "  - role: \"UI / UX\"",
    `    reason_not_selected: ${quote(hasUi ? "UI verification is required, but V1 keeps it with the final reviewer unless a separate specialist is human-approved." : "No UI verification target or user-visible acceptance was supplied.")}`,
    "  - role: \"Refactor / infrastructure\"",
    `    reason_not_selected: ${quote("No explicit infrastructure or refactor scope was supplied.")}`,
  ].join("\n"));

  write(join(planDir, "product-contract.yaml"), [
    `generated_at: ${quote(new Date().toISOString())}`,
    `initiative_key: ${quote(intake.initiative.key)}`,
    `objective: ${quote(cleanListItem(intake.initiative.objective))}`,
    "operator_outcome:",
    yamlList(intake.operator_outcome, 2),
    "in_scope:",
    yamlList(intake.product_direction, 2),
    "out_of_scope:",
    yamlList(intake.out_of_scope ?? [], 2),
    "constitutional_constraints:",
    yamlList(constitutional, 2),
  ].join("\n"));

  const basis = hasVisualReference
    ? "exact_reference"
    : hasPatternReference ? "pattern_reference" : hasUi ? "unresolved" : "not_applicable";
  write(join(planDir, "visual-contract.yaml"), [
    `basis: ${basis}`,
    "approved_image_paths:",
    yamlList(intake.visual_references ?? [], 2),
    "reference_routes:",
    yamlList(intake.reference_routes ?? [], 2),
    "verification_routes:",
    yamlList(intake.verification_targets ?? [], 2),
    `requires_human_decision: ${basis === "unresolved"}`,
  ].join("\n"));
  write(join(planDir, "acceptance.yaml"), [
    `generated_at: ${quote(new Date().toISOString())}`,
    "behavioral_criteria:",
    yamlList(intake.acceptance ?? [], 2),
    "data_test_fixtures:",
    yamlList(intake.test_data_requirements ?? [], 2),
    "verification_routes:",
    yamlList(intake.verification_targets ?? [], 2),
  ].join("\n"));
  write(join(planDir, "verification-plan.yaml"), [
    `generated_at: ${quote(new Date().toISOString())}`,
    "focused_checks_per_worker: true",
    "heavy_validation_command: \"alloy-validate\"",
    "integration_candidate: \"task-001\"",
    "ui_verification:",
    `  required: ${hasUi}`,
    "  routes:",
    yamlList(intake.verification_targets ?? [], 4),
  ].join("\n"));

  process.stdout.write(JSON.stringify({
    blocking_decisions: blockingDecisions,
    task_ids: tasks.map((task) => task.task_id),
  }));
}

const [command, ...args] = process.argv.slice(2);
if (command === "audit") {
  const [repo, intakePath, outputDir, stagingSha, metadataDir] = args;
  if (![repo, intakePath, outputDir, stagingSha, metadataDir].every(Boolean)) die("audit requires repo intake output staging metadata");
  audit({ repo, intakePath, outputDir, stagingSha, metadataDir });
} else if (command === "plan") {
  const [intakePath, auditPath, planDir, tasksDir, statePath] = args;
  if (![intakePath, auditPath, planDir, tasksDir, statePath].every(Boolean)) die("plan requires intake audit plan tasks state");
  plan({ intakePath, auditPath, planDir, tasksDir, statePath });
} else if (command === "normalize-list") {
  const values = JSON.parse(args[0] ?? "[]");
  process.stdout.write(`${markdownList(values)}\n`);
} else {
  die(`unknown command: ${command ?? ""}`);
}
