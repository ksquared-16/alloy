"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleRequirementFieldDetailForLabel } from "@/lib/completion/lifecycleRequirementFieldDetail";
import {
    lifecycleLockedLabelReason,
    lifecycleStageLabelPalette,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type StageConfigPayload = {
    platform: { required_labels: string[]; recommended_labels: string[] };
    effective: { required_labels: string[]; recommended_labels: string[]; source: string };
    has_department_override: boolean;
};

type LifecycleRequirementsApiResponse = {
    stages: Record<LifecycleOperatorStage, StageConfigPayload>;
    error?: string;
};

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

function RequirementCheckboxList({
    title,
    description,
    variant,
    palette,
    activeStage,
    selected,
    lockedReasons,
    onToggle,
}: {
    title: string;
    description: string;
    variant: "required" | "recommended";
    palette: string[];
    activeStage: LifecycleOperatorStage;
    selected: Set<string>;
    lockedReasons: Record<string, string>;
    onToggle: (label: string, checked: boolean) => void;
}) {
    return (
        <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">{title}</h3>
            <p className="mt-0.5 text-xs text-alloy-midnight/50">{description}</p>
            <ul className="mt-2 space-y-2" data-testid={`lifecycle-req-list-${variant}`}>
                {palette.map((label) => {
                    const locked = lockedReasons[label];
                    const checked = selected.has(label);
                    const id = `lifecycle-${activeStage}-${variant}-${label.replace(/\s+/g, "-").toLowerCase()}`;
                    return (
                        <li key={`${variant}:${label}`} className="flex items-start gap-2 text-sm text-alloy-midnight">
                            <input
                                id={id}
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-alloy-forge/30"
                                checked={checked}
                                disabled={!!locked}
                                onChange={(e) => onToggle(label, e.target.checked)}
                                data-testid={`lifecycle-req-checkbox-${variant}-${label.replace(/\s+/g, "-").toLowerCase()}`}
                            />
                            <div className="flex-1">
                                <label htmlFor={id} className="cursor-pointer leading-snug">
                                    <span data-testid={`lifecycle-req-label-${label.replace(/\s+/g, "-").toLowerCase()}`}>
                                        {label}
                                    </span>
                                </label>
                                {locked ? (
                                    <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">{locked}</span>
                                ) : null}
                                {(() => {
                                    const detail = lifecycleRequirementFieldDetailForLabel(label);
                                    if (!detail?.fields.length) return null;
                                    return (
                                        <ul
                                            className="mt-1.5 ml-1 space-y-0.5 border-l border-alloy-forge/15 pl-3"
                                            data-testid={`lifecycle-req-field-detail-${label.replace(/\s+/g, "-").toLowerCase()}`}
                                        >
                                            {detail.fields.map((field) => (
                                                <li key={field} className="text-xs text-alloy-midnight/60">
                                                    {field}
                                                </li>
                                            ))}
                                        </ul>
                                    );
                                })()}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export type LifecycleStageRequirementsEditorProps = {
    departmentId: string;
    activeStage: LifecycleOperatorStage;
    compact?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    onFeedback?: (message: string | null) => void;
    onError?: (message: string | null) => void;
};

export default function LifecycleStageRequirementsEditor({
    departmentId,
    activeStage,
    compact = false,
    onDirtyChange,
    onFeedback,
    onError,
}: LifecycleStageRequirementsEditorProps) {
    const [apiStages, setApiStages] = useState<LifecycleRequirementsApiResponse["stages"] | null>(null);
    const [requiredDraft, setRequiredDraft] = useState<Set<string>>(new Set());
    const [recommendedDraft, setRecommendedDraft] = useState<Set<string>>(new Set());
    const [savedRequired, setSavedRequired] = useState<Set<string>>(new Set());
    const [savedRecommended, setSavedRecommended] = useState<Set<string>>(new Set());
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [localFeedback, setLocalFeedback] = useState<string | null>(null);

    const palette = useMemo(() => lifecycleStageLabelPalette(activeStage), [activeStage]);

    const lockedReasons = useMemo(() => {
        const out: Record<string, string> = {};
        for (const label of palette) {
            const reason = lifecycleLockedLabelReason(activeStage, label);
            if (reason) out[label] = reason;
        }
        return out;
    }, [activeStage, palette]);

    const dirty = useMemo(
        () => !setsEqual(requiredDraft, savedRequired) || !setsEqual(recommendedDraft, savedRecommended),
        [requiredDraft, recommendedDraft, savedRequired, savedRecommended]
    );

    const usingPlatformDefaults = useMemo(() => {
        if (!apiStages?.[activeStage]) return true;
        return !apiStages[activeStage].has_department_override;
    }, [apiStages, activeStage]);

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const loadConfig = useCallback(async (deptId: string) => {
        setLoadingConfig(true);
        setLocalError(null);
        onError?.(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-requirements`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as LifecycleRequirementsApiResponse & { error?: string };
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
    }, [onError]);

    useEffect(() => {
        if (!departmentId) return;
        void loadConfig(departmentId);
    }, [departmentId, loadConfig]);

    useEffect(() => {
        const stageData = apiStages?.[activeStage];
        if (!stageData) return;
        const req = new Set(stageData.effective.required_labels);
        const rec = new Set(stageData.effective.recommended_labels);
        setRequiredDraft(req);
        setRecommendedDraft(rec);
        setSavedRequired(new Set(req));
        setSavedRecommended(new Set(rec));
    }, [apiStages, activeStage]);

    const toggleLabel = useCallback(
        (label: string, variant: "required" | "recommended", checked: boolean) => {
            if (lockedReasons[label]) return;
            if (variant === "required") {
                setRequiredDraft((prev) => {
                    const next = new Set(prev);
                    if (checked) {
                        next.add(label);
                        setRecommendedDraft((r) => {
                            const nr = new Set(r);
                            nr.delete(label);
                            return nr;
                        });
                    } else {
                        next.delete(label);
                    }
                    return next;
                });
            } else {
                setRecommendedDraft((prev) => {
                    const next = new Set(prev);
                    if (checked) {
                        next.add(label);
                        setRequiredDraft((r) => {
                            const nr = new Set(r);
                            nr.delete(label);
                            return nr;
                        });
                    } else {
                        next.delete(label);
                    }
                    return next;
                });
            }
            setLocalFeedback(null);
            onFeedback?.(null);
        },
        [lockedReasons, onFeedback]
    );

    const save = useCallback(async () => {
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
                        required_labels: [...requiredDraft],
                        recommended_labels: [...recommendedDraft],
                    }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setSavedRequired(new Set(requiredDraft));
            setSavedRecommended(new Set(recommendedDraft));
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
    }, [departmentId, dirty, activeStage, requiredDraft, recommendedDraft, loadConfig, onError, onFeedback]);

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

    const requiredLabels = useMemo(() => [...requiredDraft], [requiredDraft]);

    return (
        <div data-testid="lifecycle-stage-requirements-editor">
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

            {!compact ? (
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
                        disabled={saving || loadingConfig || !usingPlatformDefaults}
                        onClick={() => void resetStage()}
                        data-testid="lifecycle-settings-reset-stage"
                    >
                        Reset to Default
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                        disabled={saving || loadingConfig || !dirty}
                        onClick={() => void save()}
                        data-testid="lifecycle-settings-save"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            ) : null}

            {loadingConfig ? (
                <p className="text-xs text-alloy-midnight/50">Loading…</p>
            ) : (
                <div className={compact ? "space-y-4" : "grid gap-6 sm:grid-cols-2"}>
                    <RequirementCheckboxList
                        title={compact ? "Required" : "Required Information"}
                        description={
                            compact
                                ? "Must be present before moving forward"
                                : "Must be present before families move forward at this stage"
                        }
                        variant="required"
                        palette={palette}
                        activeStage={activeStage}
                        selected={requiredDraft}
                        lockedReasons={lockedReasons}
                        onToggle={(label, checked) => toggleLabel(label, "required", checked)}
                    />
                    {!compact ? (
                        <RequirementCheckboxList
                            title="Recommended Information"
                            description="Helpful guidance — may warn but not always block"
                            variant="recommended"
                            palette={palette}
                            activeStage={activeStage}
                            selected={recommendedDraft}
                            lockedReasons={lockedReasons}
                            onToggle={(label, checked) => toggleLabel(label, "recommended", checked)}
                        />
                    ) : null}
                </div>
            )}

            <span data-testid="lifecycle-stage-effective-required" className="sr-only">
                {requiredLabels.join(",")}
            </span>
        </div>
    );
}
