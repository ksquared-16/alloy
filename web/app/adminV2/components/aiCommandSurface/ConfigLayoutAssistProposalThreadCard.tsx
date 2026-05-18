"use client";

import { useMemo } from "react";
import type { MouseEvent } from "react";

import { CommandSurfaceActionCardShell } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { configLayoutAssistProposalStatusCopy } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalCopy";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigLayoutAssistTraceV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";
import {
    configProposalReviewHrefForId,
    createConfigProposalReviewClickHandler,
    resolveConfigProposalReviewId,
    type ConfigProposalReviewDebugLog,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import { brand, derived, neutral } from "@/styles/tokens/colors";

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
    const statusCopy = configLayoutAssistProposalStatusCopy(proposal);
    const reviewHref = reviewProposalId ? configProposalReviewHrefForId(reviewProposalId) : null;

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

    return (
        <CommandSurfaceActionCardShell data-command-surface-config-layout-assist-card="true">
            <p className="text-[13px] font-semibold" style={{ color: CMD.textBody }}>
                Configuration proposal (review required)
            </p>
            <p className="mt-1 text-[12px]" style={{ color: CMD.textSupporting }}>
                {proposal.summary}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div>
                    <dt style={{ color: CMD.textLabel }}>Risk</dt>
                    <dd className="font-medium capitalize" style={{ color: CMD.textBody }}>
                        {proposal.risk_level}
                    </dd>
                </div>
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
            {proposal.rationale.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px]" style={{ color: CMD.textSupporting }}>
                    {proposal.rationale.slice(0, 4).map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {trace.rationale_steps.length > 0 ? (
                <p className="mt-2 text-[10px]" style={{ color: CMD.textLabel }}>
                    Trace: {trace.rationale_steps.join(" → ")}
                </p>
            ) : null}
            <p
                className="mt-2 rounded border px-2 py-1 text-[10px]"
                style={{ borderColor: derived.border, color: CMD.textSupporting }}
            >
                {statusCopy}
            </p>
            {reviewProposalId && reviewHref ? (
                <button
                    type="button"
                    className="relative z-[1] mt-2 inline-flex cursor-pointer text-left text-[12px] font-semibold underline pointer-events-auto"
                    style={{ color: brand.secondary }}
                    data-command-surface-config-assist-review-proposal="true"
                    data-proposal-id={reviewProposalId}
                    onClick={handleReviewButtonClick}
                >
                    Review proposal →
                </button>
            ) : (
                <p className="mt-2 text-[11px] italic" style={{ color: CMD.textLabel }}>
                    Save the proposal to Settings before review.
                </p>
            )}
        </CommandSurfaceActionCardShell>
    );
}
