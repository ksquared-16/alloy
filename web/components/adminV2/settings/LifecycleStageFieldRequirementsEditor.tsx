"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { LifecycleStageBootstrapFieldRequirements } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import {
    LIFECYCLE_REQUIREMENT_ENTITIES,
    type LifecycleRequirementEntityKey,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { lifecycleRequirementEntityLabel } from "@/lib/lifecycle/lifecycleRequirementEntityLabels";
import {
    isWaitlistBuilderStage,
    WAITLIST_REQUIRED_INFO_HELPER,
} from "@/lib/lifecycle/lifecycleBuilderStagePalette";
import { BUSINESS_PROCESS_STAGE_REQUIREMENTS_HELPER } from "@/lib/lifecycle/businessProcessUiLabels";
import {
    BUILDER_REQUIREMENT_LEVEL_COPY,
    builderFieldRulesDirty,
    builderStoredFieldRulesFromUiLevels,
    builderUiLevelButtonLabel,
    builderUiLevelFromStored,
    builderUiLevelOptionsForField,
    builderUiLevelsFromStored,
    type BuilderRequirementUiLevel,
} from "@/lib/lifecycle/lifecycleBuilderRequirementLevelsUi";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
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
    platform?: {
        field_rules: LifecycleStageFieldRules;
        required_labels?: string[];
        recommended_labels?: string[];
    };
    effective: {
        field_rules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored;
        field_rules_source: string;
        required_labels: string[];
        recommended_labels: string[];
        source: string;
    };
    has_department_override: boolean;
    field_palette: FieldPaletteEntry[];
};

type LifecycleRequirementsApiResponse = {
    stages: Record<string, StageConfigPayload>;
    entity_display_labels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    error?: string;
};

function normalizeStoredRules(
    rules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored
): LifecycleStageFieldRulesStored {
    return {
        required_rule_ids: rules.required_rule_ids,
        recommended_rule_ids: rules.recommended_rule_ids,
        ...("rule_levels_v1" in rules && rules.rule_levels_v1
            ? { rule_levels_v1: rules.rule_levels_v1 }
            : {}),
    };
}

export type LifecycleStageFieldRequirementsEditorHandle = {
    save: () => Promise<boolean>;
    getDraftRules: () => LifecycleStageFieldRulesStored;
    isDirty: () => boolean;
    applySuggestions: () => void;
    applySavedRules: (rules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored) => void;
};

export type LifecycleStageFieldRequirementsEditorProps = {
    departmentId: string;
    activeStageKey: string;
    compact?: boolean;
    /** Guided board — single save on card footer. */
    guidedMode?: boolean;
    /** Stage workspace — no inline save; parent orchestrates Save stage. */
    workspaceMode?: boolean;
    prefetchedFieldRequirements?: LifecycleStageBootstrapFieldRequirements | null;
    entityDisplayLabels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
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
        activeStageKey,
        compact = false,
        guidedMode = false,
        workspaceMode = false,
        prefetchedFieldRequirements = null,
        entityDisplayLabels: entityDisplayLabelsProp,
        onDirtyChange,
        onFeedback,
        onError,
    },
    ref
) {
    const [apiStages, setApiStages] = useState<LifecycleRequirementsApiResponse["stages"] | null>(null);
    const [entityDisplayLabels, setEntityDisplayLabels] = useState<
        Partial<Record<LifecycleRequirementEntityKey, string>>
    >({});
    const savingRef = useRef(false);
    const [activeEntity, setActiveEntity] = useState<LifecycleRequirementEntityKey>("person");
    const [fieldLevels, setFieldLevels] = useState<Record<string, BuilderRequirementUiLevel>>({});
    const [savedRules, setSavedRules] = useState<LifecycleStageFieldRulesStored>({
        required_rule_ids: [],
        recommended_rule_ids: [],
    });
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [localFeedback, setLocalFeedback] = useState<string | null>(null);

    const stageData = apiStages?.[activeStageKey];
    const palette = stageData?.field_palette ?? [];

    const entitiesInPalette = useMemo(() => {
        const keys = new Set(palette.map((f) => f.entity));
        return LIFECYCLE_REQUIREMENT_ENTITIES.filter((e) => keys.has(e.key));
    }, [palette]);

    const draftRules = useMemo(
        () => builderStoredFieldRulesFromUiLevels(palette, fieldLevels),
        [palette, fieldLevels]
    );

    const dirty = useMemo(
        () => builderFieldRulesDirty(savedRules, draftRules, palette),
        [draftRules, savedRules, palette]
    );

    const usingPlatformDefaults = useMemo(() => {
        if (!stageData) return true;
        return !stageData.has_department_override;
    }, [stageData]);

    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;

    const suggestionRules = useMemo(() => {
        const platform = stageData?.platform?.field_rules;
        if (!platform) return null;
        const hasRules =
            platform.required_rule_ids.length > 0 || platform.recommended_rule_ids.length > 0;
        if (!hasRules) return null;
        if (stageData?.has_department_override) return null;
        return platform;
    }, [stageData]);

    const applySuggestions = useCallback(() => {
        if (!suggestionRules || !palette.length) return;
        setFieldLevels(builderUiLevelsFromStored(palette, suggestionRules));
        setLocalFeedback(null);
        onFeedback?.(null);
    }, [suggestionRules, palette, onFeedback]);

    const applySavedRules = useCallback(
        (rules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored) => {
            const stored = normalizeStoredRules(rules);
            setSavedRules(stored);
            setFieldLevels(builderUiLevelsFromStored(palette, stored));
        },
        [palette]
    );

    const showWaitlistHelper = isWaitlistBuilderStage(activeStageKey);

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
                setEntityDisplayLabels(j.entity_display_labels ?? {});
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
        if (entityDisplayLabelsProp) {
            setEntityDisplayLabels(entityDisplayLabelsProp);
        }
    }, [entityDisplayLabelsProp]);

    useEffect(() => {
        if (!departmentId) return;
        if (prefetchedFieldRequirements) {
            setApiStages({
                [activeStageKey]: prefetchedFieldRequirements,
            } as LifecycleRequirementsApiResponse["stages"]);
            if (!entityDisplayLabelsProp) {
                void loadConfig(departmentId);
            }
            return;
        }
        void loadConfig(departmentId);
    }, [departmentId, loadConfig, prefetchedFieldRequirements, activeStageKey, entityDisplayLabelsProp]);

    useEffect(() => {
        if (!stageData) return;
        const stored = normalizeStoredRules(stageData.effective.field_rules);
        setSavedRules(stored);
        setFieldLevels(builderUiLevelsFromStored(palette, stored));
    }, [stageData, palette]);

    const setFieldLevel = useCallback((ruleId: string, level: BuilderRequirementUiLevel) => {
        setFieldLevels((prev) => ({ ...prev, [ruleId]: level }));
        setLocalFeedback(null);
        onFeedback?.(null);
    }, [onFeedback]);

    const persistRequirements = useCallback(async (): Promise<boolean> => {
        if (!departmentId || !dirty) return true;
        if (savingRef.current) return false;
        savingRef.current = true;
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
                        stage: activeStageKey,
                        field_rules: draftRules,
                    }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setSavedRules(draftRules);
            if (!workspaceMode && !guidedMode) {
                const msg = "Saved.";
                setLocalFeedback(msg);
                onFeedback?.(msg);
            }
            if (!prefetchedFieldRequirements && !workspaceMode) {
                await loadConfig(departmentId);
            }
            return true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setLocalError(msg);
            onError?.(msg);
            return false;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [
        departmentId,
        dirty,
        activeStageKey,
        draftRules,
        loadConfig,
        onError,
        onFeedback,
        prefetchedFieldRequirements,
        workspaceMode,
        guidedMode,
    ]);

    useImperativeHandle(
        ref,
        () => ({
            save: async () => persistRequirements(),
            getDraftRules: () => draftRules,
            isDirty: () => dirtyRef.current,
            applySuggestions,
            applySavedRules,
        }),
        [persistRequirements, draftRules, applySuggestions, applySavedRules]
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
                    body: JSON.stringify({ reset_stage: activeStageKey }),
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
    }, [departmentId, activeStageKey, loadConfig, onError, onFeedback]);

    const fieldsForEntity = useMemo(
        () => palette.filter((f) => f.entity === activeEntity),
        [palette, activeEntity]
    );

    const savedSummary = useMemo(() => {
        const enforced: FieldPaletteEntry[] = [];
        const required: FieldPaletteEntry[] = [];
        const recommended: FieldPaletteEntry[] = [];
        for (const field of palette) {
            const level = builderUiLevelFromStored({
                ruleId: field.rule_id,
                stored: savedRules,
                runtimeEnforced: field.runtime_enforced,
            });
            if (level === "enforced") enforced.push(field);
            else if (level === "required") required.push(field);
            else if (level === "recommended") recommended.push(field);
        }
        return { enforced, required, recommended };
    }, [palette, savedRules]);

    const formatFieldList = useCallback(
        (fields: FieldPaletteEntry[]) =>
            fields
                .map(
                    (f) =>
                        `${entityDisplayLabels[f.entity] ?? lifecycleRequirementEntityLabel(f.entity)} · ${f.field_label}`
                )
                .join(", "),
        [entityDisplayLabels]
    );

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

            {!compact && !guidedMode && !workspaceMode ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {!usingPlatformDefaults ? (
                        <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-medium text-alloy-pine">
                            Custom for this department
                        </span>
                    ) : (
                        <span className="rounded-full bg-alloy-stone/15 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                            Not configured yet
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

            {suggestionRules &&
            !dirty &&
            savedRules.required_rule_ids.length === 0 &&
            savedRules.recommended_rule_ids.length === 0 ? (
                <div
                    className="mb-3 rounded-md border border-alloy-forge/10 bg-alloy-stone/5 px-3 py-2"
                    data-testid="lifecycle-field-suggestions"
                >
                    <p className="text-[11px] text-alloy-midnight/65">
                        <span className="font-medium text-alloy-midnight/80">Suggested</span> — enrollment
                        templates often require these fields. Applying suggestions does not save until you click{" "}
                        <span className="font-medium">Save stage</span>.
                    </p>
                    <button
                        type="button"
                        className="mt-1.5 text-[11px] font-medium text-alloy-pine hover:underline"
                        onClick={applySuggestions}
                        data-testid="lifecycle-field-apply-suggestions"
                    >
                        Apply suggestions
                    </button>
                </div>
            ) : null}

            {workspaceMode ? (
                <p
                    className="mb-3 text-[11px] leading-relaxed text-alloy-midnight/55"
                    data-testid="stage-requirements-helper"
                >
                    {BUSINESS_PROCESS_STAGE_REQUIREMENTS_HELPER}
                </p>
            ) : null}

            {showWaitlistHelper ? (
                <p
                    className="mb-3 text-xs text-alloy-midnight/55"
                    data-testid="lifecycle-waitlist-required-info-helper"
                >
                    {WAITLIST_REQUIRED_INFO_HELPER}
                </p>
            ) : null}

            {loadingConfig ? (
                <p className="text-xs text-alloy-midnight/50">Loading…</p>
            ) : (
                <>
                    {guidedMode || compact || workspaceMode ? null : (
                        <div className="mb-3">
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                Required Information
                            </h3>
                            <p className="mt-0.5 text-xs text-alloy-midnight/50">
                                Choose an entity, then set how strongly each field is required.
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
                                    {entityDisplayLabels[entity.key] ??
                                        lifecycleRequirementEntityLabel(entity.key)}
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
                        <ul
                            className="divide-y divide-alloy-forge/10 p-0.5"
                            data-testid="lifecycle-field-requirements-list"
                        >
                            {fieldsForEntity.map((field) => {
                                const level = fieldLevels[field.rule_id] ?? "off";
                                const slug = field.field_label.replace(/\s+/g, "-").toLowerCase();
                                const options = builderUiLevelOptionsForField(field.runtime_enforced);
                                const levelCopy =
                                    level !== "off"
                                        ? BUILDER_REQUIREMENT_LEVEL_COPY[level]
                                        : null;
                                return (
                                    <li
                                        key={field.rule_id}
                                        className="py-1.5 text-xs text-alloy-midnight"
                                        data-testid={`lifecycle-field-row-${field.entity}-${slug}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span
                                                className="min-w-0 truncate"
                                                data-testid={`lifecycle-field-label-${slug}`}
                                            >
                                                {field.field_label}
                                            </span>
                                            <div
                                                className="flex shrink-0 gap-0.5 rounded-md border border-alloy-forge/15 p-0.5"
                                                role="group"
                                                aria-label={`${field.field_label} requirement level`}
                                            >
                                                {options.map((option) => {
                                                    const copy =
                                                        option !== "off"
                                                            ? BUILDER_REQUIREMENT_LEVEL_COPY[option]
                                                            : null;
                                                    return (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                                level === option
                                                                    ? option === "enforced" ||
                                                                      option === "required"
                                                                        ? "bg-alloy-pine text-white"
                                                                        : option === "recommended"
                                                                          ? "bg-alloy-stone/30 text-alloy-midnight"
                                                                          : "bg-alloy-midnight/10 text-alloy-midnight/70"
                                                                    : "text-alloy-midnight/45 hover:bg-alloy-stone/15"
                                                            }`}
                                                            aria-pressed={level === option}
                                                            title={
                                                                copy
                                                                    ? `${copy.label} — ${copy.helper}`
                                                                    : "Not configured"
                                                            }
                                                            onClick={() =>
                                                                setFieldLevel(field.rule_id, option)
                                                            }
                                                            data-testid={`lifecycle-field-level-${slug}-${option}`}
                                                        >
                                                            {builderUiLevelButtonLabel(option)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {levelCopy ? (
                                            <p
                                                className="mt-0.5 text-[10px] text-alloy-midnight/45"
                                                data-testid={`lifecycle-field-level-helper-${slug}`}
                                            >
                                                {levelCopy.helper}
                                            </p>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {!compact &&
                    (savedSummary.enforced.length > 0 ||
                        savedSummary.required.length > 0 ||
                        savedSummary.recommended.length > 0) ? (
                        <div
                            className="mt-3 rounded-md border border-alloy-forge/10 bg-alloy-stone/5 px-3 py-1.5"
                            data-testid="lifecycle-field-saved-summary"
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                Configured
                            </p>
                            {savedSummary.enforced.length > 0 ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-alloy-midnight/75">
                                    <span className="font-medium">Enforced:</span>{" "}
                                    {formatFieldList(savedSummary.enforced)}
                                </p>
                            ) : null}
                            {savedSummary.required.length > 0 ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-alloy-midnight/75">
                                    <span className="font-medium">Required:</span>{" "}
                                    {formatFieldList(savedSummary.required)}
                                </p>
                            ) : null}
                            {savedSummary.recommended.length > 0 ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-alloy-midnight/65">
                                    <span className="font-medium">Recommended:</span>{" "}
                                    {formatFieldList(savedSummary.recommended)}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}

            <span data-testid="lifecycle-stage-effective-required" className="sr-only">
                {draftRules.required_rule_ids.join(",")}
            </span>
            <span data-testid="lifecycle-stage-effective-rule-levels" className="sr-only">
                {JSON.stringify(draftRules.rule_levels_v1?.by_rule_id ?? {})}
            </span>
        </div>
    );
});

export default LifecycleStageFieldRequirementsEditor;
