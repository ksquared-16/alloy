"use client";

import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import {
    CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL,
    CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL,
    configProposalMutationBoundaryCopy,
    mapConfigLifecycleToBosStatus,
    mapConfigLifecycleToFrameVariant,
} from "@/lib/adminV2/bos/configLayoutAssistOperationalProposalPresentation";
import type { ProposalReviewPresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { ProposalStatePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import { operationKindLabel } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { ConfigAssistApplyOutcomePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import { ConfigLayoutAssistApplyOutcomeList } from "@/app/adminV2/components/bos/ConfigLayoutAssistApplyOutcomeList";
import { CONFIG_ASSIST_APPLY_PERMISSION_COPY } from "@/lib/adminV2/bos/bosGovernanceCopy";

type LifecycleAction = {
    label: string;
    onClick: () => void;
    variant?: "primary" | "danger";
};

export function ConfigLayoutProposalReviewPanel({
    presentation,
    statePresentation,
    lifecycleActions,
    busy,
    message,
    failedReason,
    showApplyPermissionHint,
    showRecommendationApprovedHint,
    lifecycleState,
    applyOutcome = null,
}: {
    presentation: ProposalReviewPresentation;
    statePresentation: ProposalStatePresentation;
    lifecycleActions: LifecycleAction[];
    busy: boolean;
    message: string | null;
    failedReason?: string | null;
    showApplyPermissionHint?: boolean;
    showRecommendationApprovedHint?: boolean;
    lifecycleState: string;
    applyOutcome?: ConfigAssistApplyOutcomePresentation | null;
}) {
    const bosStatus = mapConfigLifecycleToBosStatus(lifecycleState);
    const frameVariant = mapConfigLifecycleToFrameVariant(statePresentation, lifecycleState);
    const requiresApproval =
        !statePresentation.isRecommendationOnly &&
        (statePresentation.needsConfirmation || lifecycleState === "reviewed" || lifecycleState === "approved");

    const policyLines: string[] = [];
    if (showApplyPermissionHint) {
        policyLines.push(CONFIG_ASSIST_APPLY_PERMISSION_COPY);
    }
    if (showRecommendationApprovedHint) {
        policyLines.push("This proposal is recommendation-only; there are no configuration mutations to apply.");
    }

    const receipt =
        applyOutcome ?
            <ConfigLayoutAssistApplyOutcomeList outcome={applyOutcome} />
        : message || failedReason ?
            <div className="space-y-1 text-xs">
                {message && !applyOutcome ? <p className="text-alloy-midnight/70">{message}</p> : null}
                {failedReason ? <p className="text-red-700">Failed: {failedReason}</p> : null}
            </div>
        :   null;

    return (
        <div data-config-layout-proposal-review-panel="true">
            <OperationalProposalCardFrame
            proposalTitle={presentation.title}
            proposalTypeLabel={CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL}
            capabilityKey="config_layout_assist"
            status={bosStatus}
            presentationVariant={frameVariant}
            sourceLabel={CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL}
            summary={presentation.summary}
            requiresApproval={requiresApproval}
            riskLevel={
                presentation.advanced.risk_level === "low" ||
                presentation.advanced.risk_level === "medium" ||
                presentation.advanced.risk_level === "high" ?
                    presentation.advanced.risk_level
                :   "medium"
            }
            mutationBoundaryCopy={configProposalMutationBoundaryCopy(statePresentation)}
            policyCopy={policyLines.length ? policyLines.join(" ") : null}
            footer={
                lifecycleActions.length > 0 ?
                    <div className="flex flex-wrap gap-2">
                        {lifecycleActions.map((a) => (
                            <button
                                key={a.label}
                                type="button"
                                disabled={busy}
                                className={`rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
                                    a.variant === "danger" ?
                                        "border border-red-200 text-red-800"
                                    :   "bg-alloy-midnight/90 text-white"
                                }`}
                                onClick={a.onClick}
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>
                :   null
            }
            receipt={receipt}
        >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                {statePresentation.stateLabel}
            </p>
            {statePresentation.statusHint ?
                <p className="text-[11px] font-medium text-alloy-pine">{statePresentation.statusHint}</p>
            :   null}

            <ConfirmChangeCard presentation={presentation} />
            <AdvancedDetails presentation={presentation} />
            </OperationalProposalCardFrame>
        </div>
    );
}

function ConfirmChangeCard({ presentation }: { presentation: ProposalReviewPresentation }) {
    return (
        <section className="space-y-2" aria-label="Confirm this change">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                Confirm this change
            </h3>
            <dl className="space-y-2.5">
                {presentation.fieldRows.map((row) => (
                    <div key={`${row.label}-${row.value}`} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-0.5 text-sm">
                        {row.label ?
                            <dt className="text-alloy-midnight/50">{row.label}</dt>
                        :   <dt className="sr-only">Detail</dt>
                        }
                        <dd className="font-medium text-alloy-midnight">{row.value}</dd>
                    </div>
                ))}
            </dl>
            {presentation.humanExplanation ?
                <p className="rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/75">
                    {presentation.humanExplanation}
                </p>
            :   null}
            {presentation.confirmationQuestions.length > 0 ?
                <div className="border-t border-alloy-forge/10 pt-3">
                    <p className="text-[11px] font-semibold text-alloy-midnight/55">Please confirm</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-alloy-midnight/70">
                        {presentation.confirmationQuestions.map((q) => (
                            <li key={q}>{q}</li>
                        ))}
                    </ul>
                </div>
            :   null}
        </section>
    );
}

function AdvancedDetails({ presentation }: { presentation: ProposalReviewPresentation }) {
    const { advanced } = presentation;
    return (
        <details className="rounded-md border border-alloy-stone/15 bg-white/45 px-3 py-2 text-[11px]">
            <summary className="cursor-pointer select-none font-medium text-alloy-midnight/55 [&::-webkit-details-marker]:hidden">
                Advanced details
            </summary>
            <div className="mt-3 space-y-3 text-alloy-midnight/70">
                <dl className="grid grid-cols-2 gap-2">
                    <div>
                        <dt className="text-alloy-midnight/45">Proposal id</dt>
                        <dd className="font-mono text-[10px] break-all">{advanced.proposal_id}</dd>
                    </div>
                    <div>
                        <dt className="text-alloy-midnight/45">Apply mode</dt>
                        <dd>{advanced.apply_mode}</dd>
                    </div>
                    {advanced.internal_field_key ?
                        <div className="col-span-2">
                            <dt className="text-alloy-midnight/45">Internal key</dt>
                            <dd className="font-mono text-[10px]">{advanced.internal_field_key}</dd>
                        </div>
                    :   null}
                </dl>
                {advanced.permissions.length > 0 ?
                    <div>
                        <p className="font-semibold text-alloy-midnight/55">Permissions</p>
                        <p className="mt-0.5 font-mono text-[10px]">{advanced.permissions.join(", ")}</p>
                    </div>
                :   null}
                <div className="space-y-2">
                    <p className="font-semibold text-alloy-midnight/55">Operations</p>
                    {advanced.operations.map((op, idx) => (
                        <div
                            key={`${op.kind}-${idx}`}
                            className="rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5"
                        >
                            <p className="font-medium text-alloy-midnight">
                                {operationKindLabel(op.kind as Parameters<typeof operationKindLabel>[0])} ·{" "}
                                {op.entity_type}
                                {op.field_key ? ` · ${op.field_key}` : ""}
                                {op.section_key ? ` · ${op.section_key}` : ""}
                            </p>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-alloy-midnight/[0.04] p-1 font-mono text-[10px]">
                                {op.raw_json}
                            </pre>
                        </div>
                    ))}
                </div>
            </div>
        </details>
    );
}
