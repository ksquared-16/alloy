/**
 * ONE RESULT OBJECT, TWO RENDERINGS.
 *
 * Tier 2 computed a per-file red ledger and wrote it only to
 * GITHUB_STEP_SUMMARY. That is the right surface for a person and the wrong one
 * for everything else: the logs API returns the job's stdout, not the rendered
 * summary, so the exact list of failing files could not be retrieved without
 * scraping markdown out of the web UI. Two consecutive missions could compare
 * Tier 2 counts and could not name the files behind them.
 *
 * So the counts and the markdown are DERIVED here from the same object, rather
 * than each being computed where it is printed. That is the whole point: a
 * summary that says 39 and an artifact that lists 30 is worse than either alone,
 * and the only way to be sure is to make it impossible.
 */

export const TIER2_REPORT_SCHEMA = "vacilando.tier2_result.v1";

/** The stdout marker a consumer greps for. One line, parseable, no secrets. */
export const TIER2_STDOUT_MARKER = "VACILANDO_TIER2_RESULT";

const RED_STATES = Object.freeze(["red", "timeout"]);

/**
 * Build the canonical result. `files` is the raw per-file observation; every
 * count below is computed from it and nowhere else.
 */
export function buildTier2Result({
  testedSha = null,
  testedRef = null,
  workflowDefinitionSha = null,
  workflowDefinitionRef = null,
  startedAt = null,
  finishedAt = null,
  excluded = {},
  files = [],
} = {}) {
  const entries = files.map((f) => ({
    path: String(f.path || ""),
    status: String(f.status || "unknown"),
    duration_ms: Number.isFinite(f.duration_ms) ? f.duration_ms : null,
    exit_code: Number.isFinite(f.exit_code) ? f.exit_code : null,
    // Bounded, and never the whole log: a failure excerpt is for triage, not
    // for reconstructing the run. Environment values are not copied here.
    failure_excerpt: f.failure_excerpt ? String(f.failure_excerpt).slice(0, 400) : null,
    classification: f.classification ? String(f.classification) : null,
  }));
  const by = (s) => entries.filter((e) => e.status === s).length;
  return {
    schema_version: TIER2_REPORT_SCHEMA,
    tested_sha: testedSha,
    tested_ref: testedRef,
    workflow_definition_sha: workflowDefinitionSha,
    workflow_definition_ref: workflowDefinitionRef,
    started_at: startedAt,
    finished_at: finishedAt,
    selected_count: entries.length,
    green_count: by("green"),
    red_count: by("red"),
    timeout_count: by("timeout"),
    skipped_count: by("skipped"),
    excluded_tier3_count: Number(excluded.tier3 || 0),
    excluded_tier4_count: Number(excluded.tier4 || 0),
    files: entries,
  };
}

/** Every file a human would have to look at. Derived, never recounted. */
export function redFiles(result) {
  return (result?.files || []).filter((f) => RED_STATES.includes(f.status));
}

/**
 * The operator's markdown. Reads its numbers off the result - it does not count
 * anything itself, which is what keeps the two renderings honest.
 */
export function renderTier2Summary(result) {
  const reds = redFiles(result);
  const lines = [
    "## Vacilando Tier 2 — extended deterministic",
    "",
    "| | |",
    "|---|---|",
    `| workflow definition | \`${result.workflow_definition_ref || "?"}\` @ \`${short(result.workflow_definition_sha)}\` |`,
    `| code under test | \`${result.tested_ref || "?"}\` @ \`${short(result.tested_sha)}\` |`,
    `| Tier 2 run here | ${result.selected_count} |`,
    `| Tier 3 host integration (excluded) | ${result.excluded_tier3_count} |`,
    `| Tier 4 certification/live (excluded) | ${result.excluded_tier4_count} |`,
    "",
    `**green ${result.green_count} · red ${result.red_count} · timeout ${result.timeout_count}**`,
    "",
  ];
  if (reds.length) {
    lines.push("<details><summary>Reds</summary>", "", "```");
    for (const f of reds) {
      lines.push(`${f.status.toUpperCase().padEnd(8)}${f.path}${f.failure_excerpt ? `  — ${f.failure_excerpt.split("\n")[0].slice(0, 120)}` : ""}`);
    }
    lines.push("```", "", "</details>", "");
  } else {
    lines.push("No reds.", "");
  }
  lines.push(`The same result is attached as a workflow artifact and printed as a \`${TIER2_STDOUT_MARKER}\` line, so it can be retrieved without scraping this page.`);
  return lines.join("\n");
}

/** The one stdout line a machine consumer reads. */
export function renderTier2StdoutMarker(result) {
  return `${TIER2_STDOUT_MARKER} ${JSON.stringify({
    schema_version: result.schema_version,
    tested_sha: result.tested_sha,
    selected_count: result.selected_count,
    green_count: result.green_count,
    red_count: result.red_count,
    timeout_count: result.timeout_count,
    red_files: redFiles(result).map((f) => f.path),
  })}`;
}

function short(sha) {
  return sha ? String(sha).slice(0, 12) : "?";
}
