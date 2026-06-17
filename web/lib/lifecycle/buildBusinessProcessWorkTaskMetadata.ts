/**
 * Canonical metadata stamped on Business Process–generated operational_tasks rows.
 */

export type BuildBusinessProcessWorkTaskMetadataInput = {
    workIntentKey: string;
    operatingPlanTemplateKey: string;
    lifecycleStageKey: string;
    departmentId?: string | null;
    attemptCount?: number;
    bpRuntimeFingerprint?: string | null;
    extra?: Record<string, unknown> | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Standard BP runtime metadata for stage work instances. */
export function buildBusinessProcessWorkTaskMetadata(
    input: BuildBusinessProcessWorkTaskMetadataInput,
): Record<string, unknown> {
    const workIntentKey = trimOrNull(input.workIntentKey);
    const operatingPlanTemplateKey = trimOrNull(input.operatingPlanTemplateKey);
    const lifecycleStageKey = trimOrNull(input.lifecycleStageKey);
    if (!workIntentKey || !operatingPlanTemplateKey || !lifecycleStageKey) {
        throw new Error("BP work metadata requires workIntentKey, operatingPlanTemplateKey, and lifecycleStageKey");
    }

    const departmentId = trimOrNull(input.departmentId ?? null);
    const bpRuntimeFingerprint = trimOrNull(input.bpRuntimeFingerprint ?? null);
    const attemptCount =
        typeof input.attemptCount === "number" && Number.isFinite(input.attemptCount) && input.attemptCount >= 0
            ? Math.floor(input.attemptCount)
            : 0;

    return {
        ...(input.extra && typeof input.extra === "object" && !Array.isArray(input.extra) ? input.extra : {}),
        work_intent_key: workIntentKey,
        operating_plan_template_key: operatingPlanTemplateKey,
        lifecycle_stage_key: lifecycleStageKey,
        lifecycle_provenance: "lifecycle_template",
        operating_plan_template: true,
        attempt_count: attemptCount,
        ...(departmentId ? { department_id: departmentId } : {}),
        ...(bpRuntimeFingerprint ? { bp_runtime_fingerprint: bpRuntimeFingerprint } : {}),
    };
}
