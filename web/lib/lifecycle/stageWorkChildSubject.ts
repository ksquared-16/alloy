/**
 * WORK AT A CHILD STAGE BELONGS TO THE CHILD.
 *
 * Business Process work is stored against the family Opportunity (`operational_tasks.entity_id`),
 * which is right for family stages and still right as the CONTAINER for child stages: the family's
 * surfaces list it. But its identity was the Opportunity alone — fingerprint, idempotency key and
 * subject fingerprint were all per family — so two siblings standing in the same child stage shared
 * one work item. Deployed QA: two children Offered, one "Get the family's answer"; accepting the first
 * child closed it and the second child had nowhere to record an answer.
 *
 * The child is now part of the work's identity whenever the work is created for a child subject. It
 * is stamped on the work's metadata, and every identity key gains a child segment, so siblings get
 * their own items and a family-level request never deduplicates onto a child's item (or the reverse).
 * Work created before this carries no child and keeps behaving as family work.
 */

export type StageWorkChildSubject = {
    /** `customer_members.id` — the durable child. */
    customerMemberId: string;
    /** `process_instances.id` — the child's journey, when known. */
    processInstanceId?: string | null;
};

export const STAGE_WORK_CHILD_METADATA_KEY = "bp_subject_customer_member_id" as const;
export const STAGE_WORK_CHILD_JOURNEY_METADATA_KEY = "bp_subject_process_instance_id" as const;

function trim(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** The child a work item belongs to, or null for family work (including all pre-existing work). */
export function childOfStageWork(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return trim((metadata as Record<string, unknown>)[STAGE_WORK_CHILD_METADATA_KEY]);
}

/** Metadata that records the child on a work item. Empty for family work. */
export function stageWorkChildMetadata(child: StageWorkChildSubject | null | undefined): Record<string, string> {
    const id = trim(child?.customerMemberId);
    if (!id) return {};
    const journey = trim(child?.processInstanceId);
    return {
        [STAGE_WORK_CHILD_METADATA_KEY]: id,
        ...(journey ? { [STAGE_WORK_CHILD_JOURNEY_METADATA_KEY]: journey } : {}),
    };
}

/** The identity segment a child adds to every work key. Empty for family work, so old keys are unchanged. */
export function stageWorkChildKeySegment(child: StageWorkChildSubject | string | null | undefined): string {
    const id = typeof child === "string" ? trim(child) : trim(child?.customerMemberId);
    return id ? `:child:${id}` : "";
}

/**
 * Does this work item belong to the requested owner? A child request matches only that child's work;
 * a family request matches only family work. Never a sibling's.
 */
export function stageWorkBelongsTo(metadata: unknown, childId: string | null | undefined): boolean {
    const owner = childOfStageWork(metadata);
    const wanted = trim(childId);
    return owner === wanted;
}
