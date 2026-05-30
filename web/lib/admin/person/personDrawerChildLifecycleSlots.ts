import { buildPersonEnrollmentActivityEntries } from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import { CHILD_LIFECYCLE_SECTION_SLOTS } from "@/lib/admin/person/personDrawerPresentationEmphasis";
import { resolvePersonDrawerPresentationEmphasis } from "@/lib/admin/person/personDrawerPresentationEmphasis";
import type {
    PersonDrawerProfileResult,
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonHouseholdContextRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

/** Lifecycle slot phase for child drawer roadmap (not persisted). */
export type ChildLifecycleSlotPhase = "active" | "idle" | "future";

export type ChildLifecycleRoadmapSlotKey =
    | "lead"
    | "tour"
    | (typeof CHILD_LIFECYCLE_SECTION_SLOTS)[number];

export type ChildLifecycleSlotState = {
    key: ChildLifecycleRoadmapSlotKey;
    label: string;
    phase: ChildLifecycleSlotPhase;
    /** Target `record_drawer_layouts` section_key when modules ship. */
    layoutSectionKey: string;
};

const ROADMAP_PREFIX_SLOTS: Array<{ key: "lead" | "tour"; label: string; layoutSectionKey: string }> = [
    { key: "lead", label: "Family Lead", layoutSectionKey: "lead_summary" },
    { key: "tour", label: "Tour", layoutSectionKey: "tour_summary" },
];

const SLOT_LABELS: Record<(typeof CHILD_LIFECYCLE_SECTION_SLOTS)[number], string> = {
    enrollment_activity: "Enrollment",
    schedule: "Schedule",
    attendance: "Attendance",
    billing: "Billing",
    documents: "Documents",
    communications: "Communications",
    history: "Activity",
};

const LAYOUT_SECTION_KEYS: Record<(typeof CHILD_LIFECYCLE_SECTION_SLOTS)[number], string> = {
    enrollment_activity: "enrollment_activity",
    schedule: "schedule_summary",
    attendance: "attendance_summary",
    billing: "billing_summary",
    documents: "document_history",
    communications: "communications",
    history: "history",
};

/**
 * Child lifecycle surface — role-derived, not a persisted person type.
 * Future: `visible_when.roles includes child` on layout section placements.
 */
export function personDrawerShowsChildLifecycleSurface(profile: PersonDrawerProfileResult): boolean {
    return resolvePersonDrawerPresentationEmphasis(profile) === "child_lifecycle";
}

/** Quick links retired — household section owns relationship navigation for all person drawers. */
export function personDrawerShowsChildContextPanel(_profile: PersonDrawerProfileResult): boolean {
    return false;
}

export function resolveChildLifecycleSlotStates(record: Record<string, unknown>): ChildLifecycleSlotState[] {
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const enrollmentEntries = buildPersonEnrollmentActivityEntries(mirror, opps);
    const enrollmentCount = enrollmentEntries.length;
    const hasEnrollment = enrollmentCount > 0;
    const primaryOpportunityId = enrollmentEntries[0]?.opportunity_id ?? null;

    const prefix: ChildLifecycleSlotState[] = ROADMAP_PREFIX_SLOTS.map((slot) => ({
        key: slot.key,
        label: slot.label,
        phase: slot.key === "lead" ? (hasEnrollment ? "active" : "idle") : "future",
        layoutSectionKey: slot.layoutSectionKey,
    }));

    const body = CHILD_LIFECYCLE_SECTION_SLOTS.map((key) => {
        if (key === "enrollment_activity") {
            return {
                key,
                label: SLOT_LABELS[key],
                phase: hasEnrollment ? ("active" as const) : ("idle" as const),
                layoutSectionKey: LAYOUT_SECTION_KEYS[key],
            } satisfies ChildLifecycleSlotState;
        }
        if (key === "documents" || key === "history") {
            return {
                key,
                label: SLOT_LABELS[key],
                phase: "idle" as const,
                layoutSectionKey: LAYOUT_SECTION_KEYS[key],
            } satisfies ChildLifecycleSlotState;
        }
        if (key === "communications") {
            return {
                key,
                label: SLOT_LABELS[key],
                phase: primaryOpportunityId ? ("active" as const) : ("idle" as const),
                layoutSectionKey: LAYOUT_SECTION_KEYS[key],
            } satisfies ChildLifecycleSlotState;
        }
        return {
            key,
            label: SLOT_LABELS[key],
            phase: "future" as const,
            layoutSectionKey: LAYOUT_SECTION_KEYS[key],
        };
    });

    return [...prefix, ...body];
}

export function primaryHouseholdLabel(record: Record<string, unknown>): string | null {
    const ctx = (record._household_context as PersonHouseholdContextRow[] | undefined) ?? [];
    const fromCtx = ctx.find((r) => r.customer_name)?.customer_name;
    if (fromCtx) return fromCtx.trim() || null;

    const cps = (record._customer_persons as { _customer_name?: string | null }[] | undefined) ?? [];
    const fromCp = cps.find((r) => r._customer_name)?._customer_name;
    return fromCp ? String(fromCp).trim() || null : null;
}

/** Preferred overview section order for child lifecycle emphasis. */
export const CHILD_LIFECYCLE_SECTION_ORDER: Record<string, number> = {
    basic_info: 3,
    child_profile: 4,
    relationships: 1,
    enrollment_activity: 2,
    medical: 5,
    consent: 6,
    employee_placement: 95,
    record_info: 99,
};

/** Section keys that receive premium pine-accent chrome in child lifecycle overview (none — accent lives in summary + enrollment shells). */
export const CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS = new Set<string>(["medical"]);

export function sortOverviewSectionsForChildLifecycle<T extends { key: string }>(sections: T[]): T[] {
    return [...sections].sort((a, b) => {
        const ra = CHILD_LIFECYCLE_SECTION_ORDER[a.key] ?? 50;
        const rb = CHILD_LIFECYCLE_SECTION_ORDER[b.key] ?? 50;
        return ra - rb || a.key.localeCompare(b.key);
    });
}

export function childLifecycleSectionSurface(
    sectionKey: string
): "default" | "premium" {
    return CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS.has(sectionKey) ? "premium" : "default";
}

/**
 * Lifecycle UX direction (documented):
 * - **Today:** Lifecycle snapshot section on Overview (compact operational rollup).
 * - **Future:** expand snapshot modules when schedule/attendance/billing ship via layout placements.
 */
export const CHILD_LIFECYCLE_ROADMAP_UX = "overview_lifecycle_snapshot" as const;
