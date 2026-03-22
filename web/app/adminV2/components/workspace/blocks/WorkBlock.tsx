"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { WorkVm, WorkflowRunVm, WorkflowRunStatusVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  work: WorkVm;
  onAction: WorkspaceActionHandler;
  mode?: "full" | "summary";
  surface?: "default" | "department";
};

function statusLabel(s: WorkflowRunStatusVm): string {
  switch (s) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

/** Fallback when adapters only send legacy `steps`. */
function workflowRunsForDisplay(work: WorkVm): WorkflowRunVm[] {
  if (work.workflowRuns?.length) return work.workflowRuns;
  if (!work.steps?.length) return [];
  return work.steps.map((s) => ({
    id: s.id,
    name: s.label,
    status: s.done ? "completed" : "running",
  }));
}

export default function WorkBlock({ work, onAction, mode = "full", surface = "default" }: Props) {
  const showOpenExecution = mode === "full";
  const deptWorkflows = surface === "department" && mode === "summary";
  const m = work.workflowMetrics;
  const runs = deptWorkflows ? workflowRunsForDisplay(work) : [];

  const runsList =
    deptWorkflows && runs.length > 0 ? (
      <div className="adminv2-ws-dept-workflows-list-wrap">
        <div className="adminv2-ws-dept-workflows-list-head" aria-hidden>
          <span>Workflow</span>
          <span>Status</span>
          <span>Last run</span>
          <span className="adminv2-ws-dept-workflows-list-head-success">OK</span>
        </div>
        <ul className="adminv2-ws-dept-workflows-runs" role="list">
          {runs.map((r) => (
            <li key={r.id} className="adminv2-ws-dept-workflows-run" role="listitem">
              <span className="adminv2-ws-dept-workflows-run-name">{r.name}</span>
              <span className="adminv2-ws-dept-workflows-run-status" data-status={r.status}>
                {statusLabel(r.status)}
              </span>
              <span className="adminv2-ws-dept-workflows-run-timing">{r.lastRunLabel ?? "—"}</span>
              <span
                className="adminv2-ws-dept-workflows-run-indicator"
                data-status={r.status}
                aria-label={
                  r.status === "failed"
                    ? "Failed"
                    : r.status === "completed"
                      ? "Succeeded"
                      : "In progress"
                }
              />
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const sharedTail = (
    <>
      {work.assignees && work.assignees.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: deptWorkflows ? "inherit" : derived.textSecondary,
            opacity: deptWorkflows ? 0.75 : 1,
            marginBottom: deptWorkflows ? 4 : 6,
          }}
        >
          {work.assignees.join(" · ")}
        </div>
      )}
      {!deptWorkflows && work.steps && work.steps.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {work.steps.map((step) => (
            <li
              key={step.id}
              style={{
                fontSize: 11,
                padding: "4px 0",
                borderBottom: `1px solid ${derived.border}`,
                color: step.done ? derived.textSecondary : neutral.textPrimary,
                textDecoration: step.done ? "line-through" : undefined,
              }}
            >
              {step.label}
            </li>
          ))}
        </ul>
      )}
      {work.aiSuggestion && (
        <div
          className={deptWorkflows ? "adminv2-ws-dept-workflows-ai" : undefined}
          style={
            deptWorkflows
              ? undefined
              : { fontSize: 10, color: brand.secondary, marginTop: 6, fontStyle: "italic" }
          }
        >
          {work.aiSuggestion}
        </div>
      )}
      {showOpenExecution && (
        <button
          type="button"
          onClick={() => onAction({ type: "work.action", workId: work.id, actionId: "open_work" })}
          style={{
            marginTop: 10,
            fontSize: 12,
            fontWeight: 600,
            color: brand.primary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Open execution →
        </button>
      )}
    </>
  );

  if (deptWorkflows) {
    return (
      <div className="adminv2-ws-dept-workflows-panel">
        <div className="adminv2-ws-dept-workflows-toolbar">
          <div className="adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--left">
            <span className="adminv2-ws-dept-workflows-toolbar-kicker">Automation &amp; workflows</span>
          </div>
          <div className="adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--center">
            {work.progressLabel ? (
              <span className="adminv2-ws-dept-workflows-toolbar-progress">{work.progressLabel}</span>
            ) : null}
          </div>
          <div className="adminv2-ws-dept-workflows-toolbar-zone adminv2-ws-dept-workflows-toolbar-zone--right">
            {m ? (
              <div className="adminv2-ws-dept-workflows-toolbar-metrics" role="group" aria-label="Workflow performance">
                {m.avgRunTimeLabel ? (
                  <span className="adminv2-ws-dept-workflows-toolbar-metric">
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-label">Avg run</span>
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-value">{m.avgRunTimeLabel}</span>
                  </span>
                ) : null}
                {m.successRateLabel ? (
                  <span className="adminv2-ws-dept-workflows-toolbar-metric adminv2-ws-dept-workflows-toolbar-metric--success">
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-label">Success</span>
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-value">{m.successRateLabel}</span>
                  </span>
                ) : null}
                {m.runsTodayLabel ? (
                  <span className="adminv2-ws-dept-workflows-toolbar-metric">
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-label">Runs today</span>
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-value">{m.runsTodayLabel}</span>
                  </span>
                ) : null}
                {m.failuresTodayLabel != null && m.failuresTodayLabel !== "" ? (
                  <span className="adminv2-ws-dept-workflows-toolbar-metric adminv2-ws-dept-workflows-toolbar-metric--failures">
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-label">Failures</span>
                    <span className="adminv2-ws-dept-workflows-toolbar-metric-value">{m.failuresTodayLabel}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {runsList}
        {sharedTail}
      </div>
    );
  }

  const body = (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6,
        }}
      >
        <h3
          style={{
            fontSize: mode === "full" ? 16 : 12,
            fontWeight: 700,
            color: neutral.textPrimary,
            margin: 0,
          }}
        >
          {work.title}
        </h3>
        {work.progressLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: derived.textSecondary,
            }}
          >
            {work.progressLabel}
          </span>
        )}
      </div>
      {sharedTail}
    </>
  );

  return <div className="adminv2-ws-zone" style={{ padding: "12px 14px" }}>{body}</div>;
}
