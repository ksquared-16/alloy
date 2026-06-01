/**
 * Department overrides for lifecycle progression requirements (Settings + runtime merge).
 * Platform defaults live in lifecycleProgressionRequirementsCatalog; this module merges overrides.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    platformLifecycleProgressionRequirementsForStage,
    type LifecycleProgressionRequirementRow,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export const LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY = "lifecycle_progression_requirements_v1";

export type LifecycleProgressionRequirementsOverrideV1 = {
    version: 1;
    stages: Partial<
        Record<
            LifecycleOperatorStage,
            {
                required_labels?: string[];
                recommended_labels?: string[];
            }
        >
    >;
};

export type LifecycleRequirementsSource = "platform" | "department";

/** Labels operators cannot toggle yet (runtime or policy). */
export const LIFECYCLE_LOCKED_LABEL_REASONS: Partial<Record<LifecycleOperatorStage, Record<string, string>>> = {
    tour: {
        "Tour Date and Time": "Managed by the platform for now.",
    },
    enrolled: {
        "Enrollment Date": "Managed by the platform for now.",
    },
};

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (
        s === "lead" ||
        s === "qualification" ||
        s === "tour" ||
        s === "waitlist" ||
        s === "enrollment" ||
        s === "enrolled"
    );
}

function normalizeLabelList(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out;
}

export function parseLifecycleProgressionRequirementsOverride(
    metadata: Record<string, unknown> | null | undefined
): LifecycleProgressionRequirementsOverrideV1 | null {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata[LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY];
    if (!root || typeof root !== "object" || Array.isArray(root)) return null;
    const version = (root as { version?: unknown }).version;
    if (version !== 1) return null;
    const stagesRaw = (root as { stages?: unknown }).stages;
    if (!stagesRaw || typeof stagesRaw !== "object" || Array.isArray(stagesRaw)) return null;

    const stages: LifecycleProgressionRequirementsOverrideV1["stages"] = {};
    for (const [key, value] of Object.entries(stagesRaw as Record<string, unknown>)) {
        if (!isStageKey(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
        const required_labels = normalizeLabelList((value as { required_labels?: unknown }).required_labels);
        const recommended_labels = normalizeLabelList((value as { recommended_labels?: unknown }).recommended_labels);
        if (required_labels === null && recommended_labels === null) continue;
        stages[key] = {
            ...(required_labels !== null ? { required_labels } : {}),
            ...(recommended_labels !== null ? { recommended_labels } : {}),
        };
    }
    if (Object.keys(stages).length === 0) return null;
    return { version: 1, stages };
}

/** All labels that may appear on a stage (platform required + recommended). */
export function lifecycleStageLabelPalette(stage: LifecycleOperatorStage): string[] {
    const platform = platformLifecycleProgressionRequirementsForStage(stage);
    const labels = [
        ...platform.required.map((r) => r.label),
        ...platform.recommended.map((r) => r.label),
    ];
    const locked = LIFECYCLE_LOCKED_LABEL_REASONS[stage];
    if (locked) {
        for (const label of Object.keys(locked)) {
            if (!labels.includes(label)) labels.push(label);
        }
    }
    return labels;
}

function rowsFromLabels(labels: string[], kind: "required" | "recommended"): LifecycleProgressionRequirementRow[] {
    return labels.map((label) => ({ label, kind }));
}

function validateLabelsForStage(stage: LifecycleOperatorStage, labels: string[]): string[] | null {
    const palette = new Set(lifecycleStageLabelPalette(stage));
    const out: string[] = [];
    for (const label of labels) {
        if (!palette.has(label)) return null;
        if (!out.includes(label)) out.push(label);
    }
    return out;
}

export function departmentHasStageOverride(
    override: LifecycleProgressionRequirementsOverrideV1 | null,
    stage: LifecycleOperatorStage
): boolean {
    return override?.stages?.[stage] !== undefined;
}

export function effectiveLifecycleProgressionRequirementsForStage(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null
): {
    required: LifecycleProgressionRequirementRow[];
    recommended: LifecycleProgressionRequirementRow[];
    source: LifecycleRequirementsSource;
} {
    const platform = platformLifecycleProgressionRequirementsForStage(stage);
    const override = parseLifecycleProgressionRequirementsOverride(departmentMetadata ?? null);
    const stageOverride = override?.stages?.[stage];
    if (!stageOverride) {
        return { required: platform.required, recommended: platform.recommended, source: "platform" };
    }

    const requiredLabels =
        stageOverride.required_labels ??
        platform.required.map((r) => r.label);
    const recommendedLabels =
        stageOverride.recommended_labels ??
        platform.recommended.map((r) => r.label);

    const requiredSet = new Set(requiredLabels);
    const recommendedFiltered = recommendedLabels.filter((l) => !requiredSet.has(l));

    return {
        required: rowsFromLabels([...requiredSet], "required"),
        recommended: rowsFromLabels(recommendedFiltered, "recommended"),
        source: "department",
    };
}

export function buildLifecycleRequirementsOverridePatch(input: {
    stage: LifecycleOperatorStage;
    required_labels: string[];
    recommended_labels: string[];
    existingMetadata: Record<string, unknown> | null;
}): Record<string, unknown> {
    const required = validateLabelsForStage(input.stage, input.required_labels);
    const recommended = validateLabelsForStage(input.stage, input.recommended_labels);
    if (!required || !recommended) {
        throw new Error("Invalid lifecycle requirement labels for this stage.");
    }
    const requiredSet = new Set(required);
    const recommendedDeduped = recommended.filter((l) => !requiredSet.has(l));

    const prev = parseLifecycleProgressionRequirementsOverride(input.existingMetadata) ?? {
        version: 1 as const,
        stages: {},
    };
    const stages = { ...prev.stages, [input.stage]: { required_labels: required, recommended_labels: recommendedDeduped } };

    return {
        [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
            version: 1,
            stages,
        },
    };
}

export function buildLifecycleRequirementsResetStagePatch(input: {
    stage: LifecycleOperatorStage;
    existingMetadata: Record<string, unknown> | null;
}): Record<string, unknown> | null {
    const prev = parseLifecycleProgressionRequirementsOverride(input.existingMetadata);
    if (!prev?.stages?.[input.stage]) return null;
    const stages = { ...prev.stages };
    delete stages[input.stage];
    if (Object.keys(stages).length === 0) {
        return { [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: null };
    }
    return {
        [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
            version: 1,
            stages,
        },
    };
}

export function lifecycleLockedLabelReason(
    stage: LifecycleOperatorStage,
    label: string
): string | null {
    return LIFECYCLE_LOCKED_LABEL_REASONS[stage]?.[label] ?? null;
}

export function departmentMetadataFromCompletionContext(
    related?: { department_metadata?: Record<string, unknown> | null } | null
): Record<string, unknown> | null {
    const md = related?.department_metadata;
    return md && typeof md === "object" && !Array.isArray(md) ? md : null;
}
