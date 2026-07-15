#!/usr/bin/env node
/**
 * Alloy Product Runtime V1 — structured validation, state machine, atomic JSON I/O.
 * Never executes shell from imported brief content.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const CMD = process.argv[2];

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function assertStringList(name, v, { min = 1 } = {}) {
  if (!Array.isArray(v)) die(`${name} must be a list`);
  if (v.length < min) die(`${name} must have at least ${min} item(s)`);
  for (const item of v) {
    if (typeof item !== "string" || !item.trim()) die(`${name} items must be non-empty strings`);
  }
}

const PRODUCT_STATES = new Set([
  "draft",
  "auditing",
  "contracting",
  "awaiting_decisions",
  "awaiting_product_approval",
  "approved",
  "packaged",
  "handed_off",
  "superseded",
  "closed",
  "blocked",
]);

const PRODUCT_TRANSITIONS = {
  draft: ["auditing", "blocked"],
  auditing: ["contracting", "blocked"],
  contracting: ["awaiting_decisions", "awaiting_product_approval", "blocked"],
  awaiting_decisions: ["contracting", "blocked"],
  awaiting_product_approval: ["approved", "contracting", "blocked"],
  approved: ["packaged", "contracting", "blocked"],
  packaged: ["handed_off", "blocked"],
  handed_off: ["closed", "contracting", "blocked"],
  superseded: ["closed"],
  closed: [],
  blocked: [
    "draft",
    "auditing",
    "contracting",
    "awaiting_decisions",
    "awaiting_product_approval",
    "approved",
    "packaged",
    "handed_off",
    "closed",
  ],
};

const DECISION_CATEGORIES = new Set([
  "product_direction",
  "scope",
  "visual_direction",
  "interaction",
  "content",
  "data_behavior",
  "permissions",
  "security",
  "architecture_boundary",
  "release",
]);

const DECISION_STATUSES = new Set(["open", "decided", "deferred", "superseded"]);

const VISUAL_BASIS_TYPES = new Set([
  "exact_reference",
  "pattern_reference",
  "bounded_exploration",
]);

const VAGUE_ADJECTIVES = [
  "premium",
  "compact",
  "calm",
  "polished",
  "configuration-like",
  "modern",
  "elegant",
  "sleek",
  "beautiful",
  "intuitive",
  "clean",
];

const REQUIRED_BRIEF = [
  "product",
  "problem",
  "users",
  "jobs_to_be_done",
  "operator_outcomes",
  "business_outcomes",
  "product_direction",
  "scope",
  "acceptance",
  "human_approval",
];

function validateBrief(data) {
  if (!isPlainObject(data)) die("brief must be a mapping");
  for (const key of REQUIRED_BRIEF) {
    if (!(key in data)) die(`missing required field: ${key}`);
  }
  if (!isPlainObject(data.product)) die("product must be a mapping");
  for (const k of ["key", "title", "summary"]) {
    if (typeof data.product[k] !== "string" || !data.product[k].trim()) {
      die(`product.${k} is required`);
    }
  }
  if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(data.product.key)) {
    die("product.key has invalid format");
  }
  if (!isPlainObject(data.problem)) die("problem must be a mapping");
  assertStringList("problem.pain_points", data.problem.pain_points ?? [], { min: 1 });
  if (typeof data.problem.current_state !== "string") die("problem.current_state is required");
  if (!isPlainObject(data.users)) die("users must be a mapping");
  assertStringList("users.primary", data.users.primary ?? [], { min: 1 });
  if (!Array.isArray(data.users.secondary)) die("users.secondary must be a list");
  assertStringList("jobs_to_be_done", data.jobs_to_be_done);
  assertStringList("operator_outcomes", data.operator_outcomes);
  assertStringList("business_outcomes", data.business_outcomes);
  assertStringList("product_direction", data.product_direction);
  if (!isPlainObject(data.scope)) die("scope must be a mapping");
  assertStringList("scope.in_scope", data.scope.in_scope);
  assertStringList("scope.out_of_scope", data.scope.out_of_scope);
  assertStringList("acceptance", data.acceptance);
  if (!isPlainObject(data.human_approval)) die("human_approval must be a mapping");
  if (!Array.isArray(data.human_approval.required_gates)) {
    die("human_approval.required_gates must be a list");
  }
  return data;
}

function validateProductTransition(from, to) {
  if (!PRODUCT_STATES.has(from)) die(`unknown product state: ${from}`);
  if (!PRODUCT_STATES.has(to)) die(`unknown product state: ${to}`);
  const allowed = PRODUCT_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) die(`illegal product transition: ${from} -> ${to}`);
}

function validateDecision(decision) {
  if (!isPlainObject(decision)) die("decision must be an object");
  const req = [
    "decision_id",
    "question",
    "category",
    "why_it_matters",
    "options",
    "recommendation",
    "affected_contract_sections",
    "blocking",
    "work_that_can_continue",
    "status",
  ];
  for (const k of req) {
    if (!(k in decision)) die(`decision missing field: ${k}`);
  }
  if (!DECISION_CATEGORIES.has(decision.category)) die(`invalid decision category: ${decision.category}`);
  if (!DECISION_STATUSES.has(decision.status)) die(`invalid decision status: ${decision.status}`);
  if (typeof decision.blocking !== "boolean") die("decision.blocking must be boolean");
  if (!Array.isArray(decision.options)) die("decision.options must be a list");
  if (!Array.isArray(decision.affected_contract_sections)) {
    die("decision.affected_contract_sections must be a list");
  }
  return decision;
}

function validateVisualBasis(vc) {
  if (!isPlainObject(vc)) die("visual contract must be an object");
  const basis = vc.visual_basis;
  if (!isPlainObject(basis)) die("visual_basis must be an object");
  if (!VISUAL_BASIS_TYPES.has(basis.type)) {
    die(`invalid visual basis type: ${basis.type}`);
  }
  if (!["proposed", "approved"].includes(basis.approval_status ?? "proposed")) {
    die(`invalid visual basis approval_status: ${basis.approval_status}`);
  }
  return vc;
}

function detectVagueLanguage(text) {
  const lower = String(text ?? "").toLowerCase();
  return VAGUE_ADJECTIVES.filter((adj) => lower.includes(adj));
}

function sha256File(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function contractHash(paths) {
  const h = createHash("sha256");
  for (const p of paths) {
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest("hex");
}

function validateHandoff(handoff) {
  if (!isPlainObject(handoff)) die("handoff must be an object");
  const req = [
    "initiative_key",
    "product_revision",
    "approved_contract_hash",
    "objective",
    "operator_outcomes",
    "business_outcomes",
    "in_scope",
    "out_of_scope",
    "constitutional_constraints",
    "product_decisions",
    "ux_visual_contract_refs",
    "behavioral_acceptance",
    "verification_targets",
    "test_data_requirements",
    "known_risks",
    "engineering_discretion",
    "forbidden_interpretations",
    "human_approval_gates",
    "reference_manifests",
    "handoff_at",
    "staging_baseline_sha",
  ];
  for (const k of req) {
    if (!(k in handoff)) die(`handoff missing field: ${k}`);
  }
  return handoff;
}

function main() {
  if (!CMD) die("usage: product-io.mjs <command> [args...]");

  switch (CMD) {
    case "validate-brief": {
      const path = process.argv[3];
      if (!path) die("validate-brief requires path");
      validateBrief(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-transition": {
      validateProductTransition(process.argv[3], process.argv[4]);
      process.stdout.write("ok\n");
      break;
    }
    case "validate-decision": {
      const path = process.argv[3];
      validateDecision(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-visual": {
      const path = process.argv[3];
      validateVisualBasis(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-handoff": {
      const path = process.argv[3];
      validateHandoff(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "detect-vague": {
      const text = process.argv[3] ?? "";
      const found = detectVagueLanguage(text);
      process.stdout.write(JSON.stringify(found));
      break;
    }
    case "sha256-file": {
      process.stdout.write(`${sha256File(process.argv[3])}\n`);
      break;
    }
    case "sha256-text": {
      process.stdout.write(`${sha256Text(process.argv[3] ?? "")}\n`);
      break;
    }
    case "contract-hash": {
      const paths = process.argv.slice(3);
      process.stdout.write(`${contractHash(paths)}\n`);
      break;
    }
    case "write-json": {
      const path = process.argv[3];
      const json = process.argv[4];
      writeJsonAtomic(path, JSON.parse(json));
      process.stdout.write("ok\n");
      break;
    }
    case "read-json-field": {
      const data = readJson(process.argv[3]);
      const value = data[process.argv[4]];
      if (value === undefined) die(`field not found: ${process.argv[4]}`);
      if (typeof value === "object") process.stdout.write(JSON.stringify(value));
      else process.stdout.write(String(value));
      break;
    }
    default:
      die(`unknown command: ${CMD}`);
  }
}

main();
