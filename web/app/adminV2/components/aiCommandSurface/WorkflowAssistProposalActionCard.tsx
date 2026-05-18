"use client";

import { useCallback, useState } from "react";

import {
    CommandSurfaceActionCardShell,
    CommandSurfaceCardLink,
} from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { dispatchAiActivityRefresh } from "@/app/adminV2/components/aiActivity/RecentAiActionsStrip";
import { WorkflowAssistProposalReviewPanel } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistProposalReviewPanel";
import { WORKFLOW_ASSIST_AUTOMATIONS_HREF } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import { dispatchWorkflowAutomationRefresh } from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";
import type { WorkflowAssistCreateProposeBuildV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";

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

    const draftReview = suggestion.draft_review ?? null;
    const editReview = suggestion.edit_review ?? [];
    const isCreate = suggestion.proposal_kind === "create_workflow";

    if (draftReview) {
        return (
            <CommandSurfaceActionCardShell className="space-y-2" data-command-surface-workflow-assist-proposal-card="true">
                <WorkflowAssistProposalReviewPanel
                    review={draftReview}
                    onApply={() => void apply()}
                    applyBusy={busy}
                    applyDone={done?.ok === true}
                    applyAllowed={applyAllowed}
                    applyBlockedMessage={!applyAllowed ? WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE : null}
                />
                {done && !done.ok ?
                    <p className="text-[11px]" style={{ color: semantic.warning }} data-command-surface-workflow-assist-apply-error>
                        {(done as { error?: string }).error}: {(done as { message?: string }).message ?? "Apply failed"}
                    </p>
                : null}
                {done?.ok ?
                    <p className="text-[11px]" style={{ color: brand.secondary }} data-command-surface-workflow-assist-apply-success>
                        Draft saved.{" "}
                        <CommandSurfaceCardLink
                            href={`${WORKFLOW_ASSIST_AUTOMATIONS_HREF}?workflow=${encodeURIComponent((done as { workflow_id?: string }).workflow_id ?? "")}`}
                            className="font-semibold underline-offset-2 hover:underline"
                        >
                            Open in Automations
                        </CommandSurfaceCardLink>
                    </p>
                : null}
            </CommandSurfaceActionCardShell>
        );
    }

    return (
        <CommandSurfaceActionCardShell className="space-y-2" data-command-surface-workflow-assist-proposal-card="true">
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
            <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                {createInterpreted?.headline ??
                    (isCreate ?
                        `Create disabled workflow: ${suggestion.draft_row?.name ?? "—"}`
                    : suggestion.proposal_kind === "pause_workflow" ?
                        `Disable workflow ${suggestion.target_workflow_id ?? ""}`
                    :   `Edit workflow ${suggestion.target_workflow_id ?? ""}`)}
            </p>
            {isCreate && createInterpreted ?
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
            <div
                className="rounded-md border px-2.5 py-2 text-[10px] leading-snug"
                style={{ borderColor: derived.border, color: CMD.textSupporting }}
            >
                This creates a disabled draft. No messages will send until the workflow is reviewed and enabled.
            </div>
            {!applyAllowed ?
                <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }} data-command-surface-workflow-assist-apply-blocked>
                    {WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE}
                </p>
            : null}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy || done?.ok === true || !applyAllowed}
                    className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    data-command-surface-workflow-assist-apply="true"
                    onClick={() => void apply()}
                >
                    {busy ? "Applying…" : done?.ok ? "Applied" : "Apply disabled draft"}
                </button>
                <CommandSurfaceCardLink
                    href={WORKFLOW_ASSIST_AUTOMATIONS_HREF}
                    className="rounded-md border px-3 py-1.5 text-[11px] font-semibold"
                    style={{ borderColor: derived.border, color: CMD.textBody }}
                    data-command-surface-workflow-assist-open-automations="true"
                >
                    Open Automations
                </CommandSurfaceCardLink>
            </div>
            {done && !done.ok ?
                <p className="text-[11px]" style={{ color: semantic.warning }} data-command-surface-workflow-assist-apply-error>
                    {(done as { error?: string }).error}: {(done as { message?: string }).message ?? "Apply failed"}
                </p>
            : null}
            {done?.ok ?
                <p className="text-[11px]" style={{ color: brand.secondary }} data-command-surface-workflow-assist-apply-success>
                    Applied.{" "}
                    <CommandSurfaceCardLink
                        href={`${WORKFLOW_ASSIST_AUTOMATIONS_HREF}?workflow=${encodeURIComponent((done as { workflow_id?: string }).workflow_id ?? "")}`}
                        className="font-semibold underline-offset-2 hover:underline"
                    >
                        Open in Automations
                    </CommandSurfaceCardLink>
                </p>
            : null}
        </CommandSurfaceActionCardShell>
    );
}
