/**
 * Vacilando — truthful automatic evidence collection for execution sessions.
 *
 * Only claims artifacts that actually exist (files on disk, git output, test runs).
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Collect workspace evidence after a Claude turn.
 * @returns {Array<{type:string,title:string,description?:string,fileUri?:string}>}
 */
export function collectWorkspaceEvidence({
  cwd,
  claimedFiles = [],
  deliverablePaths = [],
  summary = "",
  tests = null,
  commitsBefore = null,
} = {}) {
  const evidence = [];
  if (!cwd || !existsSync(cwd)) return evidence;

  const status = runGit(cwd, ["status", "--porcelain"]);
  const changed = [];
  for (const line of status.split("\n").filter(Boolean)) {
    const path = line.slice(3).trim().replace(/^.* -> /, "");
    if (path) changed.push(path);
  }

  const diffStat = runGit(cwd, ["diff", "--stat", "HEAD"]);
  if (diffStat) {
    evidence.push({
      type: "diff",
      title: "Git diff summary",
      description: diffStat.slice(0, 2000),
    });
  }

  const logRange = commitsBefore
    ? runGit(cwd, ["log", "--oneline", `${commitsBefore}..HEAD`])
    : "";
  if (logRange) {
    for (const line of logRange.split("\n").filter(Boolean).slice(0, 10)) {
      evidence.push({
        type: "commit",
        title: `Commit ${line.slice(0, 8)}`,
        description: line,
      });
    }
  }

  // Prefer assignment deliverables + Claude-claimed files. Only include other
  // dirty-tree paths when they intersect those sets (avoids unrelated worktree noise).
  const focus = new Set([...(claimedFiles || []), ...(deliverablePaths || [])].filter(Boolean));
  const uniquePaths = [...new Set([
    ...[...focus],
    ...changed.filter((p) => focus.size === 0 || focus.has(p) || [...focus].some((f) => p.endsWith(f) || f.endsWith(p))),
  ])];

  for (const rel of uniquePaths) {
    const abs = join(cwd, rel);
    if (!existsSync(abs)) continue;
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile()) continue;
    const isDoc = /\.(md|txt|json)$/i.test(rel);
    evidence.push({
      type: isDoc ? "document" : "diff",
      title: `${changed.includes(rel) ? "Modified" : "Present"} ${rel}`,
      description: summary || `File on disk (${st.size} bytes)`,
      fileUri: rel,
    });
  }

  if (tests?.ran === true) {
    evidence.push({
      type: "test",
      title: "Tests executed",
      description: typeof tests.results === "string"
        ? tests.results.slice(0, 1500)
        : JSON.stringify(tests.results || tests).slice(0, 1500),
    });
  }
  if (tests?.build?.ran === true) {
    evidence.push({
      type: "build",
      title: "Build result",
      description: String(tests.build.results || tests.build.summary || "").slice(0, 1000),
    });
  }
  if (Array.isArray(tests?.screenshots)) {
    for (const shot of tests.screenshots) {
      if (shot?.path && existsSync(join(cwd, shot.path))) {
        evidence.push({
          type: "screenshot",
          title: shot.title || shot.path,
          description: shot.description || "Screenshot artifact",
          fileUri: shot.path,
        });
      }
    }
  }

  if (summary) {
    evidence.push({
      type: "notes",
      title: "Worker completion notes",
      description: String(summary).slice(0, 4000),
    });
  }

  return evidence;
}

export function gitHead(cwd) {
  return runGit(cwd, ["rev-parse", "HEAD"]) || null;
}

/**
 * Build a Director completion package from session + workspace truth.
 */
export function buildCompletionPackage({
  summary,
  outcome = "complete",
  filesModified = [],
  evidence = [],
  tests = null,
  validation = [],
  decisions = [],
  risks = [],
  followUp = [],
  recommendation = "Accept deliverable",
  progressBoard = null,
} = {}) {
  return {
    summary: summary || "",
    outcome,
    filesModified: filesModified || [],
    evidenceArtifacts: (evidence || []).map((e) => ({
      type: e.type,
      title: e.title,
      fileUri: e.fileUri || null,
    })),
    tests: tests || { ran: false, results: null },
    validation: validation || [],
    decisionsMade: decisions || [],
    unresolvedRisks: risks || [],
    recommendedNextWork: followUp || [],
    recommendation,
    // Alias fields dispatch historically looked for
    risks: risks || [],
    followUp: followUp || [],
    progressBoard: progressBoard || null,
    progress_board: progressBoard || null,
  };
}
