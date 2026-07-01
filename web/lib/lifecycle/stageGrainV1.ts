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
