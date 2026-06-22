import type { QueueUiConfig, QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

export type QueueRowEnrichmentMode = "full" | "queue_preview" | "queue_list" | "queue_reveal";

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
    return wantsField(fields, "child_name") || wantsField(fields, "program") || wantsField(fields, "desired_start_date");
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
    const fields = input.ui.row_preview.fields;
    const isCrm = input.ui.row_preview.variant === "crm_compact";
    const layoutRuntime = input.layoutRuntimeQueueBody === true;
    const skippedEnrichment: string[] = [];

    const wantsContact = wantsContactFields(fields);
    const wantsHousehold = wantsHouseholdFields(fields);

    const relationFetch: QueueRowRelationFetchPlan = {
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
        locations: wantsLocationLabel(fields, layoutRuntime),
        // Configured visible fields stay on reveal — skipOptional only drops unconfigured extras.
        tourBookings: wantsField(fields, "tour_date"),
        ocmDesiredStart:
            wantsField(fields, "desired_start_date") ||
            wantsField(fields, "program") ||
            wantsHousehold ||
            (layoutRuntime && relationFetch.customerMembers),
        openTasks: wantsTasksBatch(input, fields),
        activityTimelineEvents: layoutRuntime || input.enrichmentMode === "full",
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
