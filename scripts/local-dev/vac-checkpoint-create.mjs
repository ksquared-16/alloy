#!/usr/bin/env node
/**
 * Explicit checkpoint creation.
 *
 * Separate from `vac run-status` on purpose. Reporting run state is read-only;
 * this is the only command that commits, and it commits exactly the paths it is
 * given. There is no flag on either command that restores the old behaviour of
 * committing every dirty file.
 *
 *   vac checkpoint-create <run_id> --expected-head <sha> \
 *     --message-file <path> --path <rel> [--path <rel> …]
 */
import { resolve } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { createCheckpoint } from "./lib/vacilando/checkpoint-create.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac checkpoint-create <run_id> --expected-head <sha> (--message <text> | --message-file <path>) --path <rel> [--path <rel> ...]

Commits ONLY the named paths. Refuses a path that was already dirty when the run
started, refuses staged content outside the manifest, and refuses if HEAD has
moved from --expected-head.

Adopting work from a run that died mid-turn:
  --adopt <rel>=<sha256>   claim one pre-dirty path by its exact content
  --adopt-from <run_id>    the run that authored it
  --adopt-reason <text>    why this run owns the change

Adoption is content-bound: if the file changed after the fingerprint was taken
the claim is refused. Paths nobody adopts are still refused as foreign, and each
adoption is written to vacilando/checkpoint-adoptions.jsonl.
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

const runId = args.shift();
if (!runId || runId.startsWith("-")) usage();

let expectedHead = null;
let message = null;
let messageFile = null;
let allowForeign = false;
let json = false;
let adoptFrom = null;
let adoptReason = null;
const paths = [];
const adopt = [];
while (args.length) {
  const a = args.shift();
  if (a === "--expected-head") expectedHead = args.shift() || "";
  else if (a.startsWith("--expected-head=")) expectedHead = a.slice(16);
  else if (a === "--message") message = args.shift() || "";
  else if (a.startsWith("--message=")) message = a.slice(10);
  else if (a === "--message-file") messageFile = args.shift() || "";
  else if (a.startsWith("--message-file=")) messageFile = a.slice(15);
  else if (a === "--path") paths.push(args.shift() || "");
  else if (a.startsWith("--path=")) paths.push(a.slice(7));
  else if (a === "--allow-foreign") allowForeign = true;
  else if (a === "--adopt") adopt.push(args.shift() || "");
  else if (a.startsWith("--adopt=")) adopt.push(a.slice(8));
  else if (a === "--adopt-from") adoptFrom = args.shift() || "";
  else if (a.startsWith("--adopt-from=")) adoptFrom = a.slice(13);
  else if (a === "--adopt-reason") adoptReason = args.shift() || "";
  else if (a.startsWith("--adopt-reason=")) adoptReason = a.slice(15);
  else if (a === "--json") json = true;
  else usage();
}

const out = await createCheckpoint({
  runId,
  expectedHead,
  message,
  messageFile,
  paths,
  allowForeign,
  adopt,
  adoptFrom,
  adoptReason,
  origin: "operator",
  cwd: resolve(process.cwd()),
});

if (json) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out.ok ? 0 : 4);
}

if (!out.ok) {
  const extra = out.path ? ` (${out.path})`
    : (Array.isArray(out.paths) && out.paths.length ? ` (${out.paths.slice(0, 5).join(", ")}${out.count > 5 ? `, +${out.count - 5} more` : ""})` : "");
  process.stderr.write(`vac checkpoint-create: ${out.error}${extra}\n`);
  if (out.detail) process.stderr.write(`  ${out.detail}\n`);
  if (out.expected && out.actual) process.stderr.write(`  expected HEAD ${out.expected}, found ${out.actual}\n`);
  process.exit(4);
}

if (out.already) {
  process.stdout.write(`${out.sha} already checkpointed (${out.paths.length} path${out.paths.length === 1 ? "" : "s"})\n`);
  process.exit(0);
}
process.stdout.write(`${out.sha} committed ${out.paths.length} path${out.paths.length === 1 ? "" : "s"}\n`);
for (const p of out.paths.slice(0, 20)) process.stdout.write(`  ${p}\n`);
if (out.paths.length > 20) process.stdout.write(`  … ${out.paths.length - 20} more\n`);
