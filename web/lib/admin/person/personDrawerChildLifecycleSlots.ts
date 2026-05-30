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

export type ChildLifecycleSlotState = {
    key: (typeof CHILD_LIFECYCLE_SECTION_SLOTS)[number];
    label: string;
    phase: ChildLifecycleSlotPhase;
    /** Target `record_drawer_layouts` section_key when modules ship. */
    layoutSectionKey: string;
};

const SLOT_LABELS: Record<(typeof CHILD_LIFECYCLE_SECTION_SLOTS)[number], string> = {
    enrollment_activity: "Enrollment",
    schedule: "Schedule",
    attendance: "Attendance",
    billing: "Billing",
    documents: "Documents",
    communications: "Communications",
    history: "History",
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

export function resolveChildLifecycleSlotStates(record: Record<string, unknown>): ChildLifecycleSlotState[] {
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const enrollmentCount = buildPersonEnrollmentActivityEntries(mirror, opps).length;

    return CHILD_LIFECYCLE_SECTION_SLOTS.map((key) => {
        if (key === "enrollment_activity") {
            return {
                key,
                label: SLOT_LABELS[key],
                phase: enrollmentCount > 0 ? "active" : "idle",
                layoutSectionKey: LAYOUT_SECTION_KEYS[key],
            };
        }
        return {
            key,
            label: SLOT_LABELS[key],
            phase: "future",
            layoutSectionKey: LAYOUT_SECTION_KEYS[key],
        };
    });
}

export function primaryHouseholdLabel(record: Record<string, unknown>): string | null {
    const ctx = (record._household_context as PersonHouseholdContextRow[] | undefined) ?? [];
    const fromCtx = ctx.find((r) => r.customer_name)?.customer_name;
    if (fromCtx) return fromCtx.trim() || null;

    const cps = (record._customer_persons as { _customer_name?: string | null }[] | undefined) ?? [];
    const fromCp = cps.find((r) => r._customer_name)?._customer_name;
    return fromCp ? String(fromCp).trim() || null : null;
}

export function primaryEnrollmentHint(record: Record<string, unknown>): {
    opportunity_id: string;
    label: string;
    status: string | null;
} | null {
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const entries = buildPersonEnrollmentActivityEntries(mirror, opps);
    const first = entries[0];
    if (!first) return null;
    return {
        opportunity_id: first.opportunity_id,
        label: first.opportunity_name,
        status: first.status_label ?? first.outcome_label ?? null,
    };
}

/** Preferred overview section order for child lifecycle emphasis. */
export const CHILD_LIFECYCLE_SECTION_ORDER: Record<string, number> = {
    relationships: 0,
    enrollment_activity: 1,
    basic_info: 10,
    child_profile: 11,
    medical: 12,
    consent: 13,
    employee_placement: 90,
    record_info: 99,
};

export function sortOverviewSectionsForChildLifecycle<T extends { key: string }>(sections: T[]): T[] {
    return [...sections].sort((a, b) => {
        const ra = CHILD_LIFECYCLE_SECTION_ORDER[a.key] ?? 50;
        const rb = CHILD_LIFECYCLE_SECTION_ORDER[b.key] ?? 50;
        return ra - rb || a.key.localeCompare(b.key);
    });
}
