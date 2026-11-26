/**
 * Human presentation for `alloy-engineering-doctor`.
 */

function pad(s, n) {
  return String(s).padEnd(n);
}

function sevIcon(sev) {
  return ({ healthy: "ok", info: "info", warning: "WARN", critical: "CRIT" })[sev] || sev;
}

export function formatDoctorReport(report) {
  const lines = [];
  lines.push("Engineering Health");
  lines.push("==================");
  lines.push("");
  lines.push(`Overall          ${report.score.overall}%`);
  lines.push("");

  const order = ["disk", "docker", "node", "git", "caches", "processes", "services"];
  lines.push("Subsystems");
  for (const key of order) {
    const s = report.score.subsystems[key];
    if (!s) continue;
    lines.push(`  ${pad(key, 12)} ${pad(sevIcon(s.status), 6)}  ${s.label}`);
  }
  lines.push("");

  const warnings = report.findings.filter((f) => f.severity !== "healthy");
  if (warnings.length) {
    lines.push("Warnings");
    for (const f of warnings.slice(0, 12)) {
      lines.push(`  [${sevIcon(f.severity)}] ${f.title}`);
      lines.push(`         ${f.reason}`);
      if (f.metrics?.prediction?.days_to_full != null) {
        lines.push(`         Growth ≈ ${f.metrics.prediction.gb_per_day} GB/day → ~${f.metrics.prediction.days_to_full} days to full`);
      }
    }
    lines.push("");
  }

  const recs = report.recommendations || [];
  if (recs.length) {
    lines.push("Recommendations");
    recs.slice(0, 8).forEach((r, i) => {
      lines.push(`  ${i + 1}. ${r.title}`);
      lines.push(`     Reason: ${r.reason}`);
      if (r.estimated_reclaim_gb != null) lines.push(`     Est. reclaim: ${r.estimated_reclaim_gb} GB`);
      lines.push(`     Risk: ${r.risk}`);
      if (r.command) lines.push(`     Action: ${r.command}`);
    });
    lines.push("");
    lines.push(`Potential recovery   ${report.potential_recovery_gb ?? 0} GB`);
  } else {
    lines.push("No remediation recommendations.");
  }

  lines.push("");
  lines.push(`Generated ${report.generated_at}`);
  if (report.cache_summary) {
    lines.push(`Collectors: ${report.cache_summary}`);
  }
  return lines.join("\n");
}
