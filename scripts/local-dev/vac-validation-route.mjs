#!/usr/bin/env node
/**
 * The routing decision behind the PreToolUse hook.
 *
 * Reads the hook payload from ALLOY_HOOK_PAYLOAD (the hook's stdin is already
 * spent), asks the S3 classifier what the command is, and prints either
 * nothing (allow) or `BLOCK` plus the message the agent will read.
 *
 * Every non-blocking outcome that still saw expensive work is RECORDED, so
 * `vac health` can report an escape rather than the host simply being slow for
 * reasons nobody can name.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { bypassRecord, routeCommand } from "./lib/vacilando/validation-routing.mjs";

const root = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
const eventsPath = join(root, "vacilando", "validation-bypass", "events.jsonl");

function record(rec) {
  try {
    mkdirSync(dirname(eventsPath), { recursive: true });
    appendFileSync(eventsPath, `${JSON.stringify(rec)}\n`, "utf8");
  } catch { /* observation must never block a command */ }
}

let payload = {};
try { payload = JSON.parse(process.env.ALLOY_HOOK_PAYLOAD || "{}"); } catch { payload = {}; }
const command = payload?.tool_input?.command || "";
if (!command.trim()) process.exit(0);

const route = routeCommand(command);

if (route.decision === "report_ambiguous" || route.decision === "report_unclassifiable") {
  record(bypassRecord({
    kind: route.decision === "report_ambiguous" ? "ambiguous" : "unclassifiable",
    command, decision: route.decision, detail: route.detail,
  }));
  process.exit(0);
}

if (route.decision !== "route_to_broker") process.exit(0);

record(bypassRecord({ kind: "routed", command, decision: route.decision, detail: route.detail }));

const lines = [
  "BLOCK",
  "BLOCKED: expensive validation must go through the governed broker.",
  "",
  "S5 is the single capacity authority on this host. A direct run takes no claim,",
  "so its cost is invisible to every other slot — which is how the host reached",
  "load 100 with four suites racing each other.",
  "",
  "Run exactly this instead:",
  "",
];
for (const r of route.replacements) lines.push(`  ${r.governed}`, `      (${r.label})`, "");
lines.push(
  "Your command is passed through verbatim: same tests, same flags, same paths.",
  "The only thing the broker changes is worker concurrency, and only when the",
  "capacity policy requires it.",
);
process.stdout.write(`${lines.join("\n")}\n`);
