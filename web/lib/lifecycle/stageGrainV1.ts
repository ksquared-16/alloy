/**
 * Stage grain — the entity type a single queue row represents.
 * Stored in lifecycle_builder_v1 stage JSON.
 *
 * Grain determines: queue row subject, count unit, focus panel context, available actions.
 */

export type StageGrain = "family" | "child" | "person" | "account" | "work_item";

export type StageSubjectResolutionStrategy =
    | "single_anchor"   // First/only child — error if multiple
    | "ask_operator"    // Prompt "which children?" before acting
    | "all_eligible"    // Apply to all eligible automatically
    | "operator_select"; // Multi-select UI before dispatch

export type StagePurpose =
    | "intake"
    | "qualification"
    | "tour"
    | "waitlist"
    | "enrollment"
    | "active"
    | "closed"
    | "custom";

/** Dual-grain Work View count presentation — family vs child buckets only. */
export type WorkViewGrainBucket = "family" | "child";

export const GRAIN_LABELS: Record<StageGrain, string> = {
    family: "Family",
    child: "Child",
    person: "Person",
    account: "Account",
    work_item: "Work Item",
};

export const GRAIN_DESCRIPTIONS: Record<StageGrain, string> = {
    family: "One queue row per opportunity (family case)",
    child: "One queue row per enrollment track (child)",
    person: "One queue row per person record",
    account: "One queue row per customer account",
    work_item: "One queue row per task or obligation",
};

export const PURPOSE_LABELS: Record<StagePurpose, string> = {
    intake: "Intake",
    qualification: "Qualification",
    tour: "Tour",
    waitlist: "Waitlist",
    enrollment: "Enrollment",
    active: "Active / Ongoing",
    closed: "Closed",
    custom: "Custom",
};

export const SUBJECT_RESOLUTION_LABELS: Record<StageSubjectResolutionStrategy, string> = {
    single_anchor: "Always use the single child in context",
    ask_operator: "Ask me which children",
    all_eligible: "Apply to every eligible child automatically",
    operator_select: "Let me select from a list",
};

export function parseStageGrain(raw: unknown): StageGrain | undefined {
    if (raw === "family" || raw === "child" || raw === "person" || raw === "account" || raw === "work_item") {
        return raw;
    }
    return undefined;
}

export function parseStagePurpose(raw: unknown): StagePurpose | undefined {
    const valid: StagePurpose[] = ["intake", "qualification", "tour", "waitlist", "enrollment", "active", "closed", "custom"];
    if (typeof raw === "string" && (valid as string[]).includes(raw)) return raw as StagePurpose;
    return undefined;
}

export function parseSubjectResolutionStrategy(raw: unknown): StageSubjectResolutionStrategy | undefined {
    const valid: StageSubjectResolutionStrategy[] = ["single_anchor", "ask_operator", "all_eligible", "operator_select"];
    if (typeof raw === "string" && (valid as string[]).includes(raw)) return raw as StageSubjectResolutionStrategy;
    return undefined;
}

// ── Work View grain consistency ───────────────────────────────────────────────

/**
 * Stage keys a Work View's filters reference (via the `opportunity_stage` predicate). A Work View is
 * a filter predicate, not a container of stages — so its grain must be derived from ONLY the stages it
 * actually scopes to, not from every stage in the process. Empty result = the view spans all stages.
 */
export function stageKeysReferencedByWorkView(
    filters: ReadonlyArray<{ field_key?: string; operator?: string; value?: unknown }> | null | undefined
): string[] {
    const keys = new Set<string>();
    for (const f of filters ?? []) {
        if (f?.field_key !== "opportunity_stage") continue;
        if (typeof f.value === "string" && f.value.trim()) keys.add(f.value.trim());
        else if (Array.isArray(f.value)) {
            for (const v of f.value) if (typeof v === "string" && v.trim()) keys.add(v.trim());
        }
    }
    return [...keys];
}

/**
 * Grains of the stages a Work View actually includes. Scopes the mixed-grain check to the view's
 * filtered stages so a single-grain view (e.g. New Leads → stage `lead`) is not flagged mixed merely
 * because the process also has child-grain stages.
 *
 * When the view references no specific stage, returns `[]` — the view is predicate-scoped at runtime
 * (e.g. "All Leads" by status) and must not inherit every stage grain in the process. Mixed-grain
 * is only enforced when the operator explicitly scopes the view to stages with different row types.
 */
export function resolveWorkViewStageGrains(
    filters: ReadonlyArray<{ field_key?: string; operator?: string; value?: unknown }> | null | undefined,
    stageGrainByKey: Record<string, StageGrain | undefined>
): (StageGrain | undefined)[] {
    const keys = stageKeysReferencedByWorkView(filters);
    if (keys.length === 0) return [];
    return keys.map((k) => stageGrainByKey[k]);
}

/**
 * Validates that all defined stage grains in a flat Work View are identical.
 * A flat Work View cannot mix grains — each row type produces a different
 * queue entry shape. Mixed-grain views should be split or use grouped lanes.
 */
/** Count-aware grain unit for Work View row breakdowns (`1 Family`, `2 Children`). */
export function grainCountUnitLabel(grain: WorkViewGrainBucket, count: number): string {
    const n = Math.max(0, Math.floor(count));
    if (grain === "family") return n === 1 ? "Family" : "Families";
    return n === 1 ? "Child" : "Children";
}

export function validateWorkViewGrainConsistency(stageGrains: (StageGrain | undefined)[]): {
    valid: boolean;
    message?: string;
} {
    const defined = stageGrains.filter((g): g is StageGrain => g !== undefined);
    if (defined.length <= 1) return { valid: true };
    const unique = new Set(defined);
    if (unique.size === 1) return { valid: true };
    return {
        valid: false,
        message:
            "This Work View includes stages with different row types. A single flat Work View can only render one queue row shape at a time — split into separate Work Views (one per row type), or configure grouped lanes in Stage Context so family and child records present as one grouped row.",
    };
}
