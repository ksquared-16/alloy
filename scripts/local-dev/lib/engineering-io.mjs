#!/usr/bin/env node
/**
 * Alloy Engineering V1 — structured validation and atomic JSON I/O.
 * Invoked from Bash; stdin/argv modes only. Never executes shell from content.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

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

const REQUIRED_INTAKE = [
  "initiative",
  "operator_outcome",
  "product_direction",
  "acceptance",
  "constraints",
  "human_approval",
];

const INITIATIVE_REQUIRED = ["key", "title", "objective"];

const VALID_STATES = new Set([
  "draft",
  "auditing",
  "planning",
  "awaiting_plan_approval",
  "approved",
  "assigning",
  "implementing",
  "validating",
  "reviewing",
  "remediation_required",
  "merge_ready",
  "awaiting_promotion_approval",
  "closed",
  "blocked",
]);

const TRANSITIONS = {
  draft: ["auditing", "blocked"],
  auditing: ["planning", "blocked"],
  planning: ["awaiting_plan_approval", "blocked"],
  awaiting_plan_approval: ["approved", "planning", "blocked"],
  approved: ["assigning", "blocked"],
  assigning: ["implementing", "blocked"],
  implementing: ["validating", "blocked"],
  validating: ["reviewing", "blocked"],
  reviewing: ["remediation_required", "merge_ready", "blocked"],
  remediation_required: ["implementing", "blocked"],
  merge_ready: ["awaiting_promotion_approval", "blocked"],
  awaiting_promotion_approval: ["closed", "blocked"],
  blocked: [
    "draft",
    "auditing",
    "planning",
    "awaiting_plan_approval",
    "approved",
    "assigning",
    "implementing",
    "validating",
    "reviewing",
    "remediation_required",
    "merge_ready",
    "awaiting_promotion_approval",
  ],
  closed: [],
};

const TASK_STATUSES = new Set([
  "blocked",
  "ready",
  "assigned",
  "implementing",
  "reported",
  "reviewing",
  "remediation",
  "complete",
]);

const REPORT_STATUSES = new Set(["implemented", "blocked", "needs_decision", "failed"]);
const UI_VERIFY_STATUSES = new Set(["passed", "failed", "not_run"]);
const REVIEW_STATUSES = new Set(["pass", "pass_with_findings", "fail", "blocked"]);
const PROMOTION_CLASSES = new Set([
  "READY",
  "READY_WITH_KNOWN_RISKS",
  "NOT_READY",
  "BLOCKED_ON_HUMAN_DECISION",
]);

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

function validateIntake(data) {
  if (!isPlainObject(data)) die("intake must be a mapping");
  for (const key of REQUIRED_INTAKE) {
    if (!(key in data)) die(`missing required field: ${key}`);
  }
  if (!isPlainObject(data.initiative)) die("initiative must be a mapping");
  for (const k of INITIATIVE_REQUIRED) {
    if (typeof data.initiative[k] !== "string" || !data.initiative[k].trim()) {
      die(`initiative.${k} is required`);
    }
  }
  if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(data.initiative.key)) {
    die("initiative.key has invalid format");
  }
  assertStringList("operator_outcome", data.operator_outcome);
  assertStringList("product_direction", data.product_direction);
  assertStringList("acceptance", data.acceptance);
  assertStringList("constraints", data.constraints);
  if (!isPlainObject(data.human_approval)) die("human_approval must be a mapping");
  if (!Array.isArray(data.human_approval.required_gates)) {
    die("human_approval.required_gates must be a list");
  }
  return data;
}

function sha256File(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function validateTransition(from, to) {
  if (!VALID_STATES.has(from)) die(`unknown state: ${from}`);
  if (!VALID_STATES.has(to)) die(`unknown state: ${to}`);
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) die(`illegal transition: ${from} -> ${to}`);
}

function validateWorkerReport(report, { initiativeKey, taskId } = {}) {
  if (!isPlainObject(report)) die("report must be an object");
  const req = [
    "initiative_key",
    "task_id",
    "worker_slot",
    "worker_role",
    "status",
    "summary",
    "commit",
    "files_changed",
    "focused_checks",
    "ui_verification",
    "risks",
    "questions",
    "processes_left_running",
  ];
  for (const k of req) {
    if (!(k in report)) die(`report missing field: ${k}`);
  }
  if (!REPORT_STATUSES.has(report.status)) die(`invalid report status: ${report.status}`);
  if (typeof report.worker_slot !== "number" || report.worker_slot < 1) {
    die("worker_slot must be a positive number");
  }
  if (!Array.isArray(report.files_changed)) die("files_changed must be a list");
  if (!Array.isArray(report.focused_checks)) die("focused_checks must be a list");
  if (!Array.isArray(report.risks)) die("risks must be a list");
  if (!Array.isArray(report.questions)) die("questions must be a list");
  if (!Array.isArray(report.processes_left_running)) die("processes_left_running must be a list");
  const ui = report.ui_verification;
  if (!isPlainObject(ui)) die("ui_verification must be an object");
  if (typeof ui.required !== "boolean") die("ui_verification.required must be boolean");
  if (!UI_VERIFY_STATUSES.has(ui.status)) die(`invalid ui_verification.status: ${ui.status}`);
  if (!Array.isArray(ui.routes)) die("ui_verification.routes must be a list");
  if (!Array.isArray(ui.evidence)) die("ui_verification.evidence must be a list");
  if (!Array.isArray(ui.console_errors)) die("ui_verification.console_errors must be a list");
  if (!Array.isArray(ui.failed_requests)) die("ui_verification.failed_requests must be a list");
  if (initiativeKey && report.initiative_key !== initiativeKey) {
    die(`report initiative_key mismatch: ${report.initiative_key} != ${initiativeKey}`);
  }
  if (taskId && report.task_id !== taskId) {
    die(`report task_id mismatch: ${report.task_id} != ${taskId}`);
  }
  if (ui.required && ui.status === "passed" && ui.evidence.length === 0) {
    die("ui_verification required with status passed requires evidence paths");
  }
  return report;
}

function validateReviewReport(report) {
  if (!isPlainObject(report)) die("review report must be an object");
  const req = [
    "review_id",
    "initiative_key",
    "task_ids",
    "review_type",
    "status",
    "findings",
    "severity",
    "evidence",
    "required_remediation",
    "unresolved_decisions",
  ];
  for (const k of req) {
    if (!(k in report)) die(`review missing field: ${k}`);
  }
  if (!REVIEW_STATUSES.has(report.status)) die(`invalid review status: ${report.status}`);
  if (!Array.isArray(report.task_ids)) die("task_ids must be a list");
  if (!Array.isArray(report.findings)) die("findings must be a list");
  if (!Array.isArray(report.required_remediation)) die("required_remediation must be a list");
  if (!Array.isArray(report.unresolved_decisions)) die("unresolved_decisions must be a list");
  return report;
}

function validateTask(task) {
  if (!isPlainObject(task)) die("task must be an object");
  const req = [
    "task_id",
    "title",
    "objective",
    "role",
    "dependencies",
    "allowed_scope",
    "prohibited_scope",
    "constitutional_references",
    "initiative_decisions",
    "likely_code_areas",
    "acceptance",
    "focused_checks",
    "ui_verification",
    "required_outputs",
    "status",
  ];
  for (const k of req) {
    if (!(k in task)) die(`task missing field: ${k}`);
  }
  if (!TASK_STATUSES.has(task.status)) die(`invalid task status: ${task.status}`);
  return task;
}

function validateVisualContract(vc) {
  if (!isPlainObject(vc)) die("visual contract must be an object");
  const basis = vc.basis;
  if (!["exact_reference", "pattern_reference", "bounded_exploration", "not_applicable"].includes(basis)) {
    die(`invalid visual basis: ${basis}`);
  }
  return vc;
}

function validateVisualContractExclusivity(vc) {
  validateVisualContract(vc);
  const flags = [
    vc.basis === "exact_reference",
    vc.basis === "pattern_reference",
    vc.basis === "bounded_exploration",
    vc.basis === "not_applicable",
  ].filter(Boolean);
  if (flags.length !== 1) die("visual contract must have exactly one basis");
  if (vc.conflicting_bases && Array.isArray(vc.conflicting_bases) && vc.conflicting_bases.length > 1) {
    die("visual contract has conflicting bases");
  }
  return vc;
}

function main() {
  if (!CMD) die("usage: engineering-io.mjs <command> [args...]");

  switch (CMD) {
    case "validate-intake": {
      const path = process.argv[3];
      if (!path) die("validate-intake requires path");
      validateIntake(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-transition": {
      const from = process.argv[3];
      const to = process.argv[4];
      validateTransition(from, to);
      process.stdout.write("ok\n");
      break;
    }
    case "validate-report": {
      const path = process.argv[3];
      const initiativeKey = process.argv[4] || "";
      const taskId = process.argv[5] || "";
      const opts = {};
      if (initiativeKey) opts.initiativeKey = initiativeKey;
      if (taskId) opts.taskId = taskId;
      validateWorkerReport(readJson(path), opts);
      process.stdout.write("ok\n");
      break;
    }
    case "validate-review": {
      const path = process.argv[3];
      validateReviewReport(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-task": {
      const path = process.argv[3];
      validateTask(readJson(path));
      process.stdout.write("ok\n");
      break;
    }
    case "validate-visual": {
      const path = process.argv[3];
      if (!path) die("validate-visual requires path");
      const text = readFileSync(path, "utf8");
      const m = text.match(/^basis:\s*(\S+)/m);
      if (!m) die("visual contract missing basis field");
      validateVisualContract({ basis: m[1] });
      process.stdout.write("ok\n");
      break;
    }
    case "validate-visual-exclusivity": {
      const path = process.argv[3];
      if (!path) die("validate-visual-exclusivity requires path");
  if (path.endsWith(".json")) {
        validateVisualContractExclusivity(readJson(path));
      } else {
        const text = readFileSync(path, "utf8");
        const m = text.match(/^basis:\s*(\S+)/m);
        if (!m) die("visual contract missing basis field");
        validateVisualContractExclusivity({ basis: m[1] });
      }
      process.stdout.write("ok\n");
      break;
    }
    case "sha256-file": {
      const path = process.argv[3];
      process.stdout.write(`${sha256File(path)}\n`);
      break;
    }
    case "sha256-text": {
      const text = process.argv[3] ?? "";
      process.stdout.write(`${sha256Text(text)}\n`);
      break;
    }
    case "write-json": {
      const path = process.argv[3];
      const json = process.argv[4];
      if (!path || !json) die("write-json requires path and json string");
      writeJsonAtomic(path, JSON.parse(json));
      process.stdout.write("ok\n");
      break;
    }
    case "read-json-field": {
      const path = process.argv[3];
      const field = process.argv[4];
      const data = readJson(path);
      const value = data[field];
      if (value === undefined) die(`field not found: ${field}`);
      if (typeof value === "object") process.stdout.write(JSON.stringify(value));
      else process.stdout.write(String(value));
      break;
    }
    case "validate-promotion-class": {
      const cls = process.argv[3];
      if (!PROMOTION_CLASSES.has(cls)) die(`invalid promotion class: ${cls}`);
      process.stdout.write("ok\n");
      break;
    }
    default:
      die(`unknown command: ${CMD}`);
  }
}

main();
