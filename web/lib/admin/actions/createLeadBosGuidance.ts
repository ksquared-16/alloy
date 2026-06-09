import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";

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
    const childFirst = (values.child_first_name ?? "").trim();
    const program = (values.child_program ?? "").trim();
    const source = (values.source ?? "").trim();

    if (!first) missingItems.push(LABEL_BY_KEY.first_name ?? "First Name");
    if (!last) missingItems.push(LABEL_BY_KEY.last_name ?? "Last Name");
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
    const name = [first, last].filter(Boolean).join(" ");
    return name ? `${name} Household` : null;
}

export type BosRecommendationTone = "positive" | "recommended" | "warning";

export type BosRecommendation = {
    id: string;
    label: string;
    detail: string;
    tone: BosRecommendationTone;
};

/** Presentation-only success recommendations — not functional yet. */
export function resolveCreateLeadBosRecommendations(values: Record<string, string>): BosRecommendation[] {
    const recommendations: BosRecommendation[] = [
        {
            id: "schedule-tour",
            label: "Schedule Tour",
            detail: "High likelihood",
            tone: "positive",
        },
        {
            id: "send-welcome",
            label: "Send Welcome Email",
            detail: "Recommended",
            tone: "recommended",
        },
    ];

    if (!(values.child_date_of_birth ?? "").trim()) {
        recommendations.push({
            id: "child-dob",
            label: "Missing Child DOB",
            detail: "Follow-up suggested",
            tone: "warning",
        });
    }

    return recommendations;
}
