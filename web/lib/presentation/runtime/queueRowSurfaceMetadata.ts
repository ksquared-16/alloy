/**
 * Queue Row Surface — presentation metadata persisted alongside layout config.
 *
 * Stored in entity_layouts doc.metadata.queueRowSurface. The layout columns +
 * variants live in metadata.queue_record_layout (QueueRecordLayoutConfigV3).
 */

import type { QueueRecordLayoutConfigV3, QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import { defaultEnrollmentQueueRowLayoutWithVariantsV1 } from "@/lib/layout/queueRecordLayoutDefaults";
import { nextQueueRecordBlockId } from "@/lib/layout/queueRecordLayoutIds";

export type QueueRowSubjectFocusOption = "household" | "active_child" | "placement_candidate_child" | "opportunity";

export type QueueRowSurfaceEnvelope = {
    /** Editable operator-facing surface name (e.g. "Enrollment Queue Row"). */
    name: string;
    /** Lifecycle catalog id (`departmentId:processId`). */
    catalogId: string;
    /** Process key from lifecycle catalog. */
    processKey: string;
    /** Full queue row layout including Default columns + variants. */
    layout: QueueRecordLayoutConfigV3;
};

export const STARTER_QUEUE_ROW_VARIANT_LABELS = ["Default", "Tour", "Waitlist", "Enrolling"] as const;

export function normalizeQueueRowSurfaceEnvelope(raw: unknown): QueueRowSurfaceEnvelope | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const catalogId = typeof o.catalogId === "string" ? o.catalogId.trim() : "";
    const processKey = typeof o.processKey === "string" ? o.processKey.trim() : "";
    const layout = o.layout as QueueRecordLayoutConfigV3 | undefined;
    if (!catalogId || !processKey || !layout || layout.variant !== "operational-row" || !Array.isArray(layout.columns)) {
        return null;
    }
    return {
        name: name || "Queue Row",
        catalogId,
        processKey,
        layout,
    };
}

export function buildDefaultQueueRowSurfaceEnvelope(args: {
    catalogId: string;
    processKey: string;
    processName: string;
}): QueueRowSurfaceEnvelope {
    return {
        name: `${args.processName.trim() || "Process"} Queue Row`,
        catalogId: args.catalogId,
        processKey: args.processKey,
        layout: defaultEnrollmentQueueRowLayoutWithVariantsV1(),
    };
}

/** Ensure Default variant semantics: top-level columns are Default; variants array holds named variants. */
export function ensureDefaultVariantStructure(layout: QueueRecordLayoutConfigV3): QueueRecordLayoutConfigV3 {
    const variants = layout.variants ?? [];
    return { ...layout, variants };
}

export function createQueueRowVariant(args: {
    label: string;
    priority: number;
    appliesWhen?: QueueRowVariant["appliesWhen"];
    subjectFocus?: QueueRowVariant["subjectFocus"];
    columns?: QueueRowVariant["columns"];
    seedFrom?: QueueRecordLayoutConfigV3;
}): QueueRowVariant {
    const seed = args.seedFrom ?? defaultEnrollmentQueueRowLayoutWithVariantsV1();
    return {
        id: nextQueueRecordBlockId("variant"),
        label: args.label.trim() || "Variant",
        priority: args.priority,
        appliesWhen: args.appliesWhen,
        subjectFocus: args.subjectFocus,
        columns: args.columns ?? structuredClone(seed.columns),
        fixedControls: structuredClone(seed.fixedControls),
    };
}

export function readQueueRowSurfaceFromDocMetadata(
    metadata: Record<string, unknown> | undefined,
): QueueRowSurfaceEnvelope | null {
    const direct = normalizeQueueRowSurfaceEnvelope(metadata?.queueRowSurface);
    if (direct) return direct;

    const legacyLayout = metadata?.queue_record_layout as QueueRecordLayoutConfigV3 | undefined;
    if (!legacyLayout || legacyLayout.variant !== "operational-row") return null;

    return {
        name: "Queue Row",
        catalogId: "",
        processKey: "",
        layout: legacyLayout,
    };
}
