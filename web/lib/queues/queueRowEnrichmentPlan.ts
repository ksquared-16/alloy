import type { QueueUiConfig, QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

export type QueueRowEnrichmentMode = "full" | "queue_preview" | "queue_list" | "queue_reveal" | "count_only";

/**
 * A plan with EVERY presentation fetch disabled. Used by grouped Work-View totals: counting only
 * needs the base-query operational fields (status/stage) the predicate evaluator reads — never
 * persons/customers/household/activity/tasks/comms. A count must not materialize presentation rows.
 */
export function countOnlyQueueRowEnrichmentPlan(): QueueRowEnrichmentPlan {
    return {
        enrichmentMode: "count_only",
        relationFetch: { persons: false, contacts: false, customers: false, customerMembers: false },
        batchFetch: {
            locations: false,
            tourBookings: false,
            ocmDesiredStart: false,
            openTasks: false,
            activityTimelineEvents: false,
        },
        attachCaseGrainRowContext: false,
        skippedEnrichment: [
            "persons",
            "contacts",
            "customers",
            "customer_members",
            "locations",
            "tour_bookings",
            "ocm_desired_start",
            "open_tasks",
            "activity_timeline_events",
            "queue_row_context_case_grain",
        ],
    };
}

export type QueueRowRelationFetchPlan = {
    persons: boolean;
    contacts: boolean;
    customers: boolean;
    customerMembers: boolean;
};

export type QueueRowBatchFetchPlan = {
    locations: boolean;
    tourBookings: boolean;
    ocmDesiredStart: boolean;
    openTasks: boolean;
    /** Recent workflow_events for compact activity_timeline on layout-runtime queue rows. */
    activityTimelineEvents: boolean;
};

export type QueueRowEnrichmentPlan = {
    enrichmentMode: QueueRowEnrichmentMode;
    relationFetch: QueueRowRelationFetchPlan;
    batchFetch: QueueRowBatchFetchPlan;
    /** When false, case-grain rows omit `_queue_row_context` (child/candidate grain still attach). */
    attachCaseGrainRowContext: boolean;
    skippedEnrichment: string[];
};

export type BuildQueueRowEnrichmentPlanInput = {
    ui: QueueUiConfig;
    enrichmentMode: QueueRowEnrichmentMode;
    /** Layout-runtime opportunity queue card (server flag). */
    layoutRuntimeQueueBody?: boolean;
    executableQueueKey?: string;
    skipOptionalEnrichmentFetches?: boolean;
};

function wantsField(fields: QueueUiRowPreviewField[], key: QueueUiRowPreviewField): boolean {
    return fields.includes(key);
}

function wantsContactFields(fields: QueueUiRowPreviewField[]): boolean {
    return (
        wantsField(fields, "primary_contact") ||
        wantsField(fields, "phone") ||
        wantsField(fields, "email")
    );
}

function wantsHouseholdFields(fields: QueueUiRowPreviewField[]): boolean {
    return wantsField(fields, "child_name") || wantsField(fields, "program") || wantsField(fields, "start_date");
}

function wantsLocationLabel(_fields: QueueUiRowPreviewField[], layoutRuntimeQueueBody: boolean): boolean {
    return layoutRuntimeQueueBody;
}

function wantsTasksBatch(input: BuildQueueRowEnrichmentPlanInput, fields: QueueUiRowPreviewField[]): boolean {
    if (input.enrichmentMode === "full") return true;
    const queueKey = String(input.executableQueueKey ?? "").trim().toLowerCase();
    if (queueKey === "needs_attention") return true;
    if (input.layoutRuntimeQueueBody) return true;
    return false;
}

/** Maps configured row preview + layout runtime needs → relational/batch fetch gates. */
export function buildQueueRowEnrichmentPlan(input: BuildQueueRowEnrichmentPlanInput): QueueRowEnrichmentPlan {
    // Count-only short-circuit: no presentation fetches regardless of configured fields or layout
    // runtime (a total must not enrich rows). Base-query operational fields carry the predicates.
    if (input.enrichmentMode === "count_only") return countOnlyQueueRowEnrichmentPlan();
    const fields = input.ui.row_preview.fields;
    const isCrm = input.ui.row_preview.variant === "crm_compact";
    const layoutRuntime = input.layoutRuntimeQueueBody === true;
    const skippedEnrichment: string[] = [];

    // Condensed reveal rail: the deployed CondensedQueueRow renders only from the compact
    // `_queue_row_context`, which reads the primary-contact line (persons/contacts), the household
    // children summary (customer_members + metadata inquiry-children), status/stage, and
    // attention/work summaries built from in-memory operational fields — NOT from locations,
    // activity-timeline, program-category lookups, or the open-tasks list (that feeds the stripped
    // `_inquiry_summary_tasks`; Current Work is sourced from the stage-work runtime attach instead).
    // So `layoutRuntime` must NOT blanket-enable those heavy fetches on `queue_reveal` — they are
    // pure waste on the wire (all measured stripped or unread). Predicates/counts read only base
    // columns, so nothing server-side breaks. Non-reveal layout-runtime paths are unchanged.
    const isCondensedReveal = input.enrichmentMode === "queue_reveal" && layoutRuntime;
    const layoutRuntimeForFetch = layoutRuntime && !isCondensedReveal;
    const executableKey = String(input.executableQueueKey ?? "").trim().toLowerCase();

    const wantsContact = wantsContactFields(fields);
    const wantsHousehold = wantsHouseholdFields(fields);

    const relationFetch: QueueRowRelationFetchPlan = {
        // Contact line + household children ARE shown on the condensed rail → keep these on reveal.
        persons: isCrm || wantsContact || layoutRuntime,
        contacts: isCrm || wantsContact || layoutRuntime,
        customers: isCrm || wantsContact || wantsHousehold || layoutRuntime,
        customerMembers: (isCrm && wantsHousehold) || layoutRuntime,
    };

    if (!relationFetch.persons) skippedEnrichment.push("persons");
    if (!relationFetch.contacts) skippedEnrichment.push("contacts");
    if (!relationFetch.customers) skippedEnrichment.push("customers");
    if (!relationFetch.customerMembers) skippedEnrichment.push("customer_members");

    const batchFetch: QueueRowBatchFetchPlan = {
        // Location label is unread by the compact row (placement comes from inquiry-child raw).
        locations: wantsLocationLabel(fields, layoutRuntimeForFetch),
        // Configured visible fields stay on reveal — skipOptional only drops unconfigured extras.
        tourBookings: wantsField(fields, "tour_date"),
        ocmDesiredStart:
            wantsField(fields, "start_date") ||
            wantsField(fields, "program") ||
            wantsHousehold ||
            (layoutRuntimeForFetch && relationFetch.customerMembers),
        // Open-tasks list feeds the stripped `_inquiry_summary_tasks`; Current Work is sourced from the
        // stage-work runtime attach. Keep it only for needs_attention (which shows task counts) + full.
        openTasks:
            input.enrichmentMode === "full" ||
            executableKey === "needs_attention" ||
            (layoutRuntimeForFetch && wantsTasksBatch(input, fields)),
        // Activity timeline feeds the stripped `_activity_timeline_events` — never on the condensed rail.
        activityTimelineEvents: layoutRuntimeForFetch || input.enrichmentMode === "full",
    };

    if (!batchFetch.locations) skippedEnrichment.push("locations");
    if (!batchFetch.tourBookings) skippedEnrichment.push("tour_bookings");
    if (!batchFetch.ocmDesiredStart) skippedEnrichment.push("ocm_desired_start");
    if (!batchFetch.openTasks) skippedEnrichment.push("open_tasks");
    if (!batchFetch.activityTimelineEvents) skippedEnrichment.push("activity_timeline_events");

    // Layout-runtime rows read queue_row.* from context; legacy CRM rows use flat fields only.
    const attachCaseGrainRowContext = input.enrichmentMode !== "queue_reveal" || layoutRuntime;

    if (!attachCaseGrainRowContext) {
        skippedEnrichment.push("queue_row_context_case_grain");
    }

    return {
        enrichmentMode: input.enrichmentMode,
        relationFetch,
        batchFetch,
        attachCaseGrainRowContext,
        skippedEnrichment,
    };
}

export function enrichmentQueriesRunFromPlan(plan: QueueRowEnrichmentPlan): string[] {
    const queries: string[] = ["status_definitions"];
    if (plan.relationFetch.persons) queries.push("persons");
    if (plan.relationFetch.contacts) queries.push("contacts");
    if (plan.relationFetch.customers) queries.push("customers");
    if (plan.relationFetch.customerMembers) queries.push("customer_members");
    if (plan.batchFetch.locations) queries.push("locations");
    if (plan.batchFetch.tourBookings) queries.push("tour_bookings");
    if (plan.batchFetch.ocmDesiredStart) queries.push("ocm_desired_start");
    if (plan.batchFetch.openTasks) queries.push("open_tasks");
    if (plan.batchFetch.activityTimelineEvents) queries.push("activity_timeline_events");
    if (plan.attachCaseGrainRowContext) queries.push("queue_row_context");
    return queries;
}

/** @deprecated Prefer buildQueueRowEnrichmentPlan — kept for narrow relation-only call sites. */
export function queueListRelationFetchPlanFromUi(
    ui: QueueUiConfig,
    layoutRuntimeQueueBody = false,
): QueueRowRelationFetchPlan {
    return buildQueueRowEnrichmentPlan({
        ui,
        enrichmentMode: "queue_list",
        layoutRuntimeQueueBody,
    }).relationFetch;
}
