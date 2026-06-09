"use client";

import { Calendar, Check, ExternalLink, Mail, Sparkles } from "lucide-react";
import type { BosRecommendation } from "@/lib/admin/actions/createLeadBosGuidance";

type SuggestedAction = {
    id: string;
    label: string;
    icon: "calendar" | "mail" | "open";
    disabled?: boolean;
    onClick?: () => void;
};

type Props = {
    title: string;
    detail?: string;
    householdLabel?: string | null;
    suggestedActions?: SuggestedAction[];
    bosRecommendations?: BosRecommendation[];
};

const ICONS = {
    calendar: Calendar,
    mail: Mail,
    open: ExternalLink,
} as const;

const RECOMMENDATION_MARK: Record<BosRecommendation["tone"], string> = {
    positive: "✓",
    recommended: "✓",
    warning: "⚠",
};

const RECOMMENDATION_STYLE: Record<BosRecommendation["tone"], string> = {
    positive: "text-[#007A63]",
    recommended: "text-[#007A63]",
    warning: "text-amber-700",
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
                <Sparkles className="relative h-9 w-9 text-[#00A283]" strokeWidth={1.75} aria-hidden />
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
                    <p className="mb-2 text-[11px] font-medium text-alloy-midnight/45">Recommended next step</p>
                    <ul className="space-y-2">
                        {bosRecommendations.map((rec) => (
                            <li
                                key={rec.id}
                                className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2"
                                data-testid={`action-workspace-bos-recommendation-${rec.id}`}
                            >
                                <span className="text-sm font-medium text-alloy-midnight/85">
                                    <span className={`mr-1.5 ${RECOMMENDATION_STYLE[rec.tone]}`} aria-hidden>
                                        {RECOMMENDATION_MARK[rec.tone]}
                                    </span>
                                    {rec.label}
                                </span>
                                <span className="shrink-0 text-[11px] text-alloy-midnight/45">{rec.detail}</span>
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
                            <button
                                key={action.id}
                                type="button"
                                disabled={action.disabled}
                                onClick={action.onClick}
                                title={action.disabled ? "Available after opening lead" : undefined}
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
                        );
                    })}
                </div>
            :   null}
        </div>
    );
}
