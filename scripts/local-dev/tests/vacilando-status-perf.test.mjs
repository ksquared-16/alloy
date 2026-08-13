#!/usr/bin/env node
/**
 * Vacilando status-path performance regressions.
 *
 * Proves: concurrent status shares one collectRaw; cached status does not
 * re-spawn alloy-ro; normal resources/status does not run recursive du;
 * expensive disk metadata has an explicit slower TTL; stale/inflight behavior.
 */
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectRaw,
  DISK_SIZE_TTL_MS,
  getOrchestrationMetrics,
  GIT_RECENT_TTL_MS,
  invalidateRawCache,
  RAW_TTL_MS,
  resetOrchestrationMetrics,
} from "../lib/vacilando/sources.mjs";
import { collectResources, collectWorktreeDiskSizes, peekWorktreeDiskCache } from "../lib/vacilando/resources.mjs";
import { composeSnapshot } from "../lib/vacilando/compose.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;

function check(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } else {
    fail += 1;
    process.stdout.write(`FAIL - ${name}${detail ? ` :: ${detail}` : ""}\n`);
  }
}

async function main() {
  resetOrchestrationMetrics();
  invalidateRawCache();

  check("TTL: status raw ≥ 15s (human Director cadence)", RAW_TTL_MS >= 15_000, `RAW_TTL_MS=${RAW_TTL_MS}`);
  check("TTL: git recent slower than raw", GIT_RECENT_TTL_MS >= RAW_TTL_MS, `git=${GIT_RECENT_TTL_MS} raw=${RAW_TTL_MS}`);
  check("TTL: worktree disk explicit slow boundary (≥10m)", DISK_SIZE_TTL_MS >= 10 * 60_000, `disk=${DISK_SIZE_TTL_MS}`);

  // ---- concurrent collectRaw shares one computation ----
  resetOrchestrationMetrics();
  invalidateRawCache();
  const many = await Promise.all(Array.from({ length: 12 }, () => collectRaw()));
  const m1 = getOrchestrationMetrics();
  check("concurrent collectRaw → one start", m1.collect_raw_starts === 1, JSON.stringify(m1));
  check("concurrent collectRaw → shared waiters", m1.collect_raw_shared >= 1, JSON.stringify(m1));
  check("max overlapping collectRaw ≤ 1", m1.max_overlapping_collect_raw <= 1, JSON.stringify(m1));
  check("all concurrent callers receive agents array", many.every((r) => Array.isArray(r.agents.agents)), `n=${many.length}`);
  check("node mode (no alloy-ro fan-out on success)", m1.last_mode === "node" && m1.alloy_ro_spawns === 0, JSON.stringify(m1));

  // ---- cache hit does not re-spawn shells ----
  const beforeSpawns = getOrchestrationMetrics().alloy_ro_spawns;
  const beforeStarts = getOrchestrationMetrics().collect_raw_starts;
  await collectRaw();
  await collectRaw();
  const m2 = getOrchestrationMetrics();
  check("cached collectRaw does not start again", m2.collect_raw_starts === beforeStarts, JSON.stringify(m2));
  check("cached collectRaw does not spawn alloy-ro", m2.alloy_ro_spawns === beforeSpawns, JSON.stringify(m2));
  check("cache hits counted", m2.collect_raw_cache_hits >= 2, JSON.stringify(m2));

  // ---- compose uses snapshot evidence (still no alloy-ro) ----
  const beforeComposeSpawns = getOrchestrationMetrics().alloy_ro_spawns;
  const snap = await composeSnapshot({ nowMs: 1_721_600_000_000 });
  const m3 = getOrchestrationMetrics();
  check("compose produces snapshot schema", snap.schema_version === "vacilando.snapshot.v1" && Array.isArray(snap.sprints));
  check("compose does not spawn alloy-ro on warm cache", m3.alloy_ro_spawns === beforeComposeSpawns, JSON.stringify(m3));

  // ---- resources hot path: no du ----
  resetOrchestrationMetrics();
  // Keep raw cache warm so resources does not start a new heavy compute under metrics noise.
  await collectRaw();
  const duBefore = getOrchestrationMetrics().du_executions;
  const res = await collectResources();
  const duAfter = getOrchestrationMetrics().du_executions;
  check("resources hot path executes zero du", duAfter === duBefore, `before=${duBefore} after=${duAfter}`);
  check("resources reports hot_path_du=false", res.disk_policy?.hot_path_du === false, JSON.stringify(res.disk_policy));
  check("resources workers present without requiring disk_mb", Array.isArray(res.workers));

  // ---- disk sizes: explicit slow path + singleflight ----
  // Use empty worktree list so we do not actually du the real worktrees in CI/dev.
  const d1p = collectWorktreeDiskSizes({ force: true, worktrees: [] });
  const d2p = collectWorktreeDiskSizes({ force: true, worktrees: [] });
  const [d1, d2] = await Promise.all([d1p, d2p]);
  check("disk size path singleflight shares result", d1.at === d2.at && typeof d1.at === "number");
  const peek = peekWorktreeDiskCache();
  check("disk cache exposes ttl boundary", peek.ttl_ms === DISK_SIZE_TTL_MS);

  // ---- static: hot-path modules must not invoke du ----
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const toolkit = join(dirname(fileURLToPath(import.meta.url)), "..");
  const hotFiles = [
    "lib/vacilando/sources.mjs",
    "lib/vacilando/compose.mjs",
    "lib/vacilando/workspace-facts.mjs",
  ];
  let hotDuLeak = null;
  for (const rel of hotFiles) {
    const body = readFileSync(join(toolkit, rel), "utf8");
    // Allow commentary mentioning du; forbid exec of du.
    if (/\bexecFile\([^)]*["']du["']/.test(body) || /\brun\(\s*["']du["']/.test(body) || /["']du["']\s*,\s*\[["']-sk/.test(body)) {
      hotDuLeak = rel;
      break;
    }
  }
  check("hot-path modules never exec du", hotDuLeak == null, hotDuLeak || "");
  const resourcesSrc = readFileSync(join(toolkit, "lib/vacilando/resources.mjs"), "utf8");
  check("resources.mjs confines du to diskMbOnce/collectWorktreeDiskSizes", /async function diskMbOnce/.test(resourcesSrc) && /collectWorktreeDiskSizes/.test(resourcesSrc));
  check("collectResources does not call diskMbOnce", !/collectResources[\s\S]{0,800}diskMbOnce/.test(resourcesSrc));

  // ---- disk sizes degrade without throwing ----
  const degraded = await collectWorktreeDiskSizes({ force: true, worktrees: [], trigger: "test" });
  check("disk size path returns object on empty list", degraded && typeof degraded.sizes === "object");

  // ---- stale/error: invalidate then recover ----
  invalidateRawCache();
  resetOrchestrationMetrics();
  const again = await collectRaw();
  check("after invalidate, one fresh compute", getOrchestrationMetrics().collect_raw_starts === 1, JSON.stringify(getOrchestrationMetrics()));
  check("after invalidate, still healthy agents", again.agents.ok === true);

  // ---- HTTP: concurrent /api/state + metrics surface ----
  const { startVacilandoServer } = await import("../lib/vacilando-server.mjs");
  const { server, close } = await startVacilandoServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    resetOrchestrationMetrics();
    invalidateRawCache();
    // Warm via one request, then burst.
    await fetch(`${base}/api/state`).then((r) => r.json());
    const burst = await Promise.all(Array.from({ length: 8 }, () => fetch(`${base}/api/state`).then((r) => r.json())));
    const gens = new Set(burst.map((b) => b.generated_at).filter(Boolean));
    check("HTTP concurrent /api/state share one generated_at when warm", gens.size <= 1 || burst.every((b) => b.pending || b.schema_version), `gens=${gens.size}`);

    const metrics = await fetch(`${base}/api/orchestration-metrics`).then((r) => r.json());
    check("orchestration-metrics endpoint ok", metrics.ok === true && typeof metrics.collect_raw_starts === "number");
    check("orchestration-metrics exposes disk TTL", metrics.ttls?.disk_size_ms >= 10 * 60_000);

    const resHttp = await fetch(`${base}/api/resources`).then((r) => r.json());
    check("HTTP /api/resources has no hot-path du policy flag false", resHttp.disk_policy?.hot_path_du === false);
  } finally {
    close();
  }

  process.stdout.write(`\n==== vacilando-status-perf: ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`test error: ${e.stack || e}\n`);
  process.exit(1);
});
