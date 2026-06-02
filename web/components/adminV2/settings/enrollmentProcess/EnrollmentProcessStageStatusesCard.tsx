"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EnrollmentStatusStagesPayload, EnrollmentStatusStageRow } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

export default function EnrollmentProcessStageStatusesCard({
    departmentId,
    activeStageKey,
    onStagesLoaded,
}: {
    departmentId: string;
    activeStageKey: string;
    onStagesLoaded?: (payload: EnrollmentStatusStagesPayload | null) => void;
}) {
    const operatorStage = asOperatorStageKey(activeStageKey);
    const [payload, setPayload] = useState<EnrollmentStatusStagesPayload | null>(null);
    const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
    const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const onStagesLoadedRef = useRef(onStagesLoaded);
    useEffect(() => {
        onStagesLoadedRef.current = onStagesLoaded;
    }, [onStagesLoaded]);

    const load = useCallback(async () => {
        if (!departmentId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/enrollment-process/status-stages?department_id=${encodeURIComponent(departmentId)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load statuses");
            setPayload(j);
            onStagesLoadedRef.current?.(j);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setPayload(null);
            onStagesLoadedRef.current?.(null);
        } finally {
            setLoading(false);
        }
    }, [departmentId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const keys = new Set((payload?.stages[activeStageKey]?.statuses ?? []).map((s) => s.status_key));
        setDraftKeys(keys);
        setSavedKeys(new Set(keys));
        setFeedback(null);
    }, [payload, activeStageKey]);

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
        if (!operatorStage) return;
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/status-stages", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: departmentId,
                    stage: activeStageKey,
                    status_keys: [...draftKeys],
                }),
            });
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setPayload(j);
            onStagesLoadedRef.current?.(j);
            const keys = new Set((j.stages[activeStageKey]?.statuses ?? []).map((s) => s.status_key));
            setDraftKeys(keys);
            setSavedKeys(keys);
            setFeedback("Saved.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [departmentId, activeStageKey, operatorStage, draftKeys]);

    const resetStage = useCallback(async () => {
        if (!operatorStage) return;
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/status-stages", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ department_id: departmentId, reset_stage: activeStageKey }),
            });
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Reset failed");
            setPayload(j);
            onStagesLoadedRef.current?.(j);
            const keys = new Set((j.stages[activeStageKey]?.statuses ?? []).map((s) => s.status_key));
            setDraftKeys(keys);
            setSavedKeys(keys);
            setFeedback("Reset to defaults.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Reset failed");
        } finally {
            setSaving(false);
        }
    }, [departmentId, activeStageKey, operatorStage]);

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
        <div className="space-y-2" data-testid="lifecycle-statuses-editor">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                Add or remove opportunity statuses for this stage. Saved statuses drive the Work Unit Queue filter
                automatically.
            </p>

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

            {assigned.length ? (
                <ul className="space-y-1" data-testid="enrollment-process-status-assigned">
                    {assigned.map((row) => (
                        <li
                            key={row.status_key}
                            className="flex items-center justify-between gap-2 rounded border border-alloy-forge/10 px-2 py-0.5 text-xs"
                        >
                            <span>{row.status_label}</span>
                            <button
                                type="button"
                                className="text-[10px] font-medium text-alloy-midnight/50 hover:text-red-800"
                                onClick={() => removeStatus(row.status_key)}
                                data-testid={`enrollment-process-remove-status-${row.status_key}`}
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-alloy-midnight/50">No statuses selected yet.</p>
            )}

            <select
                className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                    const v = e.target.value;
                    if (v) addStatus(v);
                    e.target.value = "";
                }}
                data-testid="enrollment-process-add-status-select"
            >
                <option value="">Add a status…</option>
                {availableToAdd.map((row) => (
                    <option key={row.status_key} value={row.status_key}>
                        {row.status_label}
                    </option>
                ))}
            </select>

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
                    disabled={saving || !payload?.stages[activeStageKey]?.has_custom_assignments}
                    onClick={() => void resetStage()}
                    data-testid="enrollment-process-statuses-reset"
                >
                    Reset
                </button>
            </div>

            <Link
                href="/adminV2/settings/statuses?entity_type=opportunities"
                className="inline-block text-[11px] font-medium text-alloy-pine hover:underline"
            >
                Create or edit status definitions
            </Link>
        </div>
    );
}
