#!/usr/bin/env node
/**
 * Lane-facing certification fixture execution.
 *
 *   vac certify-fixture --list
 *   vac certify-fixture <fixture> <ensure|verify|reset> --lane <lane_id> [--identity-decision <d>]
 *
 * The lane names a fixture and an operation. It never receives, and never needs
 * to look for, privileged credentials: those are loaded inside the trusted
 * runner and stay there. Results come back structured, so no one has to read
 * terminal output and relay an id by hand.
 */
import { resolve } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import {
  listCertificationFixtures,
  runCertificationFixture,
} from "./lib/vacilando/certification-fixture.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac certify-fixture <fixture> <operation> --lane <lane_id> [--identity-decision <d>] [--org <uuid>] [--json]
       vac certify-fixture --list

Operations are allowlisted per fixture. Credentials never enter the worktree.
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

if (args[0] === "--list" || args[0] === "list") {
  process.stdout.write(`${JSON.stringify({ ok: true, fixtures: listCertificationFixtures() }, null, 2)}\n`);
  process.exit(0);
}

const fixture = args.shift();
const operation = args.shift();
if (!fixture || !operation || fixture.startsWith("-") || operation.startsWith("-")) usage();

let lane = null;
let identityDecision = null;
let orgId = null;
let asJson = false;
while (args.length) {
  const a = args.shift();
  if (a === "--lane") lane = args.shift() || "";
  else if (a.startsWith("--lane=")) lane = a.slice(7);
  else if (a === "--identity-decision") identityDecision = args.shift() || "";
  else if (a.startsWith("--identity-decision=")) identityDecision = a.slice(20);
  else if (a === "--org") orgId = args.shift() || "";
  else if (a.startsWith("--org=")) orgId = a.slice(6);
  else if (a === "--json") asJson = true;
  else usage();
}
if (!lane) usage();

const out = await runCertificationFixture({
  fixture,
  operation,
  laneId: lane,
  cwd: resolve(process.cwd()),
  identityDecision,
  orgId,
});

if (asJson) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.ok ? 0 : (out.needs_operator ? 5 : 4));
}

if (!out.ok) {
  process.stderr.write(`vac certify-fixture: ${out.error}\n`);
  if (out.detail) process.stderr.write(`  ${out.detail}\n`);
  if (out.allowlisted) process.stderr.write(`  allowlisted: ${out.allowlisted.join(", ")}\n`);
  if (out.needs_operator) {
    process.stderr.write("  This is an identity decision, not a failure. It needs the operator.\n");
  }
  process.exit(out.needs_operator ? 5 : 4);
}

process.stdout.write(`${out.fixture} ${out.operation} ok · namespace ${out.reserved_namespace}\n`);
const ids = out.ids || {};
for (const [k, v] of Object.entries(ids)) {
  if (Array.isArray(v) ? v.length : v) process.stdout.write(`  ${k}: ${Array.isArray(v) ? v.join(", ") : v}\n`);
}
for (const c of out.checks || []) process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.check}\n`);
process.stdout.write("  credentials never entered the worktree\n");
