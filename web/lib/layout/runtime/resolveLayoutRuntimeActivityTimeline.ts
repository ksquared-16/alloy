/**
 * Layout runtime Activity Timeline — shared resolver for all drawer surfaces.
 *
 * Data sources (today):
 * - `_activity_timeline_events` when present (workflow_events-shaped rows)
 * - VM/layout-record preview fields via lead/person/child preview resolvers
 * - `_related_activity_timeline_events` when includeRelatedRecords is enabled
 */

import { formatActivityTimelineEvent } from "@/lib/admin/activityTimelineFormat";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import {
    defaultActivityTimelineConfigForSurface,
    readLayoutEditorActivityTimelineConfig,
    resolveActivityTimelineDirection,
    type ActivityTimelineEventType,
    type ActivityTimelineRelatedScope,
    type ActivityTimelineSurfaceKey,
    type LayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";
import { resolveChildActivityPreview } from "@/lib/layout/runtime/resolveChildActivityPreview";
import { resolveLeadActivityPreview, type LeadActivityPreviewEntry } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolvePersonActivityPreview, type PersonActivityPreviewEntry } from "@/lib/layout/runtime/resolvePersonActivityPreview";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";

export type ActivityTimelineEntry = {
    id: string;
    eventType: ActivityTimelineEventType;
    title: string;
    detail: string | null;
    actorLabel: string | null;
    at: string | null;
    atSortKey: number;
    source: "direct" | "related";
    relatedScope?: ActivityTimelineRelatedScope;
};

type RawActivityEventRow = {
    id?: string;
    occurred_at?: string | null;
    event_type?: string | null;
    payload?: Record<string, unknown> | null;
};

const PREVIEW_KIND_TO_EVENT_TYPE: Record<string, ActivityTimelineEventType> = {
    note: "notes",
    communication: "communications",
    task: "tasks_work",
    activity: "activity",
    created: "created",
    updated: "updated",
};

const WORKFLOW_EVENT_TYPE_TO_CATEGORY: Record<string, ActivityTimelineEventType> = {
    opportunity_status_changed: "status_change",
    entity_status_changed: "status_change",
    child_lifecycle_status_changed: "lifecycle",
    form_submitted: "forms_documents",
    form_signed: "forms_documents",
    form_document_generated: "forms_documents",
    intake_case_created: "forms_documents",
    intake_case_operationalized: "forms_documents",
    intake_case_review_required: "forms_documents",
    intake_case_linked: "forms_documents",
    message_received: "communications",
    message_sent: "communications",
    message_queued: "communications",
    message_delivered: "communications",
    note_added: "notes",
    action_executed: "tasks_work",
    stage_work_outcome_recorded: "tasks_work",
    opportunity_enrollment_packet_created: "forms_documents",
    opportunity_enrollment_packet_opened: "forms_documents",
    opportunity_enrollment_packet_step_completed: "forms_documents",
    opportunity_enrollment_packet_completed: "forms_documents",
    opportunity_enrollment_packet_sent: "forms_documents",
    opportunity_enrollment_packet_submitted_for_review: "forms_documents",
    opportunity_enrollment_packet_review_decision: "forms_documents",
    opportunity_waitlist_manual_adjustment_created: "lifecycle",
    opportunity_waitlist_manual_adjustment_updated: "lifecycle",
    opportunity_waitlist_manual_adjustment_released: "lifecycle",
    tour_invitation_activated: "appointments_tours",
    tour_invitation_created: "appointments_tours",
    tour_booked: "appointments_tours",
    tour_confirmed: "appointments_tours",
    tour_booking_pending: "appointments_tours",
    tour_requested: "appointments_tours",
    tour_slot_selected: "appointments_tours",
    tour_rescheduled: "appointments_tours",
    tour_canceled: "appointments_tours",
    tour_cancelled: "appointments_tours",
    tour_invitation_declined: "appointments_tours",
    tour_completed: "appointments_tours",
    tour_no_show: "appointments_tours",
};

function parseSortKey(raw: unknown): number {
    if (raw == null) return 0;
    const text = String(raw).trim();
    if (!text) return 0;
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : 0;
}

function formatEventRow(
    row: RawActivityEventRow,
    surfaceKey: ActivityTimelineSurfaceKey,
    timeZone?: string | null,
): Pick<ActivityTimelineEntry, "title" | "detail" | "actorLabel" | "at" | "atSortKey" | "eventType"> {
    const payload =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? row.payload
            : {};
    const formatted =
        surfaceKey === "opportunity_drawer"
            ? formatOpportunityActivityTimelineEvent({ event_type: row.event_type ?? null, payload })
            : formatActivityTimelineEvent({ event_type: row.event_type ?? null, payload });
    const eventTypeKey = String(row.event_type ?? "").trim().toLowerCase();
    const eventType = WORKFLOW_EVENT_TYPE_TO_CATEGORY[eventTypeKey] ?? "activity";
    const occurredAt = row.occurred_at ?? null;
    // Format once with the operator display timezone. Leave raw ISO when TZ is unknown so
    // UI leaves can format through the canonical helper without double-converting.
    const atText = occurredAt
        ? (
            timeZone
                ? formatActivityTimestamp(String(occurredAt), { timeZone }) || String(occurredAt)
                : String(occurredAt)
        )
        : null;
    return {
        title: formatted.title,
        detail: formatted.detail,
        actorLabel: formatted.actorLabel || null,
        at: atText,
        atSortKey: parseSortKey(occurredAt),
        eventType,
    };
}

function previewEntryToTimelineEntry(
    entry: LeadActivityPreviewEntry | PersonActivityPreviewEntry,
    index: number,
    source: "direct" | "related",
    relatedScope?: ActivityTimelineRelatedScope,
): ActivityTimelineEntry {
    const atSortKey =
        "atSortKey" in entry && typeof entry.atSortKey === "number"
            ? entry.atSortKey
            : parseSortKey(entry.at);
    return {
        id: `preview-${source}-${relatedScope ?? "direct"}-${entry.kind}-${index}`,
        eventType: PREVIEW_KIND_TO_EVENT_TYPE[entry.kind] ?? "activity",
        title: entry.label,
        detail: entry.detail,
        actorLabel: null,
        at: entry.at,
        atSortKey,
        source,
        ...(relatedScope ? { relatedScope } : {}),
    };
}

function readRawEventRows(record: ProofRuntimeRecord): RawActivityEventRow[] {
    const raw = record._activity_timeline_events;
    if (!Array.isArray(raw)) return [];
    return raw.filter((row): row is RawActivityEventRow => Boolean(row) && typeof row === "object");
}

function readRelatedEventRows(
    record: ProofRuntimeRecord,
    scope: ActivityTimelineRelatedScope,
): RawActivityEventRow[] {
    const bag = record._related_activity_timeline_events;
    if (!bag || typeof bag !== "object") return [];
    const scoped = (bag as Record<string, unknown>)[scope];
    if (!Array.isArray(scoped)) return [];
    return scoped.filter((row): row is RawActivityEventRow => Boolean(row) && typeof row === "object");
}

function resolvePreviewEntries(
    record: ProofRuntimeRecord,
    surfaceKey: ActivityTimelineSurfaceKey,
): Array<LeadActivityPreviewEntry | PersonActivityPreviewEntry> {
    if (surfaceKey === "child_drawer") return resolveChildActivityPreview(record);
    if (surfaceKey === "person_drawer") return resolvePersonActivityPreview(record);
    return resolveLeadActivityPreview(record);
}

function eventTypeAllowed(eventType: ActivityTimelineEventType, allowed: Set<ActivityTimelineEventType>): boolean {
    return allowed.has(eventType);
}

export function sortActivityTimelineEntries(
    entries: ActivityTimelineEntry[],
    config: LayoutEditorActivityTimelineConfig,
): ActivityTimelineEntry[] {
    const direction = resolveActivityTimelineDirection(config);
    const sorted = [...entries].sort((a, b) => {
        const cmp = a.atSortKey - b.atSortKey;
        if (cmp !== 0) return direction === "oldest_first" ? cmp : -cmp;
        return direction === "oldest_first" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });
    return sorted.slice(0, config.maxItems);
}

export function resolveLayoutRuntimeActivityTimeline(input: {
    record: ProofRuntimeRecord;
    surfaceKey: ActivityTimelineSurfaceKey;
    config?: LayoutEditorActivityTimelineConfig;
    itemMetadata?: Record<string, unknown>;
    /** Operator/org display timezone (user → org → UTC). When set, formats `at` once. */
    timeZone?: string | null;
}): ActivityTimelineEntry[] {
    const config =
        input.config
        ?? readLayoutEditorActivityTimelineConfig(input.itemMetadata, input.surfaceKey);
    const allowedEventTypes = new Set(config.eventTypes);
    const entries: ActivityTimelineEntry[] = [];
    const timeZone = input.timeZone ?? null;

    for (const [index, row] of readRawEventRows(input.record).entries()) {
        const formatted = formatEventRow(row, input.surfaceKey, timeZone);
        if (!eventTypeAllowed(formatted.eventType, allowedEventTypes)) continue;
        entries.push({
            id: String(row.id ?? `workflow-${index}`),
            ...formatted,
            source: "direct",
        });
    }

    if (entries.length === 0) {
        for (const [index, preview] of resolvePreviewEntries(input.record, input.surfaceKey).entries()) {
            const mapped = previewEntryToTimelineEntry(preview, index, "direct");
            if (!eventTypeAllowed(mapped.eventType, allowedEventTypes)) continue;
            entries.push(mapped);
        }
    }

    if (config.includeRelatedRecords) {
        for (const scope of config.relatedRecordScopes) {
            const relatedRows = readRelatedEventRows(input.record, scope);
            if (relatedRows.length > 0) {
                for (const [index, row] of relatedRows.entries()) {
                    const formatted = formatEventRow(row, input.surfaceKey, timeZone);
                    if (!eventTypeAllowed(formatted.eventType, allowedEventTypes)) continue;
                    entries.push({
                        id: String(row.id ?? `related-${scope}-${index}`),
                        ...formatted,
                        source: "related",
                        relatedScope: scope,
                    });
                }
                continue;
            }

            if (scope === "children" && input.surfaceKey === "person_drawer") {
                const childPreview = resolveChildActivityPreview(input.record);
                for (const [index, preview] of childPreview.entries()) {
                    const mapped = previewEntryToTimelineEntry(preview, index, "related", "children");
                    if (!eventTypeAllowed(mapped.eventType, allowedEventTypes)) continue;
                    entries.push(mapped);
                }
            }
        }
    }

    return sortActivityTimelineEntries(entries, config);
}

export function resolveActivityTimelineSurfaceKeyFromRecord(
    record: ProofRuntimeRecord,
    fallback: ActivityTimelineSurfaceKey = "opportunity_drawer",
): ActivityTimelineSurfaceKey {
    const explicit = record._layout_surface_key;
    if (explicit === "person_drawer" || explicit === "child_drawer" || explicit === "opportunity_drawer") {
        return explicit;
    }
    if (record._child_drawer === true || record.entity_type === "child") return "child_drawer";
    if (record._person_drawer === true || record.entity_type === "person") return "person_drawer";
    return fallback;
}

export { defaultActivityTimelineConfigForSurface };
