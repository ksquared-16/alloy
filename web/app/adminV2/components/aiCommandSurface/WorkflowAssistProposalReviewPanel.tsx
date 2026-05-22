"use client";

import { useMemo, useState } from "react";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import type { WorkflowAssistDraftReviewV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import { buildWorkflowAssistProposalStepperV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalStepperV1";
import { WORKFLOW_ASSIST_AUTOMATIONS_HREF } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import {
    WORKFLOW_ASSIST_DISABLED_DRAFT_BOUNDARY_COPY,
    WORKFLOW_ASSIST_PROPOSAL_SOURCE_LABEL,
    WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL,
} from "@/lib/adminV2/bos/workflowAssistOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import { CAPABILITY_GATE_CHECKING_LABEL } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function ProposalStepper({
    steps,
    messageProvenanceLabel,
}: {
    steps: ReturnType<typeof buildWorkflowAssistProposalStepperV1>;
    messageProvenanceLabel: string;
}) {
    return (
        <ol
            className="space-y-0"
            data-command-surface-workflow-assist-proposal-stepper="true"
            aria-label="Workflow proposal steps"
        >
            {steps.map((step, index) => (
                <li key={step.id} className="flex gap-2.5">
                    <div className="flex w-5 shrink-0 flex-col items-center">
                        <span
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: derived.adminV2AiBarPineWash, color: brand.secondary }}
                            aria-hidden
                        >
                            {index + 1}
                        </span>
                        {index < steps.length - 1 ?
                            <span className="my-0.5 w-px flex-1 min-h-[12px]" style={{ backgroundColor: derived.border }} />
                        : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                                {step.title}
                            </h4>
                            {step.id === "message" ?
                                <span className="text-[9px] font-semibold" style={{ color: brand.secondary }}>
                                    {messageProvenanceLabel}
                                </span>
                            : null}
                        </div>
                        {step.id === "message" ?
                            <p
                                className="mt-1 rounded-md border border-alloy-stone/20 bg-alloy-stone/[0.03] px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap"
                                style={{ color: CMD.textBody }}
                                data-command-surface-workflow-assist-message-preview-body="true"
                            >
                                {step.body}
                            </p>
                        :   <p className="mt-0.5 text-[11px] leading-snug" style={{ color: CMD.textBody }}>
                                {step.body}
                            </p>
                        }
                    </div>
                </li>
            ))}
        </ol>
    );
}

export function WorkflowAssistProposalReviewPanel({
    review,
    templateId = "generic_stub",
    onApply,
    applyBusy,
    applyDone,
    applyAllowed,
    applyCapabilitiesPending = false,
    applyBlockedMessage,
}: {
    review: WorkflowAssistDraftReviewV1;
    templateId?: WorkflowAssistCreateTemplateIdV1;
    onApply: () => void;
    applyBusy: boolean;
    applyDone: boolean;
    applyAllowed: boolean;
    applyCapabilitiesPending?: boolean;
    applyBlockedMessage?: string | null;
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const op = review.operator;
    const steps = useMemo(
        () => buildWorkflowAssistProposalStepperV1({ review, template_id: templateId }),
        [review, templateId]
    );

    return (
        <div data-command-surface-workflow-assist-draft-review="true">
            <OperationalProposalCardFrame
            proposalTitle={op.display_title}
            proposalTypeLabel={WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL}
            capabilityKey="workflow_assist"
            status={applyDone ? "applied" : "validated"}
            presentationVariant={applyDone ? "applied" : !applyAllowed ? undefined : "review_required"}
            scope={op.scope_label}
            sourceLabel={WORKFLOW_ASSIST_PROPOSAL_SOURCE_LABEL}
            requiresApproval
            riskLevel="high"
            mutationBoundaryCopy={WORKFLOW_ASSIST_DISABLED_DRAFT_BOUNDARY_COPY}
            blocked={!applyAllowed}
            blockedCopy={!applyAllowed ? (applyBlockedMessage ?? undefined) : undefined}
            footer={
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={applyBusy || applyDone || !applyAllowed || applyCapabilitiesPending}
                        title={!applyAllowed ? (applyBlockedMessage ?? undefined) : undefined}
                        className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                        data-command-surface-workflow-assist-apply="true"
                        onClick={onApply}
                    >
                        {applyCapabilitiesPending ?
                            CAPABILITY_GATE_CHECKING_LABEL
                        : applyBusy ?
                            "Applying…"
                        : applyDone ?
                            "Applied"
                        :   "Apply disabled draft"}
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
            className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
        >
            <section aria-label="Workflow steps">
                <ProposalStepper steps={steps} messageProvenanceLabel={review.message_preview.provenance_label} />
            </section>

            {op.uses_label ?
                <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                    <span className="font-semibold" style={{ color: CMD.textLabel }}>
                        Uses:
                    </span>{" "}
                    {op.uses_label}
                </p>
            : null}

            <section className="space-y-1" aria-label="Needs review">
                <h4 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                    Needs review
                </h4>
                <ul className="list-disc pl-4 text-[10px]" style={{ color: CMD.textSupporting }}>
                    {op.needs_review.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </section>

            <details
                className="rounded-md border border-alloy-stone/20 text-[10px]"
                data-command-surface-workflow-assist-advanced-details="true"
                open={advancedOpen}
                onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            >
                <summary className="cursor-pointer px-2 py-1.5 font-semibold" style={{ color: CMD.textLabel }}>
                    Advanced details
                </summary>
                <div className="space-y-2 border-t border-alloy-stone/15 px-2 py-2" style={{ color: CMD.textSupporting }}>
                    <p>
                        <span className="font-semibold">event_type:</span> {review.advanced.event_type}
                    </p>
                    <p>
                        <span className="font-semibold">entity_type:</span> {review.advanced.entity_type}
                    </p>
                    <p>
                        <span className="font-semibold">Trigger:</span> {review.advanced.trigger_technical}
                    </p>
                    <p>
                        <span className="font-semibold">Actions:</span> {review.advanced.actions_technical}
                    </p>
                    {review.advanced.description ?
                        <p>
                            <span className="font-semibold">Description:</span> {review.advanced.description}
                        </p>
                    : null}
                    <p>
                        <span className="font-semibold">Enrichment:</span> {review.advanced.enrichment_source} ·{" "}
                        {review.advanced.confidence}
                    </p>
                    {review.advanced.rejected_fields.length ?
                        <p>
                            <span className="font-semibold">Rejected fields:</span>{" "}
                            {review.advanced.rejected_fields.join(", ")}
                        </p>
                    : null}
                    {review.message_preview.unresolved_tokens.length ?
                        <p style={{ color: semantic.warning }}>
                            <span className="font-semibold">Unresolved preview tokens:</span>{" "}
                            {review.message_preview.unresolved_tokens.join(", ")} (confirm mapping in Automations)
                        </p>
                    : null}
                    {review.advanced.warnings.length ?
                        <ul className="list-disc pl-4">
                            {review.advanced.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    : null}
                </div>
            </details>
            </OperationalProposalCardFrame>
        </div>
    );
}
