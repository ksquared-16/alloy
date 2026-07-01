/**
 * Layout Contract V1 — queue layout variant discriminator (Phase 0).
 *
 * A single entity type / lifecycle may publish multiple queue layout variants.
 * Resolution selects the most specific published doc whose context keys match
 * the active lane request. See layout_contract_v1.md §3.4.
 *
 * These keys are selectors only — they do not encode cohort membership or routing.
 */

/** Stable grain identifiers for queue row layout variants. */
export const QUEUE_LAYOUT_GRAINS = ["case", "child", "candidate", "lifecycle", "stage", "work_unit"] as const;
export type QueueLayoutGrain = (typeof QUEUE_LAYOUT_GRAINS)[number];

/** Known queue_type values for enrollment (extensible via string). */
export const QUEUE_LAYOUT_QUEUE_TYPES = ["pipeline", "waitlist", "needs_attention", "standard"] as const;
export type QueueLayoutQueueType = (typeof QUEUE_LAYOUT_QUEUE_TYPES)[number];

/**
 * Request context passed at resolve time (from work-unit lane, QueueRowContext, or API).
 * All fields optional; omitted keys are not used for matching.
 */
export type QueueLayoutContextRequest = {
    lifecycle_key?: string;
    stage_key?: string;
    work_unit_key?: string;
    queue_type?: string;
    grain?: string;
};

/** Stored on entity_layouts.metadata.queue_context or doc.metadata.queue_context. */
export type QueueLayoutContextDescriptor = QueueLayoutContextRequest;

export function isQueueLayoutContextEmpty(ctx: QueueLayoutContextDescriptor | null | undefined): boolean {
    if (!ctx) return true;
    return (
        ctx.lifecycle_key == null &&
        ctx.stage_key == null &&
        ctx.work_unit_key == null &&
        ctx.queue_type == null &&
        ctx.grain == null
    );
}

/** Extract queue_context from a persisted layout record or doc metadata. */
export function extractQueueContextFromRecord(record: {
    metadata?: Record<string, unknown> | null;
    doc?: { metadata?: Record<string, unknown> };
}): QueueLayoutContextDescriptor {
    const raw =
        (record.metadata?.queue_context as QueueLayoutContextDescriptor | undefined) ??
        (record.doc?.metadata?.queue_context as QueueLayoutContextDescriptor | undefined);
    if (!raw || typeof raw !== "object") return {};
    return {
        lifecycle_key: typeof raw.lifecycle_key === "string" ? raw.lifecycle_key : undefined,
        stage_key: typeof raw.stage_key === "string" ? raw.stage_key : undefined,
        work_unit_key: typeof raw.work_unit_key === "string" ? raw.work_unit_key : undefined,
        queue_type: typeof raw.queue_type === "string" ? raw.queue_type : undefined,
        grain: typeof raw.grain === "string" ? raw.grain : undefined,
    };
}

/** True when every key defined on descriptor matches the request (subset match). */
export function queueContextDescriptorMatchesRequest(
    descriptor: QueueLayoutContextDescriptor,
    request: QueueLayoutContextRequest,
): boolean {
    const keys = ["lifecycle_key", "stage_key", "work_unit_key", "queue_type", "grain"] as const;
    for (const key of keys) {
        const expected = descriptor[key];
        if (expected == null || expected === "") continue;
        const actual = request[key];
        if (actual == null || actual === "" || actual !== expected) return false;
    }
    return true;
}
