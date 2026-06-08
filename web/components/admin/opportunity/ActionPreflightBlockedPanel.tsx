"use client";

import MissingRequirementsSummary from "@/components/admin/completion/MissingRequirementsSummary";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import { applyActionPreflightFieldGuidance } from "@/lib/admin/actions/actionPreflightFieldGuidance";
import {
    actionPreflightBlockedSummary,
    enforcedReadinessGaps,
    guidanceReadinessGaps,
    READINESS_LEVEL_GROUP_COPY,
} from "@/lib/completion/readinessDisplayPresentation";

type Props = {
    opportunityId: string;
    preflight: ActionPreflightUiPayload;
    className?: string;
    onDismiss?: () => void;
};

export function ActionPreflightBlockedPanel({ opportunityId, preflight, className = "", onDismiss }: Props) {
    const blocking = preflight.blocking;
    const hasBlocking = blocking.length > 0;
    const enforcedGaps = enforcedReadinessGaps(preflight.readiness);
    const guidanceGaps = guidanceReadinessGaps(preflight.readiness);
    const useReadinessBlockers = enforcedGaps.length > 0;
    const summary =
        useReadinessBlockers ? actionPreflightBlockedSummary() : preflight.summary;

    return (
        <div
            className={`rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2.5 ${className}`}
            data-action-preflight-blocked="true"
            data-action-preflight-key={preflight.action_key}
            role="alert"
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-alloy-midnight" data-action-preflight-title="true">
                    {preflight.title}
                </p>
                {onDismiss ?
                    <button
                        type="button"
                        className="shrink-0 text-[10px] text-alloy-midnight/50 hover:text-alloy-midnight/70"
                        onClick={onDismiss}
                        aria-label="Dismiss requirements notice"
                    >
                        Dismiss
                    </button>
                :   null}
            </div>
            {summary ?
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/65" data-action-preflight-summary="true">
                    {summary}
                </p>
            :   null}
            {useReadinessBlockers ?
                <div className="mt-2" data-action-preflight-enforced-blockers="true">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/55">
                        Complete these enforced items first:
                    </p>
                    <ul className="mt-1 space-y-1.5" data-action-preflight-blocking-list="true">
                        {enforcedGaps.map((gap) => (
                            <li
                                key={`${gap.requirement_id}-${gap.label}`}
                                className="text-[11px] leading-snug text-alloy-midnight/75"
                                data-action-preflight-blocking-item="true"
                                data-action-preflight-gap-level="enforced"
                                data-action-preflight-field-key={gap.field_key ?? gap.requirement_id}
                            >
                                <span className="font-medium text-alloy-midnight">{gap.label}</span>
                                {gap.missing_reason ?
                                    <span className="text-alloy-midnight/55"> — {gap.missing_reason}</span>
                                :   null}
                                {gap.field_key ?
                                    <button
                                        type="button"
                                        className="ml-1.5 text-[10px] font-medium text-alloy-blue hover:underline"
                                        data-action-preflight-go-to-field="true"
                                        onClick={() =>
                                            applyActionPreflightFieldGuidance(
                                                opportunityId,
                                                gap.field_key!,
                                                preflight.action_key
                                            )
                                        }
                                    >
                                        Go to field
                                    </button>
                                :   null}
                            </li>
                        ))}
                    </ul>
                </div>
            : hasBlocking ?
                <ul className="mt-2 space-y-1.5" data-action-preflight-blocking-list="true">
                    {blocking.map((item) => (
                        <li
                            key={`${item.field_key}-${item.label}-${item.source}`}
                            className="text-[11px] leading-snug text-alloy-midnight/75"
                            data-action-preflight-blocking-item="true"
                            data-action-preflight-field-key={item.field_key}
                        >
                            <span className="font-medium text-alloy-midnight">{item.label}</span>
                            {item.reason ?
                                <span className="text-alloy-midnight/55"> — {item.reason}</span>
                            :   null}
                            {item.source ?
                                <span
                                    className="ml-1 text-[10px] uppercase tracking-wide text-alloy-midnight/40"
                                    data-action-preflight-source="true"
                                >
                                    ({item.source})
                                </span>
                            :   null}
                            <button
                                type="button"
                                className="ml-1.5 text-[10px] font-medium text-alloy-blue hover:underline"
                                data-action-preflight-go-to-field="true"
                                onClick={() =>
                                    applyActionPreflightFieldGuidance(
                                        opportunityId,
                                        item.field_key,
                                        preflight.action_key
                                    )
                                }
                            >
                                Go to field
                            </button>
                        </li>
                    ))}
                </ul>
            :   null}
            {guidanceGaps.length > 0 ?
                <div
                    className="mt-2 rounded-md border border-alloy-forge/10 bg-white/60 px-2 py-1.5"
                    data-action-preflight-guidance="true"
                >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Also helpful to complete
                    </p>
                    <ul className="mt-1 space-y-1">
                        {guidanceGaps.map((gap) => {
                            const copy = READINESS_LEVEL_GROUP_COPY[gap.level];
                            return (
                                <li
                                    key={`guidance-${gap.requirement_id}-${gap.label}`}
                                    className="text-[11px] leading-snug text-alloy-midnight/60"
                                    data-action-preflight-guidance-item="true"
                                    data-action-preflight-gap-level={gap.level}
                                >
                                    <span className="font-medium text-alloy-midnight/70">{gap.label}</span>
                                    <span className="text-alloy-midnight/45"> · {copy.heading}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            :   null}
            <div className="mt-2 border-t border-alloy-ember/15 pt-2">
                <MissingRequirementsSummary
                    result={preflight.completion_requirements}
                    title="Required before continuing"
                    compact
                    showFoundationNote={false}
                />
            </div>
        </div>
    );
}
