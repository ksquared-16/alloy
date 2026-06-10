export type BosRecommendationReadiness = "ready" | "blocked" | "coming_soon";

/** Structured BOS recommendation — scales to future gated action wiring. */
export type BosRecommendation = {
    key: string;
    title: string;
    reason: string;
    readiness: BosRecommendationReadiness;
    blockingRequirements?: string[];
    actionKey?: string;
};

export type BosRecommendationSuccessActionIcon = "calendar" | "mail" | "open";

export type BosRecommendationSuccessAction = {
    id: string;
    label: string;
    icon: BosRecommendationSuccessActionIcon;
    disabled?: boolean;
    status?: string;
    actionKey?: string;
    onClick?: () => void;
};

export function bosRecommendationReadinessLabel(readiness: BosRecommendationReadiness): string {
    switch (readiness) {
        case "ready":
            return "Ready";
        case "blocked":
            return "Needs info";
        case "coming_soon":
            return "Coming soon";
    }
}
