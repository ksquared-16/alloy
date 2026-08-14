/**
 * Opportunity drawer workflow_v1 first-viewport contract — current product truth.
 *
 * This is the authoritative list of what the Opportunity drawer paints above the fold today.
 * It is NOT a settings-driven layout engine. When first-viewport content changes, update
 * this contract. A layout-config-driven resolver can replace this module later.
 */
import { opportunityInquiryTourDisplayFromPrimaryMetadata } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { readOpportunityDrawerGeometry } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/geometry";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";
import type {
    OpportunityDrawerFirstPaintDependencyKey,
    OpportunityDrawerFirstPaintViewportSlot,
} from "@/lib/adminV2/viewModel/drawer/types";

/** Always present in workflow_v1 Opportunity first viewport. */
export const OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_VIEWPORT_SLOTS: readonly OpportunityDrawerFirstPaintViewportSlot[] =
    ["header", "status", "location", "actions", "tabs", "lead_summary", "tour_slot"];

/** Data required for the current workflow_v1 first viewport (independent of future layout config). */
export const OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES: readonly OpportunityDrawerFirstPaintDependencyKey[] =
    [
        "record_visible",
        "status_definitions",
        "header_actions",
        "attention_bundle",
        "tour_bookings",
        "tasks_preview",
        "scheduled_sends",
        "inquiry_children",
        "scheduling_projection",
    ];

export type OpportunityFirstViewportPlan = {
    viewport_slots: OpportunityDrawerFirstPaintViewportSlot[];
    dependencies: OpportunityDrawerFirstPaintDependencyKey[];
};

export type OpportunityFirstViewportPlanInput = {
    shell: DrawerShellContract;
    task_assist_enabled: boolean;
    queue_definition_present: boolean;
};

function inquiryChildrenInFirstViewport(shell: DrawerShellContract): boolean {
    return shell.section_slots.some((s) => s.section_key === "inquiry_children");
}

function rightColumnInFirstViewport(input: OpportunityFirstViewportPlanInput): boolean {
    const geometry = readOpportunityDrawerGeometry(input.shell);
    return input.task_assist_enabled || geometry.summary_right_column_reserved;
}

/** Resolve the current Opportunity first-viewport plan from the frozen contract + minimal runtime flags. */
export function buildOpportunityFirstViewportPlan(input: OpportunityFirstViewportPlanInput): OpportunityFirstViewportPlan {
    const viewport_slots: OpportunityDrawerFirstPaintViewportSlot[] = [
        ...OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_VIEWPORT_SLOTS,
    ];
    const dependencies: OpportunityDrawerFirstPaintDependencyKey[] = [
        ...OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES,
    ];

    if (input.queue_definition_present) {
        viewport_slots.push("lifecycle_rail");
        if (!dependencies.includes("queue_definition")) {
            dependencies.push("queue_definition");
        }
    }

    if (rightColumnInFirstViewport(input)) {
        viewport_slots.push("tasks_summary", "reminders_summary");
    } else {
        const drop = new Set<OpportunityDrawerFirstPaintDependencyKey>(["tasks_preview", "scheduled_sends"]);
        for (let i = dependencies.length - 1; i >= 0; i--) {
            if (drop.has(dependencies[i]!)) dependencies.splice(i, 1);
        }
    }

    if (inquiryChildrenInFirstViewport(input.shell)) {
        viewport_slots.push("inquiry_children");
    } else {
        // No children in view → drop both the children list and their scheduling projection.
        for (const key of ["inquiry_children", "scheduling_projection"] as const) {
            const idx = dependencies.indexOf(key);
            if (idx >= 0) dependencies.splice(idx, 1);
        }
    }

    return { viewport_slots, dependencies };
}

/** Skip server fetch when visible record already satisfies the dependency. */
export function opportunityFirstPaintDependencySatisfiedFromRecord(
    key: OpportunityDrawerFirstPaintDependencyKey,
    record: Record<string, unknown>
): boolean {
    if (key === "record_visible") return true;
    // Metadata may warm Tour *display*, but never satisfies authoritative tour_bookings.
    // Emptying bookings when metadata has tour_date/time left Current Work stuck on Schedule Tour.
    if (key === "tour_bookings") return false;
    if (key === "inquiry_children") {
        return Array.isArray(record._inquiry_children);
    }
    if (key === "tasks_preview") {
        const raw = record._inquiry_summary_tasks;
        return raw != null && typeof raw === "object" && (raw as { state?: unknown }).state === "loaded";
    }
    return false;
}

/** Always fetch active tour_bookings — command eligibility depends on authoritative rows. */
export function opportunityTourBookingsFetchRequired(_record: Record<string, unknown>): boolean {
    return true;
}

export type TourSlotDisplaySource = "metadata" | "bookings" | "none";

export function resolveTourSlotDisplaySource(
    record: Record<string, unknown>,
    tourBookings: unknown[] | null | undefined
): TourSlotDisplaySource {
    if (Array.isArray(tourBookings) && tourBookings.length > 0) return "bookings";
    if (opportunityInquiryTourDisplayFromPrimaryMetadata(record)) return "metadata";
    return "none";
}
