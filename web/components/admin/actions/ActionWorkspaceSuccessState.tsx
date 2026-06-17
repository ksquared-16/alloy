"use client";

import { useState } from "react";
import { Calendar, Check, ChevronDown, ChevronRight, ExternalLink, Mail } from "lucide-react";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import {
    bosRecommendationReadinessLabel,
    type BosRecommendation,
    type BosRecommendationSuccessAction,
} from "@/lib/admin/actions/bosRecommendationTypes";

type Props = {
    title: string;
    detail?: string;
    householdLabel?: string | null;
    suggestedActions?: BosRecommendationSuccessAction[];
    bosRecommendations?: BosRecommendation[];
    maxVisibleRecommendations?: number;
};

const ICONS = {
    calendar: Calendar,
    mail: Mail,
    open: ExternalLink,
} as const;

const READINESS_STYLE: Record<BosRecommendation["readiness"], string> = {
    ready: "text-[#007A63] bg-[#00A283]/10",
    blocked: "text-amber-800 bg-amber-50",
    coming_soon: "text-alloy-midnight/55 bg-alloy-stone/10",
};

function RecommendationRow({ rec }: { rec: BosRecommendation }) {
    return (
        <li
            className="rounded-md bg-white/70 px-2.5 py-2"
            data-testid={`action-workspace-bos-recommendation-${rec.key}`}
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-medium leading-snug text-alloy-midnight/85">{rec.title}</span>
                <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${READINESS_STYLE[rec.readiness]}`}
                >
                    {bosRecommendationReadinessLabel(rec.readiness)}
                </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/50">{rec.reason}</p>
            {rec.blockingRequirements && rec.blockingRequirements.length > 0 ?
                <ul className="mt-1 space-y-0.5 text-[10px] text-amber-900/75">
                    {rec.blockingRequirements.map((req) => (
                        <li key={req} data-testid={`action-workspace-bos-blocking-${rec.key}-${req}`}>
                            • {req}
                        </li>
                    ))}
                </ul>
            :   null}
        </li>
    );
}

export function ActionWorkspaceSuccessState({
    title,
    detail,
    householdLabel,
    suggestedActions = [],
    bosRecommendations = [],
    maxVisibleRecommendations = 3,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const visibleCount = Math.max(0, maxVisibleRecommendations);
    const primaryRecommendations = bosRecommendations.slice(0, visibleCount);
    const overflowRecommendations = bosRecommendations.slice(visibleCount);
    const openLeadAction = suggestedActions.find((action) => action.id === "open-lead");
    const secondaryActions = suggestedActions.filter((action) => action.id !== "open-lead");

    return (
        <div
            className="flex h-full min-h-0 flex-col px-4 py-3"
            data-testid="action-workspace-success-state"
        >
            <div className="flex shrink-0 flex-col items-center text-center">
                <BosMark size="md" horizon />
                <p className="mt-2 text-lg font-semibold text-alloy-midnight">{title}</p>
                {householdLabel ?
                    <p
                        className="mt-0.5 text-sm font-medium text-alloy-midnight/70"
                        data-testid="action-workspace-success-household"
                    >
                        {householdLabel}
                    </p>
                :   null}
                {detail ?
                    <p className="mt-1 text-xs text-alloy-midnight/50">{detail}</p>
                :   null}
            </div>

            {bosRecommendations.length > 0 ?
                <div
                    className="mt-3 min-h-0 flex-1 overflow-y-auto"
                    data-testid="action-workspace-bos-recommendations"
                >
                    <div className="rounded-xl border border-[#00A283]/12 bg-[#00A283]/[0.04] px-3 py-2.5 text-left">
                        <div className="mb-2 flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#00A283]" strokeWidth={2.5} aria-hidden />
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#007A63]">
                                BOS Recommendations
                            </span>
                        </div>
                        <ul className="space-y-1.5">
                            {primaryRecommendations.map((rec) => (
                                <RecommendationRow key={rec.key} rec={rec} />
                            ))}
                        </ul>
                        {overflowRecommendations.length > 0 ?
                            <div className="mt-2">
                                <button
                                    type="button"
                                    onClick={() => setExpanded((v) => !v)}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-[#007A63]"
                                    data-testid="action-workspace-bos-recommendations-expand"
                                >
                                    {expanded ?
                                        <ChevronDown className="h-3 w-3" />
                                    :   <ChevronRight className="h-3 w-3" />}
                                    {expanded ?
                                        "Show fewer"
                                    :   `Show ${overflowRecommendations.length} more`}
                                </button>
                                {expanded ?
                                    <ul className="mt-1.5 space-y-1.5">
                                        {overflowRecommendations.map((rec) => (
                                            <RecommendationRow key={rec.key} rec={rec} />
                                        ))}
                                    </ul>
                                :   null}
                            </div>
                        :   null}
                    </div>
                </div>
            :   null}

            {suggestedActions.length > 0 ?
                <div
                    className="mt-3 shrink-0 border-t border-alloy-stone/10 pt-3"
                    data-testid="action-workspace-success-actions"
                >
                    {openLeadAction ?
                        <div className="flex flex-col items-center gap-2">
                            <button
                                type="button"
                                disabled={openLeadAction.disabled}
                                onClick={openLeadAction.onClick}
                                title={openLeadAction.status ?? undefined}
                                className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-lg border border-[#00A283]/30 bg-[#00A283] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                                data-testid="action-workspace-success-action-open-lead"
                            >
                                <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
                                {openLeadAction.label}
                            </button>
                            {secondaryActions.length > 0 ?
                                <div className="flex w-full max-w-md flex-wrap items-start justify-center gap-2">
                                    {secondaryActions.map((action) => {
                                        const Icon = ICONS[action.icon];
                                        return (
                                            <div key={action.id} className="flex min-w-[8.5rem] flex-col items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    disabled={action.disabled}
                                                    onClick={action.onClick}
                                                    title={action.status ?? undefined}
                                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-alloy-stone/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/5 disabled:cursor-not-allowed disabled:opacity-45"
                                                    data-testid={`action-workspace-success-action-${action.id}`}
                                                >
                                                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                                    {action.label}
                                                </button>
                                                {action.status ?
                                                    <span
                                                        className="max-w-[10rem] text-center text-[9px] font-medium leading-tight text-alloy-midnight/45"
                                                        data-testid={`action-workspace-success-action-status-${action.id}`}
                                                    >
                                                        {action.status}
                                                    </span>
                                                :   null}
                                            </div>
                                        );
                                    })}
                                </div>
                            :   null}
                        </div>
                    :   null}
                </div>
            :   null}
        </div>
    );
}
