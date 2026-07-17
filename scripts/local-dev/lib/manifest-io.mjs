#!/usr/bin/env node
// Sprint Manifest I/O and validation.
//
// The manifest is the join the toolkit never had. Slot metadata carries 21
// fields and not one of them names an initiative, a phase, a role, a posture, or
// a promotion target -- so a sprint started through the front door could not be
// a participant in the workflow the toolkit already implements. The Product and
// Engineering Runtimes keep validated JSON state machines the slot cannot see.
// This is that record, on the substrate that already works.
//
// JSON, never sourced. Slot metadata is `source`d into the caller's shell, which
// is both how one slot inherited another's sprint name and why arbitrary text in
// a metadata file executes. A manifest is data.
//
// Scope: this DECLARES. It does not run a role runtime, an initiative runtime,
// a tenant allocator, or role enforcement -- those come after Phase 5.

import fs from "node:fs";
import path from "node:path";

export const MANIFEST_VERSION = 1;

// Stage: where in Discovery -> Constitution -> Realization -> Certification ->
// Promotion this sprint sits. Promotion is a gated transition, not a sprint, but
// it is a legal declaration for a sprint that exists to carry one out.
export const STAGES = [
  "discovery",
  "constitution",
  "realization",
  "certification",
  "promotion",
];

// Role: the authority held. Not the topic, and not the slot.
export const ROLES = [
  "product-office",
  "engineering-director",
  "worker",
  "certifier",
  "operator",
];

// Lane: the files this sprint may write. A Documentation sprint and a Runtime
// sprint differ only in lane; both are Realization. That is why lanes are not
// stages and not roles.
export const LANES = [
  "runtime",
  "configuration",
  "ux",
  "documentation",
  "infrastructure",
];

// Posture: what this sprint may touch, declared before execution.
export const MUTATIONS = ["read-only", "shared-read-only", "isolated-mutable"];
export const TENANT_CLASSES = ["shared", "disposable", "production-like", "none"];

// Absence is a value. "undeclared" is legal, recorded, and visible -- it is not
// the same as a field that was never modelled. Fail closed on silence, never on
// absence.
export const UNDECLARED = "undeclared";

// A shared tenant cannot certify execution. This is the ceiling, applied
// mechanically rather than by a reviewer's discipline.
//
// Levels are the Product Office's certification contract:
//   1 loadable | 2 structurally valid | 3 semantically coherent
//   4 operationally reachable | 5 certified through execution
// Level 5 is never self-issued; it is recorded, never computed.
export function certificationCeiling(tenantClass) {
  switch (tenantClass) {
    case "disposable":
    case "production-like":
      return 5;
    case "shared":
      return 4;
    case "none":
      return 1;
    default:
      return 1; // undeclared: claim nothing
  }
}

export function ceilingReason(tenantClass) {
  switch (tenantClass) {
    case "disposable":
    case "production-like":
      return "isolated tenant: execution certification (L5) is possible, and must be issued externally";
    case "shared":
      return "shared tenant: mutation is not safe, so execution cannot be certified (L4 max)";
    case "none":
      return "no tenant: nothing to execute against (L1 max)";
    default:
      return "tenant class undeclared: no certification level may be claimed";
  }
}

function enumField(value, allowed, name, errors) {
  if (value === UNDECLARED) return value;
  if (!allowed.includes(value)) {
    errors.push(`${name}: '${value}' is not one of ${allowed.join(" | ")} (or ${UNDECLARED})`);
  }
  return value;
}

export function emptyManifest(worktreeName, slot) {
  return {
    manifest_version: MANIFEST_VERSION,
    worktree_name: worktreeName,
    slot: slot,
    sprint_name: UNDECLARED,
    objective: "",

    // The join.
    initiative_key: null,

    // Declarations.
    stage: UNDECLARED,
    role: UNDECLARED,
    lane: UNDECLARED,
    posture: { mutation: UNDECLARED, tenant_class: UNDECLARED },

    // Gate the silence, not the absence: a hash, or a recorded reason there is none.
    constitutional_basis: { type: UNDECLARED, value: null, reason: null },

    // Inputs / outputs / who receives the work.
    inputs: [],
    outputs: [],
    handoff_target: UNDECLARED,

    // What must be true to certify, and to promote.
    certification: {
      required: UNDECLARED,
      ceiling: 1,
      ceiling_reason: ceilingReason(UNDECLARED),
      recorded: null,
    },
    promotion: {
      target: UNDECLARED,
      requires_certification: true,
      recorded: null,
    },

    // Which root this sprint was cut from, and by which toolkit.
    root: { canonical: null, base_ref: null, base_sha: null, toolkit: null },

    created_at: null,
    updated_at: null,
    history: [],
  };
}

export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];

  if (m.manifest_version !== MANIFEST_VERSION) {
    errors.push(`manifest_version: expected ${MANIFEST_VERSION}, got ${m.manifest_version}`);
  }
  if (!m.worktree_name) errors.push("worktree_name: required");
  if (m.slot === undefined || m.slot === null || m.slot === "") errors.push("slot: required");

  enumField(m.stage, STAGES, "stage", errors);
  enumField(m.role, ROLES, "role", errors);
  enumField(m.lane, LANES, "lane", errors);

  const posture = m.posture || {};
  enumField(posture.mutation, MUTATIONS, "posture.mutation", errors);
  enumField(posture.tenant_class, TENANT_CLASSES, "posture.tenant_class", errors);

  const cb = m.constitutional_basis || {};
  if (![UNDECLARED, "contract-hash", "declared-absent"].includes(cb.type)) {
    errors.push(`constitutional_basis.type: '${cb.type}' is not contract-hash | declared-absent | ${UNDECLARED}`);
  }
  if (cb.type === "contract-hash" && !cb.value) {
    errors.push("constitutional_basis: type is contract-hash but no value was recorded");
  }
  // The whole point: absence is legal, silence is not.
  if (cb.type === "declared-absent" && !cb.reason) {
    errors.push("constitutional_basis: declared-absent requires a reason (absence is a decision, not a default)");
  }

  if (!Array.isArray(m.inputs)) errors.push("inputs: must be an array");
  if (!Array.isArray(m.outputs)) errors.push("outputs: must be an array");
  if (!Array.isArray(m.history)) errors.push("history: must be an array");

  // A verdict may never imply a level it did not test.
  const cert = m.certification || {};
  const ceiling = certificationCeiling(posture.tenant_class);
  if (typeof cert.ceiling === "number" && cert.ceiling > ceiling) {
    errors.push(
      `certification.ceiling: ${cert.ceiling} exceeds what posture allows (${ceiling}) — ${ceilingReason(posture.tenant_class)}`
    );
  }
  if (cert.recorded && cert.recorded.level === 5 && !cert.recorded.issuer) {
    errors.push("certification.recorded: level 5 requires an issuer (L5 is never self-issued)");
  }

  return errors;
}

// A realization sprint must declare a constitutional basis, and a certification
// sprint must be able to reach the level it intends. These are the refusals that
// matter; they are reported, and the caller decides whether to enforce.
export function declarationGaps(m) {
  const gaps = [];
  const posture = m.posture || {};

  if (m.stage === UNDECLARED) gaps.push("stage is undeclared");
  if (m.role === UNDECLARED) gaps.push("role is undeclared");
  if (posture.mutation === UNDECLARED) gaps.push("posture.mutation is undeclared");
  if (posture.tenant_class === UNDECLARED) gaps.push("posture.tenant_class is undeclared");

  if (m.stage === "realization" && (m.constitutional_basis || {}).type === UNDECLARED) {
    gaps.push(
      "realization sprint has no declared constitutional basis (give a contract hash, or declare its absence with a reason)"
    );
  }

  // The move that pays for the sprint: a certification plan checked against
  // posture at bootstrap, not discovered nine deliverables in.
  if (m.stage === "certification") {
    const required = (m.certification || {}).required;
    const ceiling = certificationCeiling(posture.tenant_class);
    if (typeof required === "number" && required > ceiling) {
      gaps.push(
        `certification sprint intends level ${required} but posture allows at most ${ceiling} — ${ceilingReason(posture.tenant_class)}`
      );
    }
  }

  if (posture.mutation === "shared-read-only" && posture.tenant_class === "disposable") {
    gaps.push("posture is inconsistent: a disposable tenant is not shared-read-only");
  }
  if (posture.mutation === "isolated-mutable" && posture.tenant_class === "shared") {
    gaps.push("posture is inconsistent: isolated-mutable cannot target a shared tenant");
  }

  return gaps;
}

export function readManifest(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeManifest(file, m) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main(argv) {
  const cmd = argv[0];
  const file = argv[1];

  if (cmd === "init") {
    const [, , worktree, slot] = argv;
    const m = emptyManifest(worktree, slot);
    m.created_at = process.env.ALLOY_NOW || new Date().toISOString();
    m.updated_at = m.created_at;
    writeManifest(file, m);
    process.stdout.write("ok\n");
    return 0;
  }

  if (cmd === "set") {
    const m = readManifest(file);
    if (!m) {
      process.stderr.write(`manifest not found: ${file}\n`);
      return 1;
    }
    // set <file> key=value ...
    for (const pair of argv.slice(2)) {
      const idx = pair.indexOf("=");
      if (idx < 0) continue;
      const key = pair.slice(0, idx);
      const raw = pair.slice(idx + 1);
      let value = raw;
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (raw === "null") value = null;
      else if (/^-?\d+$/.test(raw)) value = Number(raw);

      const parts = key.split(".");
      let node = m;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
    }
    // Ceiling is derived from posture, never asserted by the caller.
    const tc = (m.posture || {}).tenant_class;
    m.certification = m.certification || {};
    m.certification.ceiling = certificationCeiling(tc);
    m.certification.ceiling_reason = ceilingReason(tc);
    m.updated_at = process.env.ALLOY_NOW || new Date().toISOString();
    const errors = validateManifest(m);
    if (errors.length) {
      process.stderr.write(`${errors.join("\n")}\n`);
      return 1;
    }
    writeManifest(file, m);
    process.stdout.write("ok\n");
    return 0;
  }

  if (cmd === "append-history") {
    const m = readManifest(file);
    if (!m) return 1;
    m.history.push({
      at: process.env.ALLOY_NOW || new Date().toISOString(),
      event: argv[2] || "",
      detail: argv[3] || "",
    });
    m.updated_at = process.env.ALLOY_NOW || new Date().toISOString();
    writeManifest(file, m);
    process.stdout.write("ok\n");
    return 0;
  }

  if (cmd === "validate") {
    const m = readManifest(file);
    if (!m) {
      process.stderr.write(`manifest not found: ${file}\n`);
      return 1;
    }
    const errors = validateManifest(m);
    if (errors.length) {
      process.stderr.write(`${errors.join("\n")}\n`);
      return 1;
    }
    process.stdout.write("valid\n");
    return 0;
  }

  if (cmd === "gaps") {
    const m = readManifest(file);
    if (!m) return 1;
    const gaps = declarationGaps(m);
    for (const g of gaps) process.stdout.write(`${g}\n`);
    return gaps.length ? 1 : 0;
  }

  if (cmd === "get") {
    const m = readManifest(file);
    if (!m) return 1;
    let node = m;
    for (const p of (argv[2] || "").split(".")) {
      if (node === null || node === undefined) break;
      node = node[p];
    }
    process.stdout.write(`${node === undefined || node === null ? "" : node}\n`);
    return 0;
  }

  if (cmd === "show") {
    const m = readManifest(file);
    if (!m) return 1;
    process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
    return 0;
  }

  process.stderr.write("usage: manifest-io.mjs init|set|get|show|validate|gaps|append-history <file> [...]\n");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
