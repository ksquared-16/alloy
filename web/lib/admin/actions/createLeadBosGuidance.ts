import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";
import type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import { mapBosRecommendationsToSuccessActions } from "@/lib/admin/actions/mapBosRecommendationsToSuccessActions";

export type { BosRecommendation } from "@/lib/admin/actions/bosRecommendationTypes";

const LABEL_BY_KEY = Object.fromEntries(
    CREATE_LEAD_GATHER_FIELDS.map((f) => [f.payload_key, f.field_label])
) as Record<string, string>;

export type CreateLeadBosGuidance = {
    ready: boolean;
    headline: string;
    missingItems: string[];
    advisoryItems: string[];
};

/** Presentation-only BOS guidance copy for manual gather — no workflow side effects. */
export function resolveCreateLeadBosGuidance(values: Record<string, string>): CreateLeadBosGuidance {
    const missingItems: string[] = [];
    const advisoryItems: string[] = [];
    const first = (values.first_name ?? "").trim();
    const last = (values.last_name ?? "").trim();
    const email = (values.email ?? "").trim();
    const phone = (values.phone ?? "").trim();
    const location = (values.location_id ?? "").trim();
    const childFirst = (values.child_first_name ?? "").trim();
    const program = (values.child_program ?? "").trim();
    const source = (values.source ?? "").trim();

    if (!first) missingItems.push(LABEL_BY_KEY.first_name ?? "First Name");
    if (!last) missingItems.push(LABEL_BY_KEY.last_name ?? "Last Name");
    if (!location) missingItems.push(LABEL_BY_KEY.location_id ?? "Location");
    if (!email && !phone) missingItems.push("contact method");

    if (!childFirst) advisoryItems.push("child information");
    if (!program) advisoryItems.push("program interest");
    if (!source) advisoryItems.push("source");

    if (missingItems.length === 0) {
        return {
            ready: true,
            headline: "BOS sees enough information to create this lead.",
            missingItems: [],
            advisoryItems,
        };
    }

    return {
        ready: false,
        headline: "Required fields remaining:",
        missingItems,
        advisoryItems,
    };
}

export function formatCreateLeadHouseholdLabel(values: Record<string, string>): string | null {
    const first = (values.first_name ?? "").trim();
    const last = (values.last_name ?? "").trim();
    if (!first && !last) return null;
    return buildHouseholdLeadDisplayName({ firstName: first, lastName: last });
}

/** @deprecated Use resolveCreateLeadPostCreateRecommendations */
export function resolveCreateLeadBosRecommendations(values: Record<string, string>): BosRecommendation[] {
    return resolveCreateLeadPostCreateRecommendations(values);
}

export type CreateLeadSuccessAction = import("@/lib/admin/actions/bosRecommendationTypes").BosRecommendationSuccessAction;

/** @deprecated Use mapBosRecommendationsToSuccessActions */
export function resolveCreateLeadSuccessActions(values: Record<string, string>): CreateLeadSuccessAction[] {
    return mapBosRecommendationsToSuccessActions(resolveCreateLeadPostCreateRecommendations(values), {
        onOpenLead: () => {},
    });
}
