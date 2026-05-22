"use client";

import { useCallback, useState } from "react";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { BosExecutionReceiptNotice } from "@/app/adminV2/components/bos/BosExecutionReceiptNotice";
import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import type { BosExecutionReceiptPresentation } from "@/lib/adminV2/bos/bosExecutionReceipt";
import {
    buildWorkflowAssistAppliedReceipt,
    buildWorkflowAssistFailedReceipt,
} from "@/lib/adminV2/bos/bosExecutionReceipt";
import { dispatchAiActivityRefresh } from "@/app/adminV2/components/aiActivity/RecentAiActionsStrip";
import { WorkflowAssistDuplicateWarning } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistDuplicateWarning";
import { WorkflowAssistProposalReviewPanel } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistProposalReviewPanel";
import { WORKFLOW_ASSIST_AUTOMATIONS_HREF } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import { dispatchWorkflowAutomationRefresh } from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";
import type { WorkflowAssistCreateProposeBuildV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import {
    WORKFLOW_ASSIST_DISABLED_DRAFT_BOUNDARY_COPY,
    WORKFLOW_ASSIST_PROPOSAL_SOURCE_LABEL,
    WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL,
    workflowAssistProposalTitleFromSuggestion,
} from "@/lib/adminV2/bos/workflowAssistOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { neutral, semantic } from "@/styles/tokens/colors";

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

function parseCreateTemplateId(suggestion: WorkflowAssistSuggestionV1): WorkflowAssistCreateTemplateIdV1 {
    const meta = suggestion.draft_row?.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const wa = (meta as Record<string, unknown>).workflow_assist;
        if (wa && typeof wa === "object" && !Array.isArray(wa)) {
            const tid = (wa as Record<string, unknown>).template_id;
            if (tid === "tour_reminder" || tid === "enrollment_when_move" || tid === "generic_stub") return tid;
        }
    }
    return "generic_stub";
}

export function WorkflowAssistProposalActionCard({
    suggestion,
    createInterpreted,
    applyAllowed = true,
    onProposeEditExisting,
    onExecutionReceipt,
}: {
    suggestion: WorkflowAssistSuggestionV1;
    createInterpreted?: WorkflowAssistCreateProposeBuildV1["interpreted"];
    applyAllowed?: boolean;
    onProposeEditExisting?: (workflowId: string) => void;
    onExecutionReceipt?: (receipt: BosExecutionReceiptPresentation) => void;
}) {
    const globalAssistant = useGlobalAssistantOptional();
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<ApplyJson | null>(null);
    const [executionReceipt, setExecutionReceipt] = useState<BosExecutionReceiptPresentation | null>(null);
    const [duplicateDismissed, setDuplicateDismissed] = useState(false);

    const apply = useCallback(async () => {
        if (!applyAllowed) return;
        setBusy(true);
        setDone(null);
        setExecutionReceipt(null);
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
                const failed = { ok: false as const, error: (j as { error?: string }).error, message: (j as { message?: string }).message };
                setDone(failed);
                const failReceipt = buildWorkflowAssistFailedReceipt(
                    failed.message?.trim() || failed.error || "Apply failed"
                );
                setExecutionReceipt(failReceipt);
                onExecutionReceipt?.(failReceipt);
                return;
            }
            setDone(j);
            const receipt = buildWorkflowAssistAppliedReceipt({
                workflowId: (j as { workflow_id?: string }).workflow_id,
                draftOnly: Boolean(suggestion.draft_review),
            });
            setExecutionReceipt(receipt);
            onExecutionReceipt?.(receipt);
            const ws = globalAssistant?.workspaceScope;
            dispatchWorkflowAutomationRefresh({
                department_id: ws?.department_id ?? null,
                work_unit_id: ws?.work_unit_id ?? null,
            });
            dispatchAiActivityRefresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Apply request failed.";
            setDone({
                ok: false,
                error: "FETCH_FAILED",
                message: msg,
            });
            const failReceipt = buildWorkflowAssistFailedReceipt(msg);
            setExecutionReceipt(failReceipt);
            onExecutionReceipt?.(failReceipt);
        } finally {
            setBusy(false);
        }
    }, [suggestion, applyAllowed, globalAssistant?.workspaceScope, onExecutionReceipt]);

    const draftReview = suggestion.draft_review ?? null;
    const editReview = suggestion.edit_review ?? [];
    const isCreate = suggestion.proposal_kind === "create_workflow";

    const applyReceiptEl =
        executionReceipt ? <BosExecutionReceiptNotice receipt={executionReceipt} compact /> : null;

    if (draftReview) {
        const templateId = parseCreateTemplateId(suggestion);
        return (
            <div className="space-y-2" data-command-surface-workflow-assist-proposal-card="true">
                {suggestion.duplicate_warning ?
                    <WorkflowAssistDuplicateWarning
                        duplicate={suggestion.duplicate_warning}
                        dismissed={duplicateDismissed}
                        onDismiss={() => setDuplicateDismissed(true)}
                        onProposeEdit={(workflowId) => onProposeEditExisting?.(workflowId)}
                    />
                :   null}
                <WorkflowAssistProposalReviewPanel
                    review={draftReview}
                    templateId={templateId}
                    onApply={() => void apply()}
                    applyBusy={busy}
                    applyDone={done?.ok === true}
                    applyAllowed={applyAllowed}
                    applyBlockedMessage={!applyAllowed ? WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE : null}
                />
                {applyReceiptEl ?
                    <div className="text-[11px]" style={{ color: done?.ok ? undefined : semantic.warning }}>
                        {applyReceiptEl}
                    </div>
                :   null}
            </div>
        );
    }

    const proposalTitle = workflowAssistProposalTitleFromSuggestion({
        proposalKind: suggestion.proposal_kind,
        draftName: suggestion.draft_row?.name ?? null,
        targetWorkflowId: suggestion.target_workflow_id ?? null,
        createHeadline: createInterpreted?.headline ?? null,
    });

    return (
        <div data-command-surface-workflow-assist-proposal-card="true">
            <OperationalProposalCardFrame
                proposalTitle={proposalTitle}
                proposalTypeLabel={WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL}
                capabilityKey="workflow_assist"
                status={done?.ok ? "applied" : "validated"}
                presentationVariant={done?.ok ? "applied" : !applyAllowed ? undefined : "review_required"}
                sourceLabel={WORKFLOW_ASSIST_PROPOSAL_SOURCE_LABEL}
                requiresApproval
                riskLevel="high"
                mutationBoundaryCopy={WORKFLOW_ASSIST_DISABLED_DRAFT_BOUNDARY_COPY}
                blocked={!applyAllowed}
                blockedCopy={!applyAllowed ? WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE : null}
                validationErrors={
                    done && !done.ok && (done as { validation_errors?: string[] }).validation_errors?.length ?
                        (done as { validation_errors: string[] }).validation_errors
                    :   null
                }
                footer={
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
                            className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight/85"
                            data-command-surface-workflow-assist-open-automations="true"
                        >
                            Open Automations
                        </CommandSurfaceCardLink>
                    </div>
                }
                receipt={applyReceiptEl}
                className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
            >
                {isCreate && createInterpreted ?
                    <dl className="grid gap-1 text-[10px]" style={{ color: CMD.textSupporting }}>
                        <ProposalDetailRow label="Trigger" value={createInterpreted.trigger_label} />
                        <ProposalDetailRow label="Actions" value={createInterpreted.actions_label} />
                    </dl>
                :   null}
                {editReview.length ?
                    <dl
                        className="space-y-1.5 text-[10px]"
                        style={{ color: CMD.textSupporting }}
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
                :   null}
            </OperationalProposalCardFrame>
        </div>
    );
}
