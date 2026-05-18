"use client";

import type { RefObject } from "react";

import type { WorkflowAssistWorkflowMetadataV1 } from "@/lib/workflows/workflowScopeMetadata";
import { parseWorkflowScopeFromMetadata } from "@/lib/workflows/workflowScopeMetadata";
import { derived } from "@/styles/tokens/colors";

type WorkflowDetailRow = {
    id: string;
    name: string | null;
    description?: string | null;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
    metadata?: Record<string, unknown> | null;
};

type WorkflowActionDefRow = {
    id: string;
    action_order: number;
    action_type: string;
    target_entity: string | null;
    payload: Record<string, unknown>;
};

type WorkflowConditionRow = {
    id: string;
    field_path: string | null;
    operator: string | null;
    value_jsonb: unknown;
    enabled: boolean | null;
    target_entity: string | null;
};

function summarizeWorkflowAction(a: WorkflowActionDefRow): { title: string; subtitle: string } {
    const ty = (a.action_type ?? "").toString();
    const target = (a.target_entity ?? "").toString();
    const payload = a.payload && typeof a.payload === "object" ? a.payload : {};
    const maybe = (k: string) => {
        const v = (payload as Record<string, unknown>)[k];
        if (v == null) return null;
        if (typeof v === "string" && v.trim()) return v.trim();
        return null;
    };
    const bits: string[] = [];
    if (maybe("channel")) bits.push(`channel: ${maybe("channel")}`);
    const subtitle = bits.length ? bits.join(" · ") : "Configured step";
    const title = target ? `${ty} (${target})` : ty || "step";
    return { title, subtitle };
}

function summarizeCondition(c: WorkflowConditionRow): string {
    const ent = (c.target_entity ?? "").trim();
    const field = (c.field_path ?? "").trim() || "field";
    const op = (c.operator ?? "eq").trim();
    const v = c.value_jsonb;
    const val =
        v == null ? "null"
        : typeof v === "string" ? JSON.stringify(v)
        : Array.isArray(v) ? `[${v.length} items]`
        : typeof v === "object" ? "…"
        : String(v);
    return `${ent ? `${ent}.` : ""}${field} ${op} ${val}`;
}

export function AdminV2WorkflowDetailPanel({
    panelRef,
    selectedWorkflowId,
    highlightWorkflowId,
    loading,
    error,
    workflow,
    actions,
    conditions,
}: {
    panelRef?: RefObject<HTMLDivElement | null>;
    selectedWorkflowId: string | null;
    highlightWorkflowId: string;
    loading: boolean;
    error: string | null;
    workflow: WorkflowDetailRow | null;
    actions: WorkflowActionDefRow[] | null;
    conditions: WorkflowConditionRow[] | null;
}) {
    const scope = parseWorkflowScopeFromMetadata(workflow?.metadata);
    const wa: WorkflowAssistWorkflowMetadataV1["workflow_assist"] | null =
        workflow?.metadata && typeof workflow.metadata === "object" && !Array.isArray(workflow.metadata) ?
            (workflow.metadata as WorkflowAssistWorkflowMetadataV1).workflow_assist ?? null
        :   null;
    const reminder = wa?.reminder_intent_v1 ?? null;

    return (
        <section
            ref={panelRef}
            className="rounded-xl border border-alloy-stone/20 bg-white p-3 shadow-sm"
            style={{ borderColor: derived.border }}
            data-workflow-detail-panel="true"
            data-selected-workflow-id={selectedWorkflowId ?? ""}
            data-highlight-workflow-id={highlightWorkflowId || undefined}
        >
            <h2 className="text-sm font-semibold text-alloy-midnight">Workflow detail</h2>
            {!selectedWorkflowId ?
                <p className="mt-2 text-sm text-alloy-midnight/60">Select a workflow from the list.</p>
            : loading ?
                <p className="mt-2 text-sm text-alloy-midnight/60">Loading workflow…</p>
            : error ?
                <p className="mt-2 text-sm text-alloy-ember">{error}</p>
            : !workflow ?
                <p className="mt-2 text-sm text-alloy-midnight/60">Workflow not found.</p>
            : (
                <div className="mt-2 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-alloy-midnight">
                                {workflow.name ?? workflow.id}
                            </div>
                            {workflow.description ?
                                <p className="mt-1 text-xs text-alloy-midnight/65">{workflow.description}</p>
                            : null}
                            <p className="mt-1 font-mono text-[11px] text-alloy-midnight/60">
                                {workflow.event_type ?? "—"} · {workflow.entity_type ?? "—"}
                            </p>
                        </div>
                        <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                workflow.enabled === false ?
                                    "bg-alloy-stone/15 text-alloy-midnight/60"
                                :   "bg-alloy-pine/15 text-alloy-midnight"
                            }`}
                            data-workflow-enabled-state={workflow.enabled === false ? "disabled" : "enabled"}
                        >
                            {workflow.enabled === false ? "Disabled" : "Enabled"}
                        </span>
                    </div>

                    {scope ?
                        <p className="text-xs text-alloy-midnight/70" data-workflow-scope-metadata="true">
                            <span className="font-semibold">Scope:</span>{" "}
                            {scope.work_unit_id ? `Work unit ${scope.work_unit_id.slice(0, 8)}…` : null}
                            {scope.department_id ? `Department ${scope.department_id.slice(0, 8)}…` : null}
                        </p>
                    : (
                        <p className="text-xs text-alloy-midnight/55">Scope: org-wide (no metadata.scope)</p>
                    )}

                    {reminder ?
                        <div
                            className="rounded-lg border border-alloy-honey/30 bg-alloy-honey/10 px-2.5 py-2 text-xs text-alloy-midnight/80"
                            data-workflow-reminder-intent="true"
                        >
                            <div className="font-semibold text-alloy-midnight">Assist reminder intent</div>
                            <p className="mt-1">
                                {reminder.action} · {reminder.channel} · {reminder.timing.days} day(s) before tour
                            </p>
                            {reminder.message_preview ?
                                <p className="mt-1 whitespace-pre-wrap text-[11px]">{reminder.message_preview}</p>
                            : null}
                        </div>
                    : null}

                    <div>
                        <h3 className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">Actions</h3>
                        {(actions ?? []).length === 0 ?
                            <p className="mt-1 text-sm text-alloy-midnight/55">No steps configured.</p>
                        : (
                            <ul className="mt-1 space-y-1.5">
                                {(actions ?? []).slice(0, 10).map((a) => {
                                    const s = summarizeWorkflowAction(a);
                                    return (
                                        <li
                                            key={a.id}
                                            className="rounded-md border border-alloy-stone/15 px-2 py-1.5 text-xs"
                                            data-workflow-action-row={a.id}
                                        >
                                            <span className="font-semibold">
                                                Step {a.action_order}: {s.title}
                                            </span>
                                            <div className="text-alloy-midnight/60">{s.subtitle}</div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h3 className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">Conditions</h3>
                        {(conditions ?? []).filter((c) => c.enabled !== false).length === 0 ?
                            <p className="mt-1 text-sm text-alloy-midnight/55">None.</p>
                        : (
                            <ul className="mt-1 space-y-1 font-mono text-[11px] text-alloy-midnight/75">
                                {(conditions ?? [])
                                    .filter((c) => c.enabled !== false)
                                    .slice(0, 8)
                                    .map((c) => (
                                        <li key={c.id}>{summarizeCondition(c)}</li>
                                    ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
