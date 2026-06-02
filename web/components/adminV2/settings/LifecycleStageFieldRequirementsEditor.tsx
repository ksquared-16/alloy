"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { LifecycleStageBootstrapFieldRequirements } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import { type LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    LIFECYCLE_REQUIREMENT_ENTITIES,
    fieldRulesHaveRuntimeGaps,
    lifecycleEntityLabel,
    type LifecycleRequirementEntityKey,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type FieldPaletteEntry = {
    rule_id: string;
    entity: LifecycleRequirementEntityKey;
    field_label: string;
    runtime_enforced: boolean;
    form_coverage_supported?: boolean;
    config_only?: boolean;
    field_source?: string;
};

type StageConfigPayload = {
    effective: {
        field_rules: LifecycleStageFieldRules;
        field_rules_source: string;
        required_labels: string[];
        recommended_labels: string[];
        source: string;
    };
    has_department_override: boolean;
    field_palette: FieldPaletteEntry[];
};

type LifecycleRequirementsApiResponse = {
    stages: Record<LifecycleOperatorStage, StageConfigPayload>;
    error?: string;
};

type FieldLevel = "off" | "recommended" | "required";

function fieldLevelFromRules(ruleId: string, rules: LifecycleStageFieldRules): FieldLevel {
    if (rules.required_rule_ids.includes(ruleId)) return "required";
    if (rules.recommended_rule_ids.includes(ruleId)) return "recommended";
    return "off";
}

function rulesFromFieldLevels(
    palette: FieldPaletteEntry[],
    levels: Record<string, FieldLevel>
): LifecycleStageFieldRules {
    const required_rule_ids: string[] = [];
    const recommended_rule_ids: string[] = [];
    for (const field of palette) {
        const level = levels[field.rule_id] ?? "off";
        if (level === "required") required_rule_ids.push(field.rule_id);
        else if (level === "recommended") recommended_rule_ids.push(field.rule_id);
    }
    return { required_rule_ids, recommended_rule_ids };
}

function rulesEqual(a: LifecycleStageFieldRules, b: LifecycleStageFieldRules): boolean {
    const sort = (xs: string[]) => [...xs].sort().join(",");
    return (
        sort(a.required_rule_ids) === sort(b.required_rule_ids) &&
        sort(a.recommended_rule_ids) === sort(b.recommended_rule_ids)
    );
}

function levelsFromRules(
    palette: FieldPaletteEntry[],
    rules: LifecycleStageFieldRules
): Record<string, FieldLevel> {
    const out: Record<string, FieldLevel> = {};
    for (const field of palette) {
        out[field.rule_id] = fieldLevelFromRules(field.rule_id, rules);
    }
    return out;
}

export type LifecycleStageFieldRequirementsEditorHandle = {
    save: () => Promise<boolean>;
};

export type LifecycleStageFieldRequirementsEditorProps = {
    departmentId: string;
    activeStage: LifecycleOperatorStage;
    compact?: boolean;
    /** Guided board — single save on card footer. */
    guidedMode?: boolean;
    prefetchedFieldRequirements?: LifecycleStageBootstrapFieldRequirements | null;
    onDirtyChange?: (dirty: boolean) => void;
    onFeedback?: (message: string | null) => void;
    onError?: (message: string | null) => void;
};

const LifecycleStageFieldRequirementsEditor = forwardRef<
    LifecycleStageFieldRequirementsEditorHandle,
    LifecycleStageFieldRequirementsEditorProps
>(function LifecycleStageFieldRequirementsEditor(
    {
        departmentId,
        activeStage,
        compact = false,
        guidedMode = false,
        prefetchedFieldRequirements = null,
        onDirtyChange,
        onFeedback,
        onError,
    },
    ref
) {
    const [apiStages, setApiStages] = useState<LifecycleRequirementsApiResponse["stages"] | null>(null);
    const [activeEntity, setActiveEntity] = useState<LifecycleRequirementEntityKey>("person");
    const [fieldLevels, setFieldLevels] = useState<Record<string, FieldLevel>>({});
    const [savedRules, setSavedRules] = useState<LifecycleStageFieldRules>({
        required_rule_ids: [],
        recommended_rule_ids: [],
    });
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [localFeedback, setLocalFeedback] = useState<string | null>(null);

    const stageData = apiStages?.[activeStage];
    const palette = stageData?.field_palette ?? [];

    const entitiesInPalette = useMemo(() => {
        const keys = new Set(palette.map((f) => f.entity));
        return LIFECYCLE_REQUIREMENT_ENTITIES.filter((e) => keys.has(e.key));
    }, [palette]);

    const draftRules = useMemo(
        () => rulesFromFieldLevels(palette, fieldLevels),
        [palette, fieldLevels]
    );

    const dirty = useMemo(() => !rulesEqual(draftRules, savedRules), [draftRules, savedRules]);

    const usingPlatformDefaults = useMemo(() => {
        if (!stageData) return true;
        return !stageData.has_department_override;
    }, [stageData]);

    const showEnforcementGap = useMemo(
        () => fieldRulesHaveRuntimeGaps(draftRules),
        [draftRules]
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useEffect(() => {
        if (entitiesInPalette.length && !entitiesInPalette.some((e) => e.key === activeEntity)) {
            setActiveEntity(entitiesInPalette[0]!.key);
        }
    }, [entitiesInPalette, activeEntity]);

    const loadConfig = useCallback(
        async (deptId: string) => {
            setLoadingConfig(true);
            setLocalError(null);
            onError?.(null);
            try {
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-requirements`,
                    workspaceDataFetchInit()
                );
                const j = (await res.json().catch(() => ({}))) as LifecycleRequirementsApiResponse & {
                    error?: string;
                };
                if (!res.ok) throw new Error(j.error ?? "Failed to load lifecycle settings");
                setApiStages(j.stages);
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to load";
                setLocalError(msg);
                onError?.(msg);
                setApiStages(null);
            } finally {
                setLoadingConfig(false);
            }
        },
        [onError]
    );

    useEffect(() => {
        if (!departmentId) return;
        if (prefetchedFieldRequirements) {
            setApiStages({
                [activeStage]: prefetchedFieldRequirements,
            } as LifecycleRequirementsApiResponse["stages"]);
            return;
        }
        void loadConfig(departmentId);
    }, [departmentId, loadConfig, prefetchedFieldRequirements, activeStage]);

    useEffect(() => {
        if (!stageData) return;
        const rules = stageData.effective.field_rules;
        setSavedRules(rules);
        setFieldLevels(levelsFromRules(palette, rules));
    }, [stageData, palette]);

    const setFieldLevel = useCallback((ruleId: string, level: FieldLevel) => {
        setFieldLevels((prev) => ({ ...prev, [ruleId]: level }));
        setLocalFeedback(null);
        onFeedback?.(null);
    }, [onFeedback]);

    const persistRequirements = useCallback(async () => {
        if (!departmentId || !dirty) return;
        setSaving(true);
        setLocalError(null);
        onError?.(null);
        setLocalFeedback(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-requirements`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        stage: activeStage,
                        field_rules: draftRules,
                    }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setSavedRules(draftRules);
            const msg = "Saved.";
            setLocalFeedback(msg);
            onFeedback?.(msg);
            await loadConfig(departmentId);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setLocalError(msg);
            onError?.(msg);
        } finally {
            setSaving(false);
        }
    }, [departmentId, dirty, activeStage, draftRules, loadConfig, onError, onFeedback]);

    useImperativeHandle(
        ref,
        () => ({
            save: async () => {
                if (!dirty) return true;
                await persistRequirements();
                return true;
            },
        }),
        [dirty, persistRequirements]
    );

    const resetStage = useCallback(async () => {
        if (!departmentId) return;
        setSaving(true);
        setLocalError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-requirements`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reset_stage: activeStage }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Reset failed");
            const msg = "Reset to platform defaults.";
            setLocalFeedback(msg);
            onFeedback?.(msg);
            await loadConfig(departmentId);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Reset failed";
            setLocalError(msg);
            onError?.(msg);
        } finally {
            setSaving(false);
        }
    }, [departmentId, activeStage, loadConfig, onError, onFeedback]);

    const fieldsForEntity = useMemo(
        () => palette.filter((f) => f.entity === activeEntity),
        [palette, activeEntity]
    );

    const savedSummary = useMemo(() => {
        const required = palette.filter((f) => savedRules.required_rule_ids.includes(f.rule_id));
        const recommended = palette.filter((f) => savedRules.recommended_rule_ids.includes(f.rule_id));
        return { required, recommended };
    }, [palette, savedRules]);

    return (
        <div data-testid="lifecycle-stage-field-requirements-editor">
            {localError ? (
                <p className="mb-2 text-xs text-red-700" role="alert">
                    {localError}
                </p>
            ) : null}
            {localFeedback ? (
                <p className="mb-2 text-xs text-alloy-pine" data-testid="lifecycle-settings-feedback">
                    {localFeedback}
                </p>
            ) : null}

            {!compact && !guidedMode ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {!usingPlatformDefaults ? (
                        <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-medium text-alloy-pine">
                            Custom for this department
                        </span>
                    ) : (
                        <span className="rounded-full bg-alloy-stone/15 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                            Platform defaults
                        </span>
                    )}
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-50"
                        disabled={saving || loadingConfig || usingPlatformDefaults}
                        onClick={() => void resetStage()}
                        data-testid="lifecycle-settings-reset-stage"
                    >
                        Reset to Default
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                        disabled={saving || loadingConfig || !dirty}
                        onClick={() => void persistRequirements()}
                        data-testid="lifecycle-settings-save"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            ) : null}

            {showEnforcementGap ? (
                <p
                    className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950"
                    data-testid="lifecycle-field-enforcement-gap"
                >
                    Some selected fields are saved as configuration only. Runtime checks still use broader
                    object-level rules until field-level enforcement expands.
                </p>
            ) : null}

            {loadingConfig ? (
                <p className="text-xs text-alloy-midnight/50">Loading…</p>
            ) : (
                <>
                    {guidedMode || compact ? null : (
                        <div className="mb-3">
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                Required Information
                            </h3>
                            <p className="mt-0.5 text-xs text-alloy-midnight/50">
                                Choose an entity, then mark fields as required or recommended.
                            </p>
                        </div>
                    )}

                    <label className="mb-2 flex items-center gap-2 text-[11px] font-medium text-alloy-midnight/70">
                        <span className="shrink-0 text-alloy-midnight/50">Entity</span>
                        <select
                            className="min-w-0 flex-1 rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs text-alloy-midnight"
                            value={activeEntity}
                            onChange={(e) =>
                                setActiveEntity(e.target.value as LifecycleRequirementEntityKey)
                            }
                            data-testid="lifecycle-field-entity-select"
                            aria-label="Requirement entity"
                        >
                            {entitiesInPalette.map((entity) => (
                                <option
                                    key={entity.key}
                                    value={entity.key}
                                    data-testid={`lifecycle-field-entity-option-${entity.key}`}
                                >
                                    {entity.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div
                        className={
                            guidedMode || compact
                                ? "rounded-md border border-alloy-forge/8"
                                : "max-h-[220px] overflow-y-auto overscroll-contain rounded-md border border-alloy-forge/8 pr-1"
                        }
                        data-testid="lifecycle-field-requirements-scroll"
                    >
                        <ul className="divide-y divide-alloy-forge/10 p-0.5" data-testid="lifecycle-field-requirements-list">
                        {fieldsForEntity.map((field) => {
                            const level = fieldLevels[field.rule_id] ?? "off";
                            const slug = field.field_label.replace(/\s+/g, "-").toLowerCase();
                            return (
                                <li
                                    key={field.rule_id}
                                    className="flex items-center justify-between gap-2 py-1.5 text-xs text-alloy-midnight"
                                    data-testid={`lifecycle-field-row-${field.entity}-${slug}`}
                                >
                                    <span className="min-w-0 truncate" data-testid={`lifecycle-field-label-${slug}`}>
                                        {field.field_label}
                                        {field.config_only ? (
                                            <span className="ml-1 text-[10px] text-alloy-midnight/40">(config only)</span>
                                        ) : null}
                                    </span>
                                    <div
                                        className="flex shrink-0 gap-0.5 rounded-md border border-alloy-forge/15 p-0.5"
                                        role="group"
                                        aria-label={`${field.field_label} requirement level`}
                                    >
                                        {(["off", "recommended", "required"] as const).map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                                                    level === option
                                                        ? option === "required"
                                                            ? "bg-alloy-pine text-white"
                                                            : option === "recommended"
                                                              ? "bg-alloy-stone/30 text-alloy-midnight"
                                                              : "bg-alloy-midnight/10 text-alloy-midnight/70"
                                                        : "text-alloy-midnight/45 hover:bg-alloy-stone/15"
                                                }`}
                                                aria-pressed={level === option}
                                                onClick={() => setFieldLevel(field.rule_id, option)}
                                                data-testid={`lifecycle-field-level-${slug}-${option}`}
                                            >
                                                {option === "off" ? "Off" : option === "required" ? "Req" : "Rec"}
                                            </button>
                                        ))}
                                    </div>
                                </li>
                            );
                        })}
                        </ul>
                    </div>

                    {!compact && (savedSummary.required.length > 0 || savedSummary.recommended.length > 0) ? (
                        <div
                            className="mt-3 rounded-md border border-alloy-forge/10 bg-alloy-stone/5 px-3 py-1.5"
                            data-testid="lifecycle-field-saved-summary"
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                Saved
                            </p>
                            {savedSummary.required.length > 0 ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-alloy-midnight/75">
                                    <span className="font-medium">Required:</span>{" "}
                                    {savedSummary.required
                                        .map((f) => `${lifecycleEntityLabel(f.entity)} · ${f.field_label}`)
                                        .join(", ")}
                                </p>
                            ) : null}
                            {savedSummary.recommended.length > 0 ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-alloy-midnight/65">
                                    <span className="font-medium">Recommended:</span>{" "}
                                    {savedSummary.recommended
                                        .map((f) => `${lifecycleEntityLabel(f.entity)} · ${f.field_label}`)
                                        .join(", ")}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}

            <span data-testid="lifecycle-stage-effective-required" className="sr-only">
                {draftRules.required_rule_ids.join(",")}
            </span>
        </div>
    );
});

export default LifecycleStageFieldRequirementsEditor;
