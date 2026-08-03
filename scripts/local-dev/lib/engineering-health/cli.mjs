#!/usr/bin/env node
/**
 * CLI entry for Engineering Health.
 */
import {
  runEngineeringHealth,
  reportToText,
  executeAction,
  listActions,
} from "./index.mjs";

function parseArgs(argv) {
  const opts = {
    json: false,
    refresh: false,
    quick: false,
    fix: null,
    yes: false,
    listActions: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--refresh") opts.refresh = true;
    else if (a === "--quick") opts.quick = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--list-actions") opts.listActions = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--fix") {
      opts.fix = argv[++i];
      if (!opts.fix) throw new Error("--fix requires an action id");
    } else {
      throw new Error(`unknown option: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`alloy-engineering-doctor [--json] [--refresh] [--quick] [--fix ID --yes]`);
    process.exit(0);
  }
  if (opts.listActions) {
    console.log(listActions().join("\n"));
    process.exit(0);
  }
  if (opts.fix) {
    const result = executeAction(opts.fix, { confirm: opts.yes });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.ok ? "OK" : "FAILED");
      if (result.detail) console.log(result.detail);
      if (result.error) console.log(`error: ${result.error}`);
      if (result.before_free_gb != null) {
        console.log(`free: ${result.before_free_gb} GB → ${result.after_free_gb} GB`);
      }
    }
    process.exit(result.ok ? 0 : 1);
  }

  const report = await runEngineeringHealth({
    refresh: opts.refresh,
    deep: !opts.quick,
  });

  if (opts.json) {
    // Trim bulky snapshot tails for JSON usability; keep metrics
    const out = {
      ...report,
      snapshot: {
        disk: report.snapshot.disk,
        docker: {
          available: report.snapshot.docker?.available,
          reclaimable_gb: report.snapshot.docker?.reclaimable_gb,
          system_df: report.snapshot.docker?.system_df,
          raw_disk: report.snapshot.docker?.raw_disk,
        },
        node: report.snapshot.node,
        ide_caches: report.snapshot.ide_caches,
        git_repos: {
          worktree_root_gb: report.snapshot.git_repos?.worktree_root_gb,
          worktree_gc: report.snapshot.git_repos?.worktree_gc,
        },
        processes: { zombie_count: report.snapshot.processes?.zombie_count },
        services: report.snapshot.services,
        large_files: report.snapshot.large_files,
      },
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(reportToText(report));
  }

  const critical = report.findings.some((f) => f.severity === "critical");
  const warning = report.findings.some((f) => f.severity === "warning");
  process.exit(critical ? 2 : warning ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
