/**
 * Universal lifecycle stages for configurable CRM statuses (`status_definitions.metadata.lifecycle_stage`).
 * Values are persisted in DB — this module only validates / reads; mapping is not hardcoded in app logic.
 */
export const OPPORTUNITY_LIFECYCLE_STAGES = [
    "intake",
    "qualification",
    "execution",
    "decision",
    "success",
    "failure",
] as const;

export type OpportunityLifecycleStage = (typeof OPPORTUNITY_LIFECYCLE_STAGES)[number];

const STAGE_SET = new Set<string>(OPPORTUNITY_LIFECYCLE_STAGES);

/** Read `metadata.lifecycle_stage` when it matches a known stage; otherwise null. */
export function parseLifecycleStageFromMetadata(
    metadata: Record<string, unknown> | null | undefined
): OpportunityLifecycleStage | null {
    if (metadata == null || typeof metadata !== "object") return null;
    const raw = metadata.lifecycle_stage;
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    return STAGE_SET.has(t) ? (t as OpportunityLifecycleStage) : null;
}
