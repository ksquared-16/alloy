/**
 * Validate business process layout assignment writes.
 */

import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    isLayoutAssignmentSurfaceKey,
    layoutAssignmentSurfaceIdentity,
    type LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { isFocusPanelSummaryLayoutRecord } from "@/lib/layout/layoutAssignmentLayoutOptions";
import { resolveSurfaceLayoutKeyFromDoc } from "@/lib/layout/surfaceLayoutRegistry";
import { isWaitlistQueueLayoutDoc } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export type LayoutAssignmentValidationError = { field: string; message: string };

const KNOWN_PROCESS_KEYS = new Set<string>([ENROLLMENT_PROCESS_KEY]);

export function validateBusinessProcessLayoutAssignmentInput(input: {
    businessProcessKey: string;
    stageKey?: string | null;
    statusKey?: string | null;
    surfaceKey: string;
    layoutRecord?: EntityLayoutRecord | null;
}): { ok: true } | { ok: false; errors: LayoutAssignmentValidationError[] } {
    const errors: LayoutAssignmentValidationError[] = [];

    const processKey = input.businessProcessKey.trim();
    if (!processKey) {
        errors.push({ field: "business_process_key", message: "Business process is required." });
    } else if (!KNOWN_PROCESS_KEYS.has(processKey)) {
        errors.push({ field: "business_process_key", message: `Unknown business process: ${processKey}` });
    }

    if (!isLayoutAssignmentSurfaceKey(input.surfaceKey)) {
        errors.push({ field: "surface_key", message: `Unknown surface: ${input.surfaceKey}` });
        return errors.length ? { ok: false, errors } : { ok: true };
    }

    const stageKey = input.stageKey?.trim() || null;
    if (stageKey && !LIFECYCLE_STAGE_ORDER.includes(stageKey as (typeof LIFECYCLE_STAGE_ORDER)[number])) {
        errors.push({ field: "stage_key", message: `Stage "${stageKey}" is not valid for ${processKey}.` });
    }

    if (input.layoutRecord) {
        const identity = layoutAssignmentSurfaceIdentity(input.surfaceKey);
        const record = input.layoutRecord;
        if (record.status !== "published") {
            errors.push({ field: "entity_layout_id", message: "Assignment must reference a published layout." });
        }
        if (record.entityType !== identity.entityType || record.surface !== identity.surface) {
            errors.push({
                field: "entity_layout_id",
                message: `Layout surface mismatch: expected ${identity.entityType}/${identity.surface}.`,
            });
        }
        // The Focus Panel Summary shares `opportunities`/`drawer` with the legacy drawer, so
        // the identity checks above cannot tell them apart. It resolves by published variant,
        // never by an assigned id, so an assignment naming one saves and does nothing —
        // refuse it at the write rather than store configuration with no runtime effect.
        if (isFocusPanelSummaryLayoutRecord(record)) {
            errors.push({
                field: "entity_layout_id",
                message:
                    "The Focus Panel Summary is not an assignable drawer surface. It resolves by published variant — "
                    + "scope it by publishing a variant for this Business Process, stage or Work View.",
            });
        }
        const docSurface = resolveSurfaceLayoutKeyFromDoc(record.doc);
        if (docSurface && docSurface !== input.surfaceKey) {
            errors.push({
                field: "entity_layout_id",
                message: `Layout document surface "${docSurface}" does not match assignment surface.`,
            });
        }
        if (
            input.surfaceKey === "waitlist_queue_record"
            && record.surface === "queue"
            && !isWaitlistQueueLayoutDoc(record.doc)
        ) {
            errors.push({
                field: "entity_layout_id",
                message: "Waitlist queue slot requires a waitlist-capable queue layout.",
            });
        }
        if (
            input.surfaceKey === "queue_record"
            && record.surface === "queue"
            && isWaitlistQueueLayoutDoc(record.doc)
        ) {
            errors.push({
                field: "entity_layout_id",
                message: "Pipeline queue slot cannot use a waitlist-only queue layout.",
            });
        }
        if (
            (input.surfaceKey === "queue_record" || input.surfaceKey === "waitlist_queue_record")
            && record.surface === "queue"
        ) {
            const meta = record.doc.metadata as { queue_record_layout?: unknown } | undefined;
            const hasV3 = meta?.queue_record_layout != null;
            const waitlistDoc = input.surfaceKey === "waitlist_queue_record" && isWaitlistQueueLayoutDoc(record.doc);
            const pipelineDoc = input.surfaceKey === "queue_record" && !isWaitlistQueueLayoutDoc(record.doc);
            if (!hasV3 && !waitlistDoc && !pipelineDoc) {
                errors.push({
                    field: "entity_layout_id",
                    message: "Queue layout assignment must reference a layout with queue_record_layout metadata.",
                });
            }
        }
    }

    return errors.length ? { ok: false, errors } : { ok: true };
}

export function validateAssignmentSurfaceKey(surfaceKey: string): surfaceKey is LayoutAssignmentSurfaceKey {
    return isLayoutAssignmentSurfaceKey(surfaceKey);
}
