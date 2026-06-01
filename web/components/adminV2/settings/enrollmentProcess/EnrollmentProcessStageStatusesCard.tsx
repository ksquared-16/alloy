"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { EnrollmentStatusStagesPayload, EnrollmentStatusStageRow } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

export default function EnrollmentProcessStageStatusesCard({
    activeStage,
    onStagesLoaded,
}: {
    activeStage: LifecycleOperatorStage;
    onStagesLoaded?: (payload: EnrollmentStatusStagesPayload | null) => void;
}) {
    const [payload, setPayload] = useState<EnrollmentStatusStagesPayload | null>(null);
    const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
    const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/status-stages", workspaceDataFetchInit());
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load statuses");
            setPayload(j);
            onStagesLoaded?.(j);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setPayload(null);
            onStagesLoaded?.(null);
        } finally {
            setLoading(false);
        }
    }, [onStagesLoaded]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const keys = new Set((payload?.stages[activeStage]?.statuses ?? []).map((s) => s.status_key));
        setDraftKeys(keys);
        setSavedKeys(new Set(keys));
        setFeedback(null);
    }, [payload, activeStage]);

    const dirty = useMemo(() => !setsEqual(draftKeys, savedKeys), [draftKeys, savedKeys]);

    const rowsByKey = useMemo(() => {
        const m = new Map<string, EnrollmentStatusStageRow>();
        if (!payload) return m;
        for (const row of [
            ...payload.unassigned,
            ...Object.values(payload.stages).flatMap((s) => s.statuses),
        ]) {
            m.set(row.status_key, row);
        }
        return m;
    }, [payload]);

    const assigned = useMemo(
        () =>
            [...draftKeys]
                .map((k) => rowsByKey.get(k))
                .filter((r): r is EnrollmentStatusStageRow => !!r)
                .sort((a, b) => a.status_label.localeCompare(b.status_label)),
        [draftKeys, rowsByKey]
    );

    const availableToAdd = useMemo(() => {
        if (!payload) return [] as EnrollmentStatusStageRow[];
        const pool: EnrollmentStatusStageRow[] = [
            ...payload.unassigned,
            ...Object.values(payload.stages).flatMap((s) => s.statuses),
        ];
        const seen = new Set<string>();
        const out: EnrollmentStatusStageRow[] = [];
        for (const row of pool) {
            if (draftKeys.has(row.status_key) || seen.has(row.status_key)) continue;
            seen.add(row.status_key);
            out.push(row);
        }
        return out.sort((a, b) => a.sort_order - b.sort_order || a.status_label.localeCompare(b.status_label));
    }, [payload, draftKeys]);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/status-stages", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stage: activeStage, status_keys: [...draftKeys] }),
            });
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setPayload(j);
            onStagesLoaded?.(j);
            const keys = new Set((j.stages[activeStage]?.statuses ?? []).map((s) => s.status_key));
            setDraftKeys(keys);
            setSavedKeys(keys);
            setFeedback("Saved status mapping.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [activeStage, draftKeys, onStagesLoaded]);

    const resetStage = useCallback(async () => {
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/status-stages", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reset_stage: activeStage }),
            });
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Reset failed");
            setPayload(j);
            onStagesLoaded?.(j);
            const keys = new Set((j.stages[activeStage]?.statuses ?? []).map((s) => s.status_key));
            setDraftKeys(keys);
            setSavedKeys(keys);
            setFeedback("Reset to platform defaults for this stage.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Reset failed");
        } finally {
            setSaving(false);
        }
    }, [activeStage, onStagesLoaded]);

    const addStatus = useCallback((statusKey: string) => {
        setDraftKeys((prev) => new Set([...prev, statusKey]));
        setFeedback(null);
    }, []);

    const removeStatus = useCallback((statusKey: string) => {
        setDraftKeys((prev) => {
            const next = new Set(prev);
            next.delete(statusKey);
            return next;
        });
        setFeedback(null);
    }, []);

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading statuses…</p>;
    }

    return (
        <div className="space-y-3" data-testid="enrollment-process-statuses-editor">
            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {feedback ? (
                <p className="text-xs text-alloy-pine" data-testid="enrollment-process-statuses-feedback">
                    {feedback}
                </p>
            ) : null}

            <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Statuses in this stage
                </h4>
                {assigned.length ? (
                    <ul className="mt-2 space-y-1.5" data-testid="enrollment-process-status-assigned">
                        {[...assigned]
                            .sort((a, b) => a.status_label.localeCompare(b.status_label))
                            .map((row) => (
                                <li
                                    key={row.status_key}
                                    className="flex items-center justify-between gap-2 rounded-md border border-alloy-forge/10 bg-white/80 px-2 py-1 text-xs"
                                >
                                    <span>{row.status_label}</span>
                                    <button
                                        type="button"
                                        className="text-[11px] font-medium text-alloy-midnight/60 hover:text-red-800"
                                        onClick={() => removeStatus(row.status_key)}
                                        data-testid={`enrollment-process-remove-status-${row.status_key}`}
                                    >
                                        Remove from stage
                                    </button>
                                </li>
                            ))}
                    </ul>
                ) : (
                    <p className="mt-1 text-xs text-alloy-midnight/50">No statuses in this stage yet.</p>
                )}
            </div>

            <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Add status
                </label>
                <select
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                    defaultValue=""
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v) addStatus(v);
                        e.target.value = "";
                    }}
                    data-testid="enrollment-process-add-status-select"
                >
                    <option value="">Choose a status…</option>
                    {availableToAdd.map((row) => (
                        <option key={row.status_key} value={row.status_key}>
                            {row.status_label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                    disabled={saving || !dirty}
                    onClick={() => void save()}
                    data-testid="enrollment-process-statuses-save"
                >
                    {saving ? "Saving…" : "Save"}
                </button>
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-50"
                    disabled={saving || !payload?.stages[activeStage]?.has_custom_assignments}
                    onClick={() => void resetStage()}
                    data-testid="enrollment-process-statuses-reset"
                >
                    Reset to Default
                </button>
            </div>

            <button
                type="button"
                disabled
                title="Future: BOS will suggest statuses for this stage. You review and apply."
                className="w-full rounded-md border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.04] px-2 py-1.5 text-[11px] text-alloy-midnight/45"
                data-testid="enrollment-process-bos-suggest-statuses"
            >
                Ask BOS to suggest statuses for this stage
            </button>
        </div>
    );
}
