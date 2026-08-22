#!/usr/bin/env node
/**
 * Worker-facing structured agent report.
 *
 *   vac run-report <run_id> <type> --message-file <path>   [--lane <id>] [...]
 *   vac run-report <run_id> <type> --message-file -        (read the message from stdin)
 *   vac run-report <run_id> --json-file <path>             (whole report as JSON)
 *   vac run-report <run_id> <type> --message "short text"
 *
 * types: progress | needs-input | completion | failure
 *
 * WHY A FILE OR STDIN IS THE DEFAULT. The user-facing message is multi-paragraph
 * Markdown with headings, bullets, tables, backticks and shell-significant
 * characters. Putting that in one shell argument is how a final summary gets
 * mangled or silently cut. `--message-file` (or `-` for stdin) hands the bytes
 * over untouched. `--message` stays for one-liners only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { submitAgentReport } from "./lib/vacilando/execution-run-report.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage:
  vac run-report <run_id> <type> --message-file <path|-> [--lane <lane_id>] [options]
  vac run-report <run_id> <type> --message "one line"     [--lane <lane_id>] [options]
  vac run-report <run_id> --json-file <path|->            [--lane <lane_id>]

Types: progress | needs-input | completion | failure

Options:
  --phase <text>          progress: which phase of the work this is
  --reason <text>         needs-input/failure: context behind the report
  --choice <label>        needs-input: a response option (repeatable)
  --non-blocking          needs-input: a note, not a gate; the run keeps working
  --revision <n>          monotonic; an older revision is rejected
  --result <k=v>          completion/failure: result metadata (repeatable)
  --at <iso>              report timestamp (defaults to now)

The message is the complete user-facing text. It is stored verbatim and is what
the operator reads and copies. It is not a terminal capture and is not bounded
by one.
`);
  process.exit(code);
}

function readMaybeStdin(path) {
  if (path === "-") return readFileSync(0, "utf8");
  return readFileSync(path, "utf8");
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

const runId = args.shift();
if (!runId || runId.startsWith("-")) usage();

let type = null;
if (args.length && !args[0].startsWith("-")) type = args.shift();

let message = null;
let messageFile = null;
let jsonFile = null;
let lane = null;
let phase = null;
let reason = null;
let revision = null;
let at = null;
let blocking = undefined;
const choices = [];
const result = {};

while (args.length) {
  const a = args.shift();
  const take = (inline, flag) => (a.startsWith(inline) ? a.slice(inline.length) : (args.shift() ?? usage()));
  if (a === "--message" || a.startsWith("--message=")) message = take("--message=");
  else if (a === "--message-file" || a.startsWith("--message-file=")) messageFile = take("--message-file=");
  else if (a === "--json-file" || a.startsWith("--json-file=")) jsonFile = take("--json-file=");
  else if (a === "--lane" || a.startsWith("--lane=")) lane = take("--lane=");
  else if (a === "--phase" || a.startsWith("--phase=")) phase = take("--phase=");
  else if (a === "--reason" || a.startsWith("--reason=")) reason = take("--reason=");
  else if (a === "--revision" || a.startsWith("--revision=")) revision = take("--revision=");
  else if (a === "--at" || a.startsWith("--at=")) at = take("--at=");
  else if (a === "--choice" || a.startsWith("--choice=")) choices.push(take("--choice="));
  else if (a === "--non-blocking") blocking = false;
  else if (a === "--result" || a.startsWith("--result=")) {
    const kv = take("--result=");
    const eq = String(kv).indexOf("=");
    if (eq < 1) usage();
    result[kv.slice(0, eq)] = kv.slice(eq + 1);
  } else usage();
}

let payload = {};
if (jsonFile) {
  try {
    payload = JSON.parse(readMaybeStdin(jsonFile));
  } catch (e) {
    process.stderr.write(`vac run-report: unreadable JSON payload (${e.message})\n`);
    process.exit(1);
  }
}

if (messageFile) {
  try {
    message = readMaybeStdin(messageFile);
  } catch (e) {
    process.stderr.write(`vac run-report: cannot read message (${e.message})\n`);
    process.exit(1);
  }
}

const out = submitAgentReport(runId, {
  type: type || payload.type,
  message: message != null ? message : payload.message,
  phase: phase ?? payload.phase ?? null,
  reason: reason ?? payload.reason ?? null,
  revision: revision != null ? Number(revision) : (payload.revision ?? null),
  choices: choices.length ? choices : (payload.choices ?? null),
  blocking: blocking !== undefined ? blocking : payload.blocking,
  result: Object.keys(result).length ? result : (payload.result ?? null),
  at: at ?? payload.at ?? null,
  laneId: lane || payload.lane_id || null,
  cwd: resolve(process.cwd()),
  origin: "agent",
});

if (!out.ok) {
  process.stderr.write(`vac run-report: ${out.error}${out.state ? ` (${out.state})` : ""}\n`);
  const hard = ["worktree_mismatch", "lane_mismatch", "run_already_terminal", "stale_revision"];
  process.exit(hard.includes(out.error) ? 4 : 1);
}

const r = out.report;
process.stdout.write(
  `${r.run_id} ${r.lane_id} ${r.type} rev=${r.revision} bytes=${r.message_bytes}`
  + `${out.transition ? ` -> ${out.transition}` : ""}${out.duplicate ? " (duplicate, no-op)" : ""}\n`,
);
