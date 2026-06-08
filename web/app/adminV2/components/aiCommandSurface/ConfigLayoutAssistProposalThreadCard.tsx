"use client";

import { useMemo } from "react";
import type { MouseEvent } from "react";

import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import {
    CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY,
    CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL,
    CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL,
    CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY,
    configProposalEntityContextLabel,
    configProposalRequiresFrameApproval,
    configProposalRiskLevel,
    configProposalValidationMessages,
} from "@/lib/adminV2/bos/configLayoutAssistOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import { configLayoutAssistProposalStatusCopy } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalCopy";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigLayoutAssistTraceV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";
import { buildProposalReviewPresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import {
    configProposalReviewHrefForId,
    createConfigProposalReviewClickHandler,
    resolveConfigProposalReviewId,
    type ConfigProposalReviewDebugLog,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import { neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function ConfigLayoutAssistProposalThreadCard({
    proposal,
    trace,
    persistedProposalId,
    onReviewConfigProposal,
    debugReviewNavigation,
}: {
    proposal: ConfigurationProposalV1;
    trace: ConfigLayoutAssistTraceV1;
    persistedProposalId: string | null;
    onReviewConfigProposal: (proposalId: string) => void;
    debugReviewNavigation?: ConfigProposalReviewDebugLog;
}) {
    const reviewProposalId = resolveConfigProposalReviewId(persistedProposalId);
    const reviewPresentation = useMemo(() => buildProposalReviewPresentation(proposal), [proposal]);
    const statusCopy = configLayoutAssistProposalStatusCopy(proposal);
    const reviewHref = reviewProposalId ? configProposalReviewHrefForId(reviewProposalId) : null;
    const { errors: validationErrors, warnings: validationWarnings } = configProposalValidationMessages(proposal);

    const mutatingCount = proposal.proposed_operations.filter(
        (o) => o.kind !== "data_quality_recommendation"
    ).length;

    const onReviewClick = useMemo(
        () =>
            createConfigProposalReviewClickHandler(
                persistedProposalId,
                onReviewConfigProposal,
                debugReviewNavigation
            ),
        [persistedProposalId, onReviewConfigProposal, debugReviewNavigation]
    );

    const handleReviewButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
        onReviewClick(event);
    };

    const requiresApproval = configProposalRequiresFrameApproval(proposal);
    const mutationBoundary =
        statusCopy.includes("Recommendation") ? statusCopy : CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY;

    return (
        <div data-command-surface-config-layout-assist-card="true">
            <OperationalProposalCardFrame
                proposalTitle={reviewPresentation.title}
                proposalTypeLabel={CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL}
                capabilityKey="config_layout_assist"
                status="validated"
                presentationVariant={requiresApproval ? "review_required" : "normal"}
                entityContextLabel={configProposalEntityContextLabel(proposal)}
                sourceLabel={CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL}
                summary={proposal.summary}
                reasonLabel={trace.rationale_steps.length ? "Trace" : null}
                reasonDetail={trace.rationale_steps.length ? trace.rationale_steps.join(" → ") : null}
                requiresApproval={requiresApproval}
                riskLevel={configProposalRiskLevel(proposal)}
                mutationBoundaryCopy={mutationBoundary}
                policyCopy={
                    reviewProposalId ?
                        CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY
                    :   "Save the proposal to Settings before review."
                }
                validationErrors={validationErrors.length ? validationErrors : null}
                validationWarnings={validationWarnings.length ? validationWarnings : null}
                footer={
                    reviewProposalId && reviewHref ?
                        <button
                            type="button"
                            className="relative z-[1] inline-flex cursor-pointer rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white pointer-events-auto"
                            data-command-surface-config-assist-review-proposal="true"
                            data-proposal-id={reviewProposalId}
                            onClick={handleReviewButtonClick}
                        >
                            View advanced review
                        </button>
                    :   null
                }
                className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
            >
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div>
                        <dt style={{ color: CMD.textLabel }}>Operations</dt>
                        <dd className="font-medium" style={{ color: CMD.textBody }}>
                            {proposal.proposed_operations.length}
                            {mutatingCount < proposal.proposed_operations.length
                                ? ` (${mutatingCount} mutating)`
                                : ""}
                        </dd>
                    </div>
                </dl>
                {proposal.rationale.length > 0 ?
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px]" style={{ color: CMD.textSupporting }}>
                        {proposal.rationale.slice(0, 4).map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                :   null}
                {!reviewProposalId ?
                    <p className="text-[11px] italic" style={{ color: CMD.textLabel }}>
                        Save the proposal to Settings before review.
                    </p>
                :   null}
            </OperationalProposalCardFrame>
        </div>
    );
}
