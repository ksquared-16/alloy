"use client";

import { Calendar, Check, ExternalLink, Mail } from "lucide-react";

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

export function ActionWorkspaceSuccessState({
    title,
    detail,
    householdLabel,
    suggestedActions = [],
    bosRecommendations = [],
}: Props) {
    return (
        <div
            className="flex min-h-[320px] flex-col items-center justify-center gap-5 px-4 py-2 text-center"
            data-testid="action-workspace-success-state"
        >
            <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#00A283]/10" aria-hidden />
                <div
                    className="absolute inset-2 rounded-full border border-[#00A283]/25 bg-[#00A283]/[0.06]"
                    aria-hidden
                />
                <BosMark size="lg" horizon className="relative h-10 w-10" />
            </div>
            <div>
                <p className="text-xl font-semibold text-alloy-midnight">{title}</p>
                {householdLabel ?
                    <p
                        className="mt-1 text-base font-medium text-alloy-midnight/75"
                        data-testid="action-workspace-success-household"
                    >
                        {householdLabel}
                    </p>
                :   null}
                {detail ?
                    <p className="mt-1 text-sm text-alloy-midnight/55">{detail}</p>
                :   null}
            </div>

            {bosRecommendations.length > 0 ?
                <div
                    className="w-full max-w-md rounded-2xl border border-[#00A283]/12 bg-[#00A283]/[0.04] px-4 py-3.5 text-left"
                    data-testid="action-workspace-bos-recommendations"
                >
                    <div className="mb-2.5 flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-[#00A283]" strokeWidth={2.5} aria-hidden />
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#007A63]">
                            BOS Recommendations
                        </span>
                    </div>
                    <p className="mb-2 text-[11px] font-medium text-alloy-midnight/45">
                        Next steps and Required Information
                    </p>
                    <ul className="space-y-2">
                        {bosRecommendations.map((rec) => (
                            <li
                                key={rec.key}
                                className="rounded-lg bg-white/70 px-3 py-2.5"
                                data-testid={`action-workspace-bos-recommendation-${rec.key}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-sm font-medium text-alloy-midnight/85">{rec.title}</span>
                                    <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${READINESS_STYLE[rec.readiness]}`}
                                    >
                                        {bosRecommendationReadinessLabel(rec.readiness)}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">{rec.reason}</p>
                                {rec.blockingRequirements && rec.blockingRequirements.length > 0 ?
                                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-amber-900/80">
                                        {rec.blockingRequirements.map((req) => (
                                            <li key={req} data-testid={`action-workspace-bos-blocking-${rec.key}-${req}`}>
                                                • {req}
                                            </li>
                                        ))}
                                    </ul>
                                :   null}
                            </li>
                        ))}
                    </ul>
                </div>
            :   null}

            {suggestedActions.length > 0 ?
                <div
                    className="flex flex-wrap items-center justify-center gap-2"
                    data-testid="action-workspace-success-actions"
                >
                    {suggestedActions.map((action) => {
                        const Icon = ICONS[action.icon];
                        return (
                            <div key={action.id} className="flex flex-col items-center gap-0.5">
                                <button
                                    type="button"
                                    disabled={action.disabled}
                                    onClick={action.onClick}
                                    title={action.status ?? undefined}
                                    className={
                                        action.icon === "open" ?
                                            "inline-flex items-center gap-1.5 rounded-lg border border-[#00A283]/30 bg-[#00A283] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                                        :   "inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/20 bg-white px-3.5 py-2 text-sm font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/5 disabled:cursor-not-allowed disabled:opacity-45"
                                    }
                                    data-testid={`action-workspace-success-action-${action.id}`}
                                >
                                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                                    {action.label}
                                </button>
                                {action.status ?
                                    <span
                                        className="max-w-[11rem] text-center text-[10px] font-medium text-alloy-midnight/45"
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
    );
}
