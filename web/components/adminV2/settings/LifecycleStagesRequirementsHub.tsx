"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LifecycleRelatedSettingsLinks from "@/components/adminV2/settings/LifecycleRelatedSettingsLinks";
import LifecycleStageWhereAppears from "@/components/adminV2/settings/LifecycleStageWhereAppears";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleRequirementFieldDetailForLabel } from "@/lib/completion/lifecycleRequirementFieldDetail";
import {
    lifecycleLockedLabelReason,
    lifecycleStageLabelPalette,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type DeptListRow = { id: string; name: string | null; key: string | null };

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

const STAGE_TABS = LIFECYCLE_STAGE_ORDER.map((key) => ({
    key,
    label: LIFECYCLE_STAGE_LABELS[key],
}));

export default function LifecycleStagesRequirementsHub() {
    const [departments, setDepartments] = useState<DeptListRow[]>([]);
    const [departmentId, setDepartmentId] = useState("");
    const [activeStage, setActiveStage] = useState<LifecycleOperatorStage>("lead");
    const [apiStages, setApiStages] = useState<LifecycleRequirementsApiResponse["stages"] | null>(null);
    const [requiredDraft, setRequiredDraft] = useState<Set<string>>(new Set());
    const [recommendedDraft, setRecommendedDraft] = useState<Set<string>>(new Set());
    const [savedRequired, setSavedRequired] = useState<Set<string>>(new Set());
    const [savedRecommended, setSavedRecommended] = useState<Set<string>>(new Set());
    const [loadingList, setLoadingList] = useState(true);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

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

    const loadConfig = useCallback(async (deptId: string) => {
        setLoadingConfig(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-requirements`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as LifecycleRequirementsApiResponse & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load lifecycle settings");
            setApiStages(j.stages);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setApiStages(null);
        } finally {
            setLoadingConfig(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            try {
                const res = await fetch("/api/admin/departments", workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { items?: DeptListRow[]; error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to load departments");
                const items = j.items ?? [];
                if (!cancelled) {
                    setDepartments(items);
                    if (items.length && !departmentId) setDepartmentId(items[0]!.id);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load departments");
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

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
            setFeedback(null);
        },
        [lockedReasons]
    );

    const save = useCallback(async () => {
        if (!departmentId || !dirty) return;
        setSaving(true);
        setError(null);
        setFeedback(null);
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
            setFeedback("Saved lifecycle settings.");
            await loadConfig(departmentId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [departmentId, dirty, activeStage, requiredDraft, recommendedDraft, loadConfig]);

    const resetStage = useCallback(async () => {
        if (!departmentId) return;
        setSaving(true);
        setError(null);
        setFeedback(null);
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
            setFeedback("Reset this stage to platform defaults.");
            await loadConfig(departmentId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Reset failed");
        } finally {
            setSaving(false);
        }
    }, [departmentId, activeStage, loadConfig]);

    return (
        <div className="space-y-4" data-testid="lifecycle-stages-requirements-hub">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Department
                    <select
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                        value={departmentId}
                        disabled={loadingList || !departments.length}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        data-testid="lifecycle-settings-department-select"
                    >
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name ?? d.key ?? d.id}
                            </option>
                        ))}
                    </select>
                </label>
                {dirty ? (
                    <span
                        className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-900"
                        data-testid="lifecycle-settings-unsaved"
                    >
                        Unsaved changes
                    </span>
                ) : null}
                {!usingPlatformDefaults ? (
                    <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-medium text-alloy-pine">
                        Custom rules for this department
                    </span>
                ) : (
                    <span className="rounded-full bg-alloy-stone/15 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                        Platform defaults
                    </span>
                )}
            </div>

            {error ? (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {feedback ? (
                <p className="text-sm text-alloy-pine" data-testid="lifecycle-settings-feedback">
                    {feedback}
                </p>
            ) : null}

            <SettingsEntityTabBar
                tabs={STAGE_TABS}
                activeKey={activeStage}
                onSelect={setActiveStage}
                aria-label="Enrollment lifecycle stage"
            />

            <section
                className="rounded-xl border border-alloy-forge/15 bg-white/85 p-4 shadow-sm"
                data-testid={`lifecycle-progression-stage-${activeStage}`}
                role="tabpanel"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold text-alloy-midnight">{LIFECYCLE_STAGE_LABELS[activeStage]}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-50"
                            disabled={saving || loadingConfig || !usingPlatformDefaults}
                            onClick={() => void resetStage()}
                            data-testid="lifecycle-settings-reset-stage"
                        >
                            Reset to Default
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                            disabled={saving || loadingConfig || !dirty}
                            onClick={() => void save()}
                            data-testid="lifecycle-settings-save"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {loadingConfig ? (
                    <p className="mt-4 text-xs text-alloy-midnight/50">Loading…</p>
                ) : (
                    <div className="mt-4 grid gap-6 sm:grid-cols-2">
                        <RequirementCheckboxList
                            title="Required Information"
                            description="Must be present before families move forward at this stage"
                            variant="required"
                            palette={palette}
                            activeStage={activeStage}
                            selected={requiredDraft}
                            lockedReasons={lockedReasons}
                            onToggle={(label, checked) => toggleLabel(label, "required", checked)}
                        />
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
                    </div>
                )}

                <LifecycleStageWhereAppears stage={activeStage} />

                <p className="mt-4 text-[11px] text-alloy-midnight/45">
                    Button visibility:{" "}
                    <Link
                        href="/adminV2/settings/actions?entity_type=opportunity"
                        className="font-medium text-alloy-pine hover:underline"
                    >
                        Action Buttons
                    </Link>
                    . Queues:{" "}
                    <Link href="/adminV2/settings/work-units" className="font-medium text-alloy-pine hover:underline">
                        Work Units &amp; Queues
                    </Link>
                    .
                </p>
            </section>

            <LifecycleRelatedSettingsLinks />
        </div>
    );
}
