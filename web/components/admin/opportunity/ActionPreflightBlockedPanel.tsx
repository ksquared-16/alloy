"use client";

import MissingRequirementsSummary from "@/components/admin/completion/MissingRequirementsSummary";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import { applyActionPreflightFieldGuidance } from "@/lib/admin/actions/actionPreflightFieldGuidance";

type Props = {
    opportunityId: string;
    preflight: ActionPreflightUiPayload;
    className?: string;
    onDismiss?: () => void;
};

export function ActionPreflightBlockedPanel({ opportunityId, preflight, className = "", onDismiss }: Props) {
    const blocking = preflight.blocking;
    const hasBlocking = blocking.length > 0;

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
            {preflight.summary ?
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/65" data-action-preflight-summary="true">
                    {preflight.summary}
                </p>
            :   null}
            {hasBlocking ?
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
