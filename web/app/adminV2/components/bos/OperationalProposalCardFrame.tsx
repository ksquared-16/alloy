"use client";

import type { ReactNode } from "react";

import {
    formatOperationalProposalTypeLine,
    operationalProposalRiskLabel,
    operationalProposalStatusLabel,
    OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY,
    OPERATIONAL_PROPOSAL_BLOCKED_DEFAULT_COPY,
    OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY,
    OPERATIONAL_PROPOSAL_USING_ACTIVE_RECORD_PREFIX,
    resolveOperationalProposalFrameVariant,
    type OperationalProposalFrameVariant,
} from "@/lib/adminV2/bos/operationalProposalPresentation";
import type { BosCapabilityKey, BosProposalStatus, BosRiskLevel } from "@/lib/bos/bosCapability";
import { neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export type OperationalProposalCardFrameProps = {
    /** Region 1 — human outcome / card title */
    proposalTitle: string;
    /** Region 1 — specialist type, e.g. "Draft message", "Workflow change" */
    proposalTypeLabel: string;
    capabilityKey?: BosCapabilityKey | null;
    status?: BosProposalStatus | null;
    presentationVariant?: OperationalProposalFrameVariant | null;
    entityContextLabel?: string | null;

    /** Region 2 — optional routing / trigger */
    whyShown?: ReactNode | null;
    reasonLabel?: string | null;
    reasonDetail?: string | null;
    sourceLabel?: string | null;

    /** Region 3 */
    summary?: ReactNode | null;

    /** Region 4 */
    scope?: ReactNode | null;

    /** Region 5 — specialist body */
    children?: ReactNode;

    /** Region 6 */
    requiresApproval?: boolean;
    riskLevel?: BosRiskLevel | null;
    mutationBoundaryCopy?: string | null;
    blockedCopy?: string | null;
    policyCopy?: string | null;
    stale?: boolean;
    blocked?: boolean;

    /** Region 7 */
    validationErrors?: readonly string[] | null;
    validationWarnings?: readonly string[] | null;

    /** Region 8 */
    footer?: ReactNode | null;

    /** Region 9 — receipt / execution outcome (also status badge in header when status set) */
    receipt?: ReactNode | null;

    compact?: boolean;
    className?: string;
};

function frameShellClass(variant: OperationalProposalFrameVariant): string {
    const base =
        "rounded-lg border bg-white text-[12px] leading-snug shadow-[0_1px_0_rgba(39,63,82,0.04)]";
    switch (variant) {
        case "applied":
            return `${base} border-emerald-200/70 bg-emerald-50/30`;
        case "failed":
            return `${base} border-red-200/70 bg-red-50/25`;
        case "blocked":
        case "stale":
            return `${base} border-amber-200/75 bg-amber-50/35`;
        case "review_required":
        case "warning":
            return `${base} border-alloy-blue/25 bg-alloy-blue/[0.03]`;
        default:
            return `${base} border-alloy-stone/22 bg-alloy-stone/[0.02]`;
    }
}

function RegionBlock(props: {
    region: string;
    children: ReactNode;
    className?: string;
}) {
    const { region, children, className } = props;
    return (
        <section
            data-operational-proposal-region={region}
            className={className}
        >
            {children}
        </section>
    );
}

/**
 * Shared Operational Proposal shell — presentational only (no fetch/apply).
 * @see docs/sprints/05_2026/bos_ux_coherence_design.md §5.2
 */
export default function OperationalProposalCardFrame(props: OperationalProposalCardFrameProps) {
    const {
        proposalTitle,
        proposalTypeLabel,
        capabilityKey,
        status,
        presentationVariant,
        entityContextLabel,
        whyShown,
        reasonLabel,
        reasonDetail,
        sourceLabel,
        summary,
        scope,
        children,
        requiresApproval = false,
        riskLevel,
        mutationBoundaryCopy,
        blockedCopy,
        policyCopy,
        stale = false,
        blocked = false,
        validationErrors,
        validationWarnings,
        footer,
        receipt,
        compact = false,
        className,
    } = props;

    const variant = resolveOperationalProposalFrameVariant({
        presentationVariant,
        status,
        requiresApproval,
        blocked,
        stale,
    });
    const typeLine = formatOperationalProposalTypeLine({ capabilityKey, proposalTypeLabel });
    const statusLabel = operationalProposalStatusLabel(status);
    const riskLabel = operationalProposalRiskLabel(riskLevel);
    const pad = compact ? "px-2 py-1.5" : "px-2.5 py-2";
    const showBlockedBanner = variant === "blocked" || variant === "stale";
    const blockedMessage =
        blockedCopy ??
        (variant === "stale" ? OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY : OPERATIONAL_PROPOSAL_BLOCKED_DEFAULT_COPY);

    const headerId = "operational-proposal-title";

    return (
        <article
            className={[frameShellClass(variant), pad, className].filter(Boolean).join(" ")}
            data-operational-proposal-card-frame="true"
            data-operational-proposal-variant={variant}
            aria-labelledby={headerId}
        >
            <RegionBlock region="header" className="space-y-1">
                <p
                    className="text-[9px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: CMD.textLabel }}
                    data-operational-proposal-eyebrow="true"
                >
                    Operational proposal
                </p>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <h3
                            id={headerId}
                            className="text-[12px] font-semibold leading-snug"
                            style={{ color: CMD.textBody }}
                            data-operational-proposal-title="true"
                        >
                            {proposalTitle}
                        </h3>
                        <p
                            className="mt-0.5 text-[10px] font-medium"
                            style={{ color: CMD.textSupporting }}
                            data-operational-proposal-type="true"
                        >
                            {typeLine}
                        </p>
                    </div>
                    {statusLabel ? (
                        <span
                            className="shrink-0 rounded-full border border-alloy-stone/25 bg-white/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ color: CMD.textLabel }}
                            data-operational-proposal-status-badge="true"
                        >
                            {statusLabel}
                        </span>
                    ) : null}
                </div>
                {entityContextLabel?.trim() ? (
                    <p
                        className="text-[10px]"
                        style={{ color: CMD.textSupporting }}
                        data-operational-proposal-context="true"
                    >
                        <span className="font-medium" style={{ color: CMD.textBody }}>
                            {OPERATIONAL_PROPOSAL_USING_ACTIVE_RECORD_PREFIX} ·{" "}
                        </span>
                        {entityContextLabel.trim()}
                    </p>
                ) : null}
            </RegionBlock>

            {showBlockedBanner ? (
                <RegionBlock region="governance" className="mt-2">
                    <p
                        className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-1 text-[10px] font-medium text-amber-950/90"
                        data-operational-proposal-blocked="true"
                        role="status"
                    >
                        {blockedMessage}
                    </p>
                </RegionBlock>
            ) : null}

            {whyShown || reasonLabel || reasonDetail || sourceLabel ? (
                <RegionBlock
                    region="why"
                    className={`mt-2 border-t border-alloy-stone/12 pt-2 space-y-1 ${compact ? "" : ""}`}
                >
                    {sourceLabel?.trim() ? (
                        <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                            Source · {sourceLabel.trim()}
                        </p>
                    ) : null}
                    {reasonLabel?.trim() ? (
                        <p className="text-[10px] font-medium" style={{ color: CMD.textBody }} data-operational-proposal-reason-label="true">
                            {reasonLabel.trim()}
                        </p>
                    ) : null}
                    {reasonDetail?.trim() ? (
                        <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }} data-operational-proposal-reason-detail="true">
                            {reasonDetail.trim()}
                        </p>
                    ) : null}
                    {whyShown}
                </RegionBlock>
            ) : null}

            {summary ? (
                <RegionBlock region="summary" className="mt-2 border-t border-alloy-stone/12 pt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: CMD.textLabel }}>
                        Summary
                    </p>
                    <div className="text-[11px]" style={{ color: CMD.textBody }} data-operational-proposal-summary="true">
                        {summary}
                    </div>
                </RegionBlock>
            ) : null}

            {scope ? (
                <RegionBlock region="scope" className="mt-2 border-t border-alloy-stone/12 pt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: CMD.textLabel }}>
                        Scope
                    </p>
                    <div className="text-[10px]" style={{ color: CMD.textSupporting }} data-operational-proposal-scope="true">
                        {scope}
                    </div>
                </RegionBlock>
            ) : null}

            {children ? (
                <RegionBlock region="change_detail" className="mt-2 border-t border-alloy-stone/12 pt-2">
                    <div data-operational-proposal-change-detail="true">{children}</div>
                </RegionBlock>
            ) : null}

            {(requiresApproval || riskLabel || mutationBoundaryCopy || policyCopy) && !showBlockedBanner ? (
                <RegionBlock region="risk_approval" className="mt-2 border-t border-alloy-stone/12 pt-2 space-y-1">
                    {requiresApproval ? (
                        <p
                            className="text-[10px] font-semibold"
                            style={{ color: semantic.warning }}
                            data-operational-proposal-approval-required="true"
                        >
                            {OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY}
                        </p>
                    ) : null}
                    {riskLabel ? (
                        <p className="text-[10px]" style={{ color: CMD.textSupporting }} data-operational-proposal-risk="true">
                            {riskLabel}
                        </p>
                    ) : null}
                    {mutationBoundaryCopy?.trim() ? (
                        <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }} data-operational-proposal-mutation-boundary="true">
                            {mutationBoundaryCopy.trim()}
                        </p>
                    ) : null}
                    {policyCopy?.trim() ? (
                        <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }} data-operational-proposal-policy="true">
                            {policyCopy.trim()}
                        </p>
                    ) : null}
                </RegionBlock>
            ) : null}

            {validationErrors?.length || validationWarnings?.length ? (
                <RegionBlock region="validation" className="mt-2 border-t border-alloy-stone/12 pt-2 space-y-1.5">
                    {validationErrors?.length ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-red-800/90" data-operational-proposal-validation-errors="true">
                            {validationErrors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    ) : null}
                    {validationWarnings?.length ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-amber-950/85" data-operational-proposal-validation-warnings="true">
                            {validationWarnings.map((w) => (
                                <li key={w}>{w}</li>
                            ))}
                        </ul>
                    ) : null}
                </RegionBlock>
            ) : null}

            {footer ? (
                <RegionBlock region="actions" className="mt-2 border-t border-alloy-stone/12 pt-2">
                    <div data-operational-proposal-actions="true">{footer}</div>
                </RegionBlock>
            ) : null}

            {receipt ? (
                <RegionBlock region="receipt" className="mt-2 border-t border-alloy-stone/12 pt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: CMD.textLabel }}>
                        Result
                    </p>
                    <div className="text-[10px]" style={{ color: CMD.textBody }} data-operational-proposal-receipt="true">
                        {receipt}
                    </div>
                </RegionBlock>
            ) : null}
        </article>
    );
}
