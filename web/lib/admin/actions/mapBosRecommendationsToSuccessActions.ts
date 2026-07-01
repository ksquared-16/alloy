import type {
    BosRecommendation,
    BosRecommendationSuccessAction,
} from "@/lib/admin/actions/bosRecommendationTypes";

const SUCCESS_ACTION_ICONS: Record<string, BosRecommendationSuccessAction["icon"]> = {
    "schedule-tour": "calendar",
    "send-welcome": "mail",
    "open-lead": "open",
};

function statusForRecommendation(rec: BosRecommendation): string | undefined {
    if (rec.readiness === "coming_soon") return rec.reason;
    if (rec.readiness === "blocked") {
        return rec.blockingRequirements?.length ? rec.blockingRequirements.join(" · ") : rec.reason;
    }
    if (rec.readiness === "ready" && rec.actionKey) return rec.reason;
    return undefined;
}

function isClickableOnSuccess(rec: BosRecommendation): boolean {
    if (!rec.actionKey) return false;
    if (rec.readiness === "coming_soon") return false;
    if (rec.readiness === "blocked") return false;
    // Registry actions open from drawer context — not from success workspace yet.
    return false;
}

/** Map structured recommendations to success CTAs — no dead clickables. */
export function mapBosRecommendationsToSuccessActions(
    recommendations: BosRecommendation[],
    handlers: { onOpenLead: () => void }
): BosRecommendationSuccessAction[] {
    const actions: BosRecommendationSuccessAction[] = [];

    for (const rec of recommendations) {
        if (!rec.actionKey) continue;
        if (rec.readiness === "coming_soon") continue;
        const icon = SUCCESS_ACTION_ICONS[rec.key];
        if (!icon) continue;
        const clickable = isClickableOnSuccess(rec);
        actions.push({
            id: rec.key,
            label: rec.title,
            icon,
            actionKey: rec.actionKey,
            disabled: !clickable,
            status: statusForRecommendation(rec),
            onClick: clickable ? undefined : undefined,
        });
    }

    actions.push({
        id: "open-lead",
        label: "Open Lead",
        icon: "open",
        onClick: handlers.onOpenLead,
    });

    return actions;
}
