"use client";

import Link from "next/link";

import type {
    WorkflowAssistErrorEnvelopeV1,
    WorkflowAssistReadCardPayloadV1,
    WorkflowAssistReadIntentV1,
    WorkflowAssistThreadMutationHandlersV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function MutationBlockedCallout({ message }: { message: string }) {
    return (
        <div
            className="space-y-1 border-t pt-2"
            style={{ borderColor: derived.border }}
            data-command-surface-workflow-assist-mutation-blocked="true"
        >
            <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }}>
                {message}
            </p>
        </div>
    );
}

function WorkflowAssistReadCardBody({
    payload,
    intent,
    mutation,
    mutationBlockedReason,
}: {
    payload: WorkflowAssistReadCardPayloadV1;
    intent: WorkflowAssistReadIntentV1;
    mutation?: WorkflowAssistThreadMutationHandlersV1 | null;
    /** When set (e.g. ops user), show copy instead of propose CTAs. */
    mutationBlockedReason?: string | null;
}) {
    const showParseHint = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const parseHint = showParseHint ? (
        <div className="text-[10px]" style={{ color: CMD.textLabel }} data-command-surface-workflow-assist-parse-reason>
            Intent: {intent.sub_intent} ({intent.parse_reason})
        </div>
    ) : null;

    switch (payload.variant) {
        case "explain_v0": {
            const ex = payload.explanation;
            const confidenceLabel =
                ex.confidence === "high" ? "High confidence" : ex.confidence === "medium" ? "Medium confidence" : "Low confidence";
            return (
                <div className="space-y-2" data-command-surface-workflow-assist-explain="true">
                    <div className="text-[13px] font-semibold">{payload.headline}</div>
                    <p className="text-[11px]" style={{ color: CMD.textSupporting }} data-command-surface-workflow-assist-explain-summary>
                        Deterministic checklist from workflow_events, workflows, and runs — not an AI guess.
                    </p>
                    {payload.needs_more_context ?
                        <p
                            className="rounded-md border px-2 py-1.5 text-[11px]"
                            style={{ borderColor: derived.border, color: semantic.warning }}
                            data-command-surface-workflow-assist-explain-needs-context
                        >
                            Needs more context: open or select a record in the workspace, then ask again.
                        </p>
                    : null}
                    <p className="text-[10px]" style={{ color: CMD.textLabel }} data-command-surface-workflow-assist-explain-confidence>
                        {confidenceLabel} · {ex.status.replace(/_/g, " ")}
                    </p>
                    <p className="text-[11px] font-medium" style={{ color: CMD.textBody }}>
                        {ex.likely_reason}
                    </p>
                    <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                        <span className="font-semibold">Next: </span>
                        {ex.recommended_action}
                    </p>
                    <ul className="space-y-2" data-command-surface-workflow-assist-explain-checklist>
                        {ex.checklist.map((item) => (
                            <li
                                key={item.id}
                                className="rounded-md border px-2 py-1.5 text-[10px]"
                                style={{ borderColor: derived.border }}
                                data-command-surface-workflow-assist-explain-checklist-item={item.id}
                            >
                                <div className="font-semibold" style={{ color: CMD.textBody }}>
                                    {item.what_checked}
                                </div>
                                <div style={{ color: CMD.textSupporting }}>Found: {item.what_found}</div>
                                {item.likely_reason ?
                                    <div style={{ color: CMD.textLabel }}>Likely: {item.likely_reason}</div>
                                : null}
                                {item.recommended_action ?
                                    <div style={{ color: CMD.textLabel }}>Action: {item.recommended_action}</div>
                                : null}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                        {ex.links.automations_href ?
                            <Link
                                href={ex.links.automations_href}
                                className="text-[11px] font-semibold underline-offset-2 hover:underline"
                                style={{ color: brand.secondary }}
                                data-command-surface-workflow-assist-explain-open-automations
                            >
                                Open Automations
                            </Link>
                        : null}
                        {ex.links.run_id && ex.links.run_href ?
                            <Link
                                href={ex.links.run_href}
                                className="text-[11px] font-semibold underline-offset-2 hover:underline"
                                style={{ color: brand.secondary }}
                                data-command-surface-workflow-assist-explain-open-run
                            >
                                View run
                            </Link>
                        : null}
                    </div>
                    {parseHint}
                </div>
            );
        }
        case "failed_runs":
            return (
                <div className="space-y-2" data-command-surface-workflow-assist-failed-runs="true">
                    <div className="text-[13px] font-semibold">{payload.headline}</div>
                    {payload.subline ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            {payload.subline}
                        </p>
                    : null}
                    {payload.failed_last_7d_kpi != null ?
                        <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                            KPI sample (7d): ~{payload.failed_last_7d_kpi} failed / failed-action runs in dashboard window
                            (see Automations for exact counts).
                        </p>
                    : null}
                    {payload.runs.length === 0 ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            No rows matched. Try Automations for the full run list and filters.
                        </p>
                    :   <ul className="max-h-[min(200px,32vh)] space-y-1.5 overflow-y-auto pr-1">
                            {payload.runs.map((r) => (
                                <li
                                    key={r.run_id}
                                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border px-2 py-1.5"
                                    style={{ borderColor: derived.border }}
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/adminV2/workflows?run=${encodeURIComponent(r.run_id)}`}
                                            className="text-[11px] font-semibold hover:underline"
                                            style={{ color: CMD.textBody }}
                                            data-command-surface-workflow-assist-failed-run-row
                                            data-run-id={r.run_id}
                                        >
                                            {r.workflow_name ?? "Workflow"}
                                        </Link>
                                        <div className="text-[10px]" style={{ color: CMD.textLabel }}>
                                            {r.status}
                                            {r.has_failed_action ? " · failed step" : ""}
                                        </div>
                                        <div className="text-[10px]" style={{ color: CMD.textSupporting }}>
                                            {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                                        </div>
                                    </div>
                                    {mutation ?
                                        <button
                                            type="button"
                                            className="shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold"
                                            style={{ borderColor: derived.border, color: CMD.textBody }}
                                            data-command-surface-workflow-assist-propose-pause-from-run
                                            onClick={() => void mutation.onProposePause(r.workflow_id)}
                                        >
                                            Propose disable
                                        </button>
                                    : null}
                                </li>
                            ))}
                        </ul>
                    }
                    {mutation ?
                        <div
                            className="space-y-2 border-t pt-2"
                            style={{ borderColor: derived.border }}
                            data-command-surface-workflow-assist-mutation-strip="true"
                        >
                            <p className="text-[10px] font-semibold" style={{ color: semantic.warning }}>
                                Admin-only proposals — org AI policy must allow{" "}
                                <span className="font-mono">workflow_assist_draft</span>.
                            </p>
                            <button
                                type="button"
                                className="rounded-md border px-2.5 py-1 text-[10px] font-semibold"
                                style={{ borderColor: derived.border, color: CMD.textBody }}
                                data-command-surface-workflow-assist-propose-create
                                onClick={() => void mutation.onProposeCreateTemplate()}
                            >
                                Propose disabled draft (template starter)
                            </button>
                        </div>
                    : mutationBlockedReason ?
                        <MutationBlockedCallout message={mutationBlockedReason} />
                    : null}
                    {parseHint}
                </div>
            );
        case "enrollment_touch":
            return (
                <div className="space-y-2" data-command-surface-workflow-assist-enrollment="true">
                    <div className="text-[13px] font-semibold">{payload.headline}</div>
                    {payload.subline ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            {payload.subline}
                        </p>
                    : null}
                    {payload.workflows.length === 0 ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            No workflows matched the enrollment-style keyword filter.
                        </p>
                    :   <ul className="max-h-[min(200px,32vh)] space-y-1 overflow-y-auto pr-1">
                            {payload.workflows.map((w) => (
                                <li
                                    key={w.workflow_id}
                                    className="flex flex-wrap items-start justify-between gap-2 text-[11px]"
                                    style={{ color: CMD.textBody }}
                                    data-command-surface-workflow-assist-enrollment-row
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="font-semibold">{w.name}</span>
                                        <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                                            {" "}
                                            · {w.event_type ?? "—"} · {w.entity_type ?? "—"}
                                            {w.enabled === false ? " · disabled" : ""}
                                        </span>
                                    </div>
                                    {mutation ?
                                        <button
                                            type="button"
                                            className="shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold"
                                            style={{ borderColor: derived.border, color: CMD.textBody }}
                                            data-command-surface-workflow-assist-propose-pause
                                            onClick={() => void mutation.onProposePause(w.workflow_id)}
                                        >
                                            Propose disable
                                        </button>
                                    : null}
                                </li>
                            ))}
                        </ul>
                    }
                    {mutation ?
                        <div
                            className="space-y-2 border-t pt-2"
                            style={{ borderColor: derived.border }}
                            data-command-surface-workflow-assist-mutation-strip="true"
                        >
                            <p className="text-[10px] font-semibold" style={{ color: semantic.warning }}>
                                Admin-only proposals — org AI policy must allow{" "}
                                <span className="font-mono">workflow_assist_draft</span>.
                            </p>
                            <button
                                type="button"
                                className="rounded-md border px-2.5 py-1 text-[10px] font-semibold"
                                style={{ borderColor: derived.border, color: CMD.textBody }}
                                data-command-surface-workflow-assist-propose-create
                                onClick={() => void mutation.onProposeCreateTemplate()}
                            >
                                Propose disabled draft (template starter)
                            </button>
                        </div>
                    : mutationBlockedReason ?
                        <MutationBlockedCallout message={mutationBlockedReason} />
                    : null}
                    {parseHint}
                </div>
            );
        case "workflow_summary":
            return (
                <div className="space-y-2" data-command-surface-workflow-assist-summary="true">
                    <div className="text-[13px] font-semibold">{payload.headline}</div>
                    {payload.subline ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            {payload.subline}
                        </p>
                    : null}
                    {payload.workflows.length === 0 ?
                        <p className="text-[11px]" style={{ color: CMD.textSupporting }}>
                            No workflows to list.
                        </p>
                    :   <ul className="max-h-[min(200px,32vh)] space-y-1 overflow-y-auto pr-1">
                            {payload.workflows.map((w) => (
                                <li
                                    key={w.workflow_id}
                                    className="flex flex-wrap items-start justify-between gap-2 text-[11px]"
                                    style={{ color: CMD.textBody }}
                                    data-command-surface-workflow-assist-summary-row
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="font-semibold">{w.name}</span>
                                        <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                                            {" "}
                                            · {w.steps_count} step{w.steps_count === 1 ? "" : "s"}
                                            {w.last_run_status ?
                                                ` · last: ${w.last_run_status}${w.last_run_has_failed_action ? " (failed action)" : ""}`
                                            :   " · no recent run in sample"}
                                        </span>
                                    </div>
                                    {mutation ?
                                        <button
                                            type="button"
                                            className="shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold"
                                            style={{ borderColor: derived.border, color: CMD.textBody }}
                                            data-command-surface-workflow-assist-propose-pause
                                            onClick={() => void mutation.onProposePause(w.workflow_id)}
                                        >
                                            Propose disable
                                        </button>
                                    : null}
                                </li>
                            ))}
                        </ul>
                    }
                    {payload.total_count > payload.workflows.length ?
                        <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                            Showing {payload.workflows.length} of {payload.total_count}. Open Automations for the full
                            list.
                        </p>
                    : null}
                    <div>
                        <Link
                            href="/adminV2/workflows"
                            className="text-[11px] font-semibold underline-offset-2 hover:underline"
                            style={{ color: brand.secondary }}
                            data-command-surface-workflow-assist-open-automations
                        >
                            Open Automations
                        </Link>
                    </div>
                    {mutation ?
                        <div
                            className="space-y-2 border-t pt-2"
                            style={{ borderColor: derived.border }}
                            data-command-surface-workflow-assist-mutation-strip="true"
                        >
                            <p className="text-[10px] font-semibold" style={{ color: semantic.warning }}>
                                Admin-only proposals — org AI policy must allow{" "}
                                <span className="font-mono">workflow_assist_draft</span>.
                            </p>
                            <button
                                type="button"
                                className="rounded-md border px-2.5 py-1 text-[10px] font-semibold"
                                style={{ borderColor: derived.border, color: CMD.textBody }}
                                data-command-surface-workflow-assist-propose-create
                                onClick={() => void mutation.onProposeCreateTemplate()}
                            >
                                Propose disabled draft (template starter)
                            </button>
                        </div>
                    : mutationBlockedReason ?
                        <MutationBlockedCallout message={mutationBlockedReason} />
                    : null}
                    {parseHint}
                </div>
            );
    }
}

export function WorkflowAssistReadThreadCard({
    submittedCommand,
    intent,
    payload,
    error,
    mutation,
    mutationBlockedReason,
}: {
    submittedCommand: string;
    intent: WorkflowAssistReadIntentV1;
    payload: WorkflowAssistReadCardPayloadV1 | null;
    error: WorkflowAssistErrorEnvelopeV1 | null;
    mutation?: WorkflowAssistThreadMutationHandlersV1 | null;
    mutationBlockedReason?: string | null;
}) {
    return (
        <div className="space-y-2" data-command-surface-workflow-assist-read-card="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                    Workflow Assist
                </div>
                <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: "rgba(0, 162, 131, 0.12)", color: brand.secondary }}
                >
                    Read-only
                </span>
            </div>
            <p className="text-[10px] italic" style={{ color: CMD.textSupporting }}>
                “{submittedCommand.trim().slice(0, 200)}”
            </p>
            {error ?
                <p className="text-[11px]" style={{ color: semantic.warning }} data-command-surface-workflow-assist-error>
                    {error.message}
                    {error.http_status ? ` (HTTP ${error.http_status})` : ""}{" "}
                    <span className="font-mono text-[10px]">[{error.code}]</span>
                </p>
            : null}
            {!error && payload ?
                <WorkflowAssistReadCardBody
                    payload={payload}
                    intent={intent}
                    mutation={mutation ?? undefined}
                    mutationBlockedReason={mutationBlockedReason ?? undefined}
                />
            : null}
        </div>
    );
}
