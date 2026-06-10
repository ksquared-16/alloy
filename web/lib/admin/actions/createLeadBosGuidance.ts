import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";

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
    if (!first && !last) return null;
    return buildHouseholdLeadDisplayName({ firstName: first, lastName: last });
}

export type BosRecommendationTone = "positive" | "recommended" | "warning";

export type BosRecommendation = {
    id: string;
    label: string;
    detail: string;
    tone: BosRecommendationTone;
};

function hasScheduleTourPrerequisites(values: Record<string, string>): boolean {
    const childFirst = (values.child_first_name ?? "").trim();
    const program = (values.child_program ?? "").trim();
    const location = (values.location_id ?? "").trim();
    return Boolean(childFirst && program && location);
}

function scheduleTourStatusDetail(values: Record<string, string>): string {
    if (hasScheduleTourPrerequisites(values)) return "Available after opening lead";
    return "Needs child/program info";
}

const MISSING_FOLLOW_UP_FIELDS: { key: string; label: string }[] = [
    { key: "child_date_of_birth", label: "Child DOB" },
    { key: "child_desired_start_date", label: "Desired start date" },
    { key: "child_program", label: "Program interest" },
    { key: "location_id", label: "Location" },
    { key: "child_desired_schedule_type", label: "Schedule" },
];

/** Truthful success recommendations — gated next steps and Required Information follow-ups. */
export function resolveCreateLeadBosRecommendations(values: Record<string, string>): BosRecommendation[] {
    const recommendations: BosRecommendation[] = [
        {
            id: "schedule-tour",
            label: "Schedule Tour",
            detail: scheduleTourStatusDetail(values),
            tone: hasScheduleTourPrerequisites(values) ? "positive" : "warning",
        },
        {
            id: "send-welcome",
            label: "Send Welcome Email",
            detail: "Template ready soon",
            tone: "recommended",
        },
    ];

    for (const field of MISSING_FOLLOW_UP_FIELDS) {
        if ((values[field.key] ?? "").trim()) continue;
        recommendations.push({
            id: `missing-${field.key}`,
            label: field.label,
            detail: "Required Information",
            tone: "warning",
        });
    }

    return recommendations;
}

export type CreateLeadSuccessActionIcon = "calendar" | "mail" | "open";

export type CreateLeadSuccessAction = {
    id: string;
    label: string;
    icon: CreateLeadSuccessActionIcon;
    disabled?: boolean;
    status?: string;
};

/** Suggested success CTAs — disabled when not actionable; status explains why. */
export function resolveCreateLeadSuccessActions(values: Record<string, string>): CreateLeadSuccessAction[] {
    const scheduleReady = hasScheduleTourPrerequisites(values);
    return [
        {
            id: "schedule-tour",
            label: "Schedule Tour",
            icon: "calendar",
            disabled: !scheduleReady,
            status: scheduleReady ? undefined : "Needs child/program info",
        },
        {
            id: "send-welcome",
            label: "Send Welcome Email",
            icon: "mail",
            disabled: true,
            status: "Template ready soon",
        },
        {
            id: "open-lead",
            label: "Open Lead",
            icon: "open",
        },
    ];
}
