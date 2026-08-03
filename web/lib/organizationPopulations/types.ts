/**
 * Organization Populations — reusable “who belongs?” definitions.
 * Exact-version published snapshots; org-scoped via org_settings.metadata.
 */

export type PopulationPredicateId = "expected_in_room_on_date";

export type PopulationLifecycle = "draft" | "published" | "archived";

export type PopulationVersion = {
    id: string;
    version_number: number;
    immutable: boolean;
    predicate: PopulationPredicateId;
    /** Operator-facing membership sentence */
    membership_summary: string;
    published_at: string | null;
    created_at: string;
};

export type OrganizationPopulation = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    subject_grain: "room";
    lifecycle: PopulationLifecycle;
    published_version_id: string | null;
    versions: PopulationVersion[];
    created_at: string;
    updated_at: string;
    created_by: string | null;
};

export const POPULATION_META_KEY = "organization_populations";

export const POPULATION_PREDICATES: Record<
    PopulationPredicateId,
    { label: string; summary: string }
> = {
    expected_in_room_on_date: {
        label: "Expected in room on date",
        summary:
            "Children expected in this room on the selected date from committed schedules (same path as occupancy).",
    },
};

export function slugifyPopulationKey(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .slice(0, 64) || "population"
    );
}
