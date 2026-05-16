"use client";

import { useCallback, useState } from "react";

import { dispatchAiActivityRefresh } from "@/app/adminV2/components/aiActivity/RecentAiActionsStrip";
import { dispatchWorkflowAutomationRefresh } from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";
import type { WorkflowAssistCreateProposeBuildV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { WorkflowAssistProposalReviewPanel } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistProposalReviewPanel";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";
import Link from "next/link";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function ProposalDetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-2">
            <dt className="shrink-0 font-semibold" style={{ color: CMD.textLabel }}>
                {label}
            </dt>
            <dd>{value}</dd>
        </div>
    );
}

type ApplyJson =
    | {
          ok: true;
          suggestion_id: string;
          proposal_kind: string;
          workflow_id: string;
          workflow: Record<string, unknown>;
          audit?: { source: string };
      }
    | { ok: false; error?: string; message?: string | null; validation_errors?: string[] | null };

export function WorkflowAssistProposalActionCard({
    suggestion,
    createInterpreted,
    applyAllowed = true,
}: {
    suggestion: WorkflowAssistSuggestionV1;
    createInterpreted?: WorkflowAssistCreateProposeBuildV1["interpreted"];
    /** When false, Apply stays disabled (session cannot mutate workflows via Assist). */
    applyAllowed?: boolean;
}) {
    const globalAssistant = useGlobalAssistantOptional();
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<ApplyJson | null>(null);

    const apply = useCallback(async () => {
        if (!applyAllowed) return;
        setBusy(true);
        setDone(null);
        try {
            const res = await fetch("/api/admin/ai/workflow-assist/apply", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    version: 1,
                    suggestion_id: suggestion.suggestion_id,
                    proposal: suggestion,
                    confirm: true,
                }),
            });
            const j = (await res.json()) as ApplyJson;
            if (!res.ok) {
                setDone({ ok: false, error: (j as { error?: string }).error, message: (j as { message?: string }).message });
                return;
            }
            setDone(j);
            const ws = globalAssistant?.workspaceScope;
            dispatchWorkflowAutomationRefresh({
                department_id: ws?.department_id ?? null,
                work_unit_id: ws?.work_unit_id ?? null,
            });
            dispatchAiActivityRefresh();
        } catch (e) {
            setDone({
                ok: false,
                error: "FETCH_FAILED",
                message: e instanceof Error ? e.message : "Apply request failed.",
            });
        } finally {
            setBusy(false);
        }
    }, [suggestion, applyAllowed, globalAssistant?.workspaceScope]);

    const isCreate = suggestion.proposal_kind === "create_workflow";
    const editReview = suggestion.edit_review ?? [];
    const draftReview = suggestion.draft_review ?? null;

    return (
        <div className="space-y-2" data-command-surface-workflow-assist-proposal-card="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                    Workflow Assist · proposal
                </div>
                <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: "rgba(220, 38, 38, 0.12)", color: semantic.warning }}
                >
                    Admin approval required
                </span>
            </div>
            {draftReview ?
                <WorkflowAssistProposalReviewPanel review={draftReview} />
            : null}
            {!draftReview ?
                <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                {createInterpreted?.headline ??
                    (isCreate ?
                        `Create disabled workflow: ${suggestion.draft_row?.name ?? "—"}`
                    : suggestion.proposal_kind === "pause_workflow" ?
                        `Disable workflow ${suggestion.target_workflow_id ?? ""}`
                    :   `Edit workflow ${suggestion.target_workflow_id ?? ""}`)}
                </p>
            : null}
            {isCreate && !draftReview && createInterpreted ?
                <dl className="grid gap-1 text-[10px]" style={{ color: CMD.textSupporting }}>
                    <ProposalDetailRow label="Trigger" value={createInterpreted.trigger_label} />
                    <ProposalDetailRow label="Actions" value={createInterpreted.actions_label} />
                </dl>
            : null}
            {editReview.length ?
                <dl
                    className="space-y-1.5 rounded-md border px-2 py-1.5 text-[10px]"
                    style={{ borderColor: derived.border, color: CMD.textSupporting }}
                    data-command-surface-workflow-assist-edit-review="true"
                >
                    {editReview.map((row) => (
                        <div key={row.field} className="grid gap-0.5">
                            <dt className="font-semibold" style={{ color: CMD.textLabel }}>
                                {row.label}
                            </dt>
                            <dd>
                                <span style={{ color: CMD.textLabel }}>Current:</span> {row.current}
                            </dd>
                            <dd>
                                <span style={{ color: CMD.textLabel }}>Proposed:</span> {row.proposed}
                            </dd>
                        </div>
                    ))}
                </dl>
            : null}
            <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                {suggestion.reasoning.summary}
            </p>
            {suggestion.reasoning.warnings.length ?
                <ul className="list-disc pl-4 text-[10px]" style={{ color: semantic.warning }}>
                    {suggestion.reasoning.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            : null}
            <div className="rounded-md border border-dashed px-2 py-1.5 text-[10px]" style={{ borderColor: derived.border, color: CMD.textLabel }}>
                Read-only summary cards above do not change workflows. Apply writes through the same admin paths as
                Automations after you confirm — creates stay disabled; enable only from Automations.
            </div>
            {!applyAllowed ?
                <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }} data-command-surface-workflow-assist-apply-blocked>
                    {WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE}
                </p>
            : null}
            <button
                type="button"
                disabled={busy || done?.ok === true || !applyAllowed}
                title={!applyAllowed ? WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE : undefined}
                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                data-command-surface-workflow-assist-apply="true"
                onClick={() => void apply()}
            >
                {busy ? "Applying…" : done?.ok ? "Applied" : "Apply as admin"}
            </button>
            {done && !done.ok ?
                <p className="text-[11px]" style={{ color: semantic.warning }} data-command-surface-workflow-assist-apply-error>
                    {(done as { error?: string }).error}: {(done as { message?: string }).message ?? "Apply failed"}
                </p>
            : null}
            {done?.ok ?
                <p className="text-[11px]" style={{ color: brand.secondary }} data-command-surface-workflow-assist-apply-success>
                    Applied · workflow id {(done as { workflow_id?: string }).workflow_id}.{" "}
                    <Link
                        href={`/adminV2/workflows?workflow=${encodeURIComponent((done as { workflow_id?: string }).workflow_id ?? "")}`}
                        className="font-semibold underline-offset-2 hover:underline"
                    >
                        Open in Automations
                    </Link>
                </p>
            : null}
        </div>
    );
}
