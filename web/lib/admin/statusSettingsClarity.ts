import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import {
    filterPersonStatusDefinitionsForProfile,
    personStatusAppliesToProfile,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
    type PersonStatusApplicabilityRow,
    type PersonStatusProfileKey,
} from "@/lib/admin/person/personStatusApplicability";

/** AdminV2 statuses settings base path. */
export const ADMIN_SETTINGS_STATUSES_PATH = adminSettingsSubpathHref("statuses");

export type PersonProfileFilterParam = "all" | PersonStatusProfileKey;

export type StatusDrawerSourceTag =
    | "lead_drawer"
    | "person_drawer"
    | "child_drawer"
    | "enrollment_pipeline"
    | "queue_lifecycle"
    | "customer_roster";

export const STATUS_DRAWER_SOURCE_TAG_LABELS: Record<StatusDrawerSourceTag, string> = {
    lead_drawer: "Lead drawer",
    person_drawer: "Person drawer",
    child_drawer: "Child drawer",
    enrollment_pipeline: "Enrollment pipeline",
    queue_lifecycle: "Queue / lifecycle",
    customer_roster: "Customer roster",
};

/** Operator-facing Settings → Statuses section titles (tenant labels may override via entity labels). */
export const STATUS_SETTINGS_SECTION_TITLES: Record<string, string> = {
    opportunities: "Lead Statuses",
    opportunity_customer_members: "Enrollment Statuses",
    persons: "People Statuses",
};

/** Section descriptions — what each Settings entity type controls. */
export const STATUS_SETTINGS_SECTION_DESCRIPTIONS: Record<string, string> = {
    opportunities:
        "Controls the Lead drawer status dropdown and family-track enrollment stages.",
    persons:
        "Controls People drawer status dropdowns. Options are filtered by Applicability profile.",
    opportunity_customer_members:
        "Controls per-child enrollment status on a Lead (child track). Drives Waitlist, Enrolling, and Enrolled queues.",
    customer_members:
        "Controls customer/member records where applicable. This is not the same as the Child drawer status.",
};

/** Default section tags shown at entity-type level. */
export function statusDrawerSourceTagsForEntityType(entityType: string): StatusDrawerSourceTag[] {
    switch (entityType) {
        case "opportunities":
            return ["lead_drawer", "queue_lifecycle"];
        case "persons":
            return ["person_drawer", "child_drawer"];
        case "opportunity_customer_members":
            return ["enrollment_pipeline", "queue_lifecycle"];
        case "customer_members":
            return ["customer_roster"];
        default:
            return [];
    }
}

export function statusDrawerSourceTagsForPersonRow(
    row: PersonStatusApplicabilityRow & { is_active?: boolean }
): StatusDrawerSourceTag[] {
    if (row.is_active === false) return [];
    const tags: StatusDrawerSourceTag[] = [];
    if (personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_GENERIC)) {
        tags.push("person_drawer");
    }
    if (personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_CHILD_LIFECYCLE)) {
        tags.push("child_drawer");
    }
    return tags;
}

export function statusDrawerSourceTagsForOpportunityRow(isActive: boolean): StatusDrawerSourceTag[] {
    if (!isActive) return [];
    return ["lead_drawer", "queue_lifecycle"];
}

export function statusDrawerSourceTagsForOcmRow(isActive: boolean): StatusDrawerSourceTag[] {
    if (!isActive) return [];
    return ["enrollment_pipeline", "queue_lifecycle"];
}

/** Operator-facing preview lines for People rows. */
export function personStatusDrawerPreviewNotes(
    row: PersonStatusApplicabilityRow & { is_active?: boolean }
): string[] {
    if (row.is_active === false) {
        return ["Hidden from drawer dropdowns"];
    }
    const notes: string[] = [];
    if (personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_GENERIC)) {
        notes.push("Shown in Person drawer");
    }
    if (personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_CHILD_LIFECYCLE)) {
        notes.push("Shown in Child drawer");
    }
    if (notes.length === 0) {
        notes.push("Hidden from drawer dropdowns");
    }
    return notes;
}

export function personStatusMissingApplicabilityMetadata(
    metadata: Record<string, unknown> | null | undefined
): boolean {
    const profiles = metadata?.applies_to_profiles;
    return !Array.isArray(profiles) || profiles.length === 0;
}

export function parsePersonProfileFilterParam(raw: string | null | undefined): PersonProfileFilterParam {
    const t = String(raw ?? "").trim().toLowerCase();
    if (t === "person_generic" || t === "parent" || t === "guardian" || t === "generic") {
        return PERSON_STATUS_PROFILE_GENERIC;
    }
    if (t === "child_lifecycle" || t === "child" || t === "children") {
        return PERSON_STATUS_PROFILE_CHILD_LIFECYCLE;
    }
    return "all";
}

export function filterPersonStatusRowsForSettingsProfile<T extends PersonStatusApplicabilityRow>(
    rows: T[],
    profile: PersonProfileFilterParam
): T[] {
    if (profile === "all") return rows;
    return filterPersonStatusDefinitionsForProfile(rows, profile);
}

export function buildStatusSettingsHref(params: {
    entityType: string;
    profile?: PersonStatusProfileKey | null;
}): string {
    const base = `${ADMIN_SETTINGS_STATUSES_PATH}?entity_type=${encodeURIComponent(params.entityType)}`;
    if (params.entityType === "persons" && params.profile) {
        return `${base}&profile=${encodeURIComponent(params.profile)}`;
    }
    return base;
}

export function buildDrawerStatusSettingsHref(params: {
    entityKind: "opportunities" | "persons";
    statusProfile?: PersonStatusProfileKey | null;
}): string {
    if (params.entityKind === "opportunities") {
        return buildStatusSettingsHref({ entityType: "opportunities" });
    }
    return buildStatusSettingsHref({
        entityType: "persons",
        profile: params.statusProfile ?? PERSON_STATUS_PROFILE_GENERIC,
    });
}

export function personProfileFilterChipHref(
    basePath: string,
    profile: PersonProfileFilterParam,
    entityTypeFilter = "persons"
): string {
    const params = new URLSearchParams({ entity_type: entityTypeFilter });
    if (profile !== "all") {
        params.set("profile", profile);
    }
    return `${basePath}?${params.toString()}`;
}
