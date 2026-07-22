#!/usr/bin/env node
/**
 * cert-vacilando.mjs — Vacilando Runtime Phase 1 certification.
 *
 * Runs against LIVE local toolkit state and verifies the control-plane
 * invariants the mission requires:
 *
 *   1  canonical read sources are available (alloy-ro)
 *   2  the six runtime projections compose successfully
 *   3  the snapshot schema is valid
 *   4  concurrent requests do NOT recreate the child-process storm
 *   5  the registered command allowlist rejects unknown commands
 *   6  malformed input fails closed
 *   7  preview is required where policy demands it
 *   8  confirmation cannot be bypassed
 *   9  execution results are audited
 *   10 projection refresh occurs after execution
 *   11 the SPA contains no orchestration business logic
 *   12 no arbitrary-shell execution path exists
 *
 * Read-only except for a single safe `runtime.refresh` execution (audited).
 * No worker is paused, nothing is promoted/merged/deleted.
 *
 * Run:  node scripts/local-dev/tests/cert-vacilando.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startVacilandoServer, LOOPBACK_HOST } from "../lib/vacilando-server.mjs";
import { composeSnapshot } from "../lib/vacilando/compose.mjs";
import { COMMANDS } from "../lib/vacilando/commands/registry.mjs";
import { auditPath, readAuditEvents } from "../lib/vacilando/commands/audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLKIT = resolve(HERE, "..");
let pass = 0, fail = 0;
const ok = (n) => { pass++; process.stdout.write(`  ok   ${n}\n`); };
const bad = (n, e) => { fail++; process.stdout.write(`  FAIL ${n}\n       ${e || ""}\n`); };
function check(n, cond, e) { cond ? ok(n) : bad(n, e); }

async function jget(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, data: await r.json() }; }
async function jpost(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}

async function main() {
  // ---- 1/2/3 compose + schema (live) ----
  const snap = await composeSnapshot({ nowMs: 1721600000000 });
  check("1  canonical read sources available", snap.sources && snap.sources.agent_status?.ok === true, JSON.stringify(snap.sources));
  const six = ["project", "sprints", "workers", "repository", "approvals", "activity"];
  check("2  six runtime projections compose", six.every((k) => snap[k] !== undefined), `missing: ${six.filter((k) => snap[k] === undefined)}`);
  check("3  snapshot schema valid", snap.schema_version === "vacilando.snapshot.v1" && Array.isArray(snap.sprints) && Array.isArray(snap.gaps));

  // ---- server for the HTTP-surface checks ----
  const { server, close } = await startVacilandoServer(0);
  const base = `http://${LOOPBACK_HOST}:${server.address().port}`;
  try {
    const health = await jget(base, "/api/health");
    check("   /api/health ok + loopback", health.data.ok === true && server.address().address === LOOPBACK_HOST);

    // ---- 4 concurrency: no storm (single-flight → identical generated_at) ----
    const many = await Promise.all(Array.from({ length: 12 }, () => jget(base, "/api/state")));
    const allOk = many.every((r) => r.status === 200 && r.data.schema_version === "vacilando.snapshot.v1");
    const gens = new Set(many.map((r) => r.data.generated_at));
    check("4  concurrent requests do not storm (single compose served)", allOk && gens.size === 1, `statuses=${many.map((r) => r.status)} distinct_gen=${gens.size}`);

    // ---- 5 unknown command fails closed ----
    const unk = await jpost(base, "/api/commands", { command: "evil.exec", input: {} });
    check("5  unknown command rejected (404, unknown_command)", unk.status === 404 && unk.data.code === "unknown_command");

    // ---- 6 malformed input fails closed ----
    const mal = await jpost(base, "/api/commands/preview", { command: "worker.doctor", input: { slot: 99, junk: 1 } });
    check("6  malformed input fails closed (invalid_input)", mal.data.ok === false && mal.data.code === "invalid_input");

    // ---- 7 preview required for consequential ----
    const pv = await jpost(base, "/api/commands/preview", { command: "worker.pause", input: { slot: 1 } });
    check("7  preview marks consequential as requiring confirmation", pv.data.ok === true && pv.data.requires_confirmation === true && pv.data.will_run?.bin === "alloy-worker-pause");

    // ---- 8 confirmation cannot be bypassed ----
    const noConfirm = await jpost(base, "/api/commands", { command: "worker.pause", input: { slot: 1 }, confirm: false });
    check("8  execute without confirmation is refused (428)", noConfirm.status === 428 && noConfirm.data.code === "confirmation_required");

    // ---- 9/10 execution audited + refresh occurs (safe command) ----
    const before = readAuditEvents(500).length;
    const exec = await jpost(base, "/api/commands", { command: "runtime.refresh", input: {}, confirm: true });
    const after = readAuditEvents(500).length;
    check("9  execution is audited", exec.data.stage === "execute" && after === before + 1 && Boolean(exec.data.audit?.id) && existsSync(auditPath()));
    check("10 projection refresh occurs after execution", Array.isArray(exec.data.sources_refreshed) && exec.data.sources_refreshed.includes("snapshot") && Boolean(exec.data.snapshot));
  } finally {
    close();
  }

  // ---- 11 SPA has no orchestration business logic ----
  const appJs = readFileSync(join(TOOLKIT, "apps", "vacilando", "public", "app.js"), "utf8");
  const spaClean = !/child_process|execFile|spawnSync|\bspawn\(|require\(|alloy-/.test(appJs);
  check("11 SPA contains no orchestration logic (talks only to /api/*)", spaClean, "app.js references orchestration primitives");

  // ---- 12 no arbitrary-shell path in the executor (scan CODE, not comments) ----
  const execRaw = readFileSync(join(TOOLKIT, "lib", "vacilando", "commands", "executor.mjs"), "utf8");
  const execCode = execRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const noShell = /shell:\s*false/.test(execCode) && !/shell:\s*true/.test(execCode) && !/\bexec\(/.test(execCode) && !/\bspawn\b/.test(execCode) && !/sh\s*-c/.test(execCode);
  check("12 executor uses execFile with shell:false; no shell/exec path", noShell, "executor has a shell path");

  // ---- 12b every command binds a FIXED bin + buildArgv (no raw command strings) ----
  const cliCmds = Object.values(COMMANDS).filter((c) => c.execution === "cli");
  const boundOk = cliCmds.every((c) => typeof c.bin === "string" && /^alloy-[a-z-]+$/.test(c.bin) && typeof c.buildArgv === "function");
  check("12b cli commands bind a fixed alloy-* bin + buildArgv (no shell strings)", boundOk, cliCmds.map((c) => c.bin).join(","));
  // question.answer maps to the exact governed toolkit command
  const qa = COMMANDS["question.answer"];
  const argv = qa.buildArgv({ initiative_key: "k", decision_id: "decision-001", choice: "opt-a", decided_by: "Kelly", reason: "why" });
  check("12c question.answer maps to alloy-product-decide with correct argv",
    qa.bin === "alloy-product-decide" && JSON.stringify(argv) === JSON.stringify(["k", "decision-001", "--choice", "opt-a", "--decided-by", "Kelly", "--reason", "why"]));

  process.stdout.write(`\n==== Vacilando Phase 1 certification: ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { process.stderr.write(`cert error: ${e.stack || e}\n`); process.exit(1); });
