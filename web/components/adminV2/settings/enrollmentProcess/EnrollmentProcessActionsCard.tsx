"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnrollmentProcessStageActionRow } from "@/lib/lifecycle/enrollmentProcessStageActions";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    LIFECYCLE_ACTION_PLACEMENTS,
    LIFECYCLE_BASE_ACTIONS,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

function hasActivePlacement(action: EnrollmentProcessStageActionRow): boolean {
    return action.placements.some((p) => p.placement_id && p.is_active);
}

export default function EnrollmentProcessActionsCard({
    activeStageKey,
    editable = false,
}: {
    activeStageKey: string;
    editable?: boolean;
}) {
    const operatorStage = asOperatorStageKey(activeStageKey);
    const [actions, setActions] = useState<EnrollmentProcessStageActionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [baseActionKey, setBaseActionKey] = useState<LifecycleBaseActionKey | "">("");
    const [actionLabel, setActionLabel] = useState("");
    const [selectedPlacements, setSelectedPlacements] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        if (!operatorStage) {
            setActions([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/enrollment-process/stage-actions?stage=${encodeURIComponent(operatorStage)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                actions?: EnrollmentProcessStageActionRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load actions");
            setActions((j.actions ?? []).filter(hasActivePlacement));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setActions([]);
        } finally {
            setLoading(false);
        }
    }, [operatorStage]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!baseActionKey) {
            setActionLabel("");
            return;
        }
        const base = LIFECYCLE_BASE_ACTIONS.find((b) => b.key === baseActionKey);
        if (base && !actionLabel) setActionLabel(base.label);
    }, [baseActionKey, actionLabel]);

    const togglePlacement = useCallback((id: string) => {
        setSelectedPlacements((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const saveAction = useCallback(async () => {
        if (!operatorStage || !baseActionKey || !actionLabel.trim()) return;
        if (!selectedPlacements.size) {
            setError("Select at least one placement.");
            return;
        }
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/stage-actions", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stage: operatorStage,
                    base_action_key: baseActionKey,
                    label: actionLabel.trim(),
                    placement_ids: [...selectedPlacements],
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to save action");
            setFeedback("Action saved.");
            setBaseActionKey("");
            setActionLabel("");
            setSelectedPlacements(new Set());
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save action");
        } finally {
            setSaving(false);
        }
    }, [operatorStage, baseActionKey, actionLabel, selectedPlacements, load]);

    const removePlacement = useCallback(
        async (placementId: string) => {
            if (!placementId) return;
            setRemovingId(placementId);
            setError(null);
            setFeedback(null);
            try {
                const res = await fetch(`/api/admin/action-placements/${encodeURIComponent(placementId)}`, {
                    ...workspaceDataFetchInit(),
                    method: "DELETE",
                });
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to remove");
                setFeedback("Action removed.");
                await load();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to remove");
            } finally {
                setRemovingId(null);
            }
        },
        [load]
    );

    const activeActions = useMemo(() => actions.filter(hasActivePlacement), [actions]);

    if (!operatorStage) {
        return (
            <p className="text-xs text-alloy-midnight/55">
                Actions require a platform-integrated stage key (e.g. lead, qualification).
            </p>
        );
    }

    if (loading) return <p className="text-xs text-alloy-midnight/50">Loading actions…</p>;

    return (
        <div className="space-y-3" data-testid="lifecycle-actions-editor">
            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {feedback ? <p className="text-xs text-alloy-pine">{feedback}</p> : null}

            {editable ? (
                <div className="space-y-2 rounded-md border border-alloy-forge/10 bg-alloy-stone/5 p-2" data-testid="lifecycle-add-action">
                    <label className="block text-[11px] font-medium text-alloy-midnight/60">
                        Base action
                        <select
                            className="mt-0.5 w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                            value={baseActionKey}
                            onChange={(e) => {
                                const v = e.target.value as LifecycleBaseActionKey | "";
                                setBaseActionKey(v);
                                const base = LIFECYCLE_BASE_ACTIONS.find((b) => b.key === v);
                                setActionLabel(base?.label ?? "");
                            }}
                            data-testid="lifecycle-add-action-base"
                        >
                            <option value="">Choose base action…</option>
                            {LIFECYCLE_BASE_ACTIONS.map((b) => (
                                <option key={b.key} value={b.key}>
                                    {b.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-[11px] font-medium text-alloy-midnight/60">
                        Action label
                        <input
                            type="text"
                            className="mt-0.5 w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                            placeholder="Add Parent"
                            value={actionLabel}
                            onChange={(e) => setActionLabel(e.target.value)}
                            disabled={!baseActionKey}
                            data-testid="lifecycle-add-action-label"
                        />
                    </label>
                    <fieldset className="text-[11px]">
                        <legend className="mb-1 font-medium text-alloy-midnight/60">Placements</legend>
                        <div className="flex flex-col gap-1" data-testid="lifecycle-add-action-placements">
                            {LIFECYCLE_ACTION_PLACEMENTS.map((p) => (
                                <label key={p.id} className="flex items-center gap-2 text-alloy-midnight/75">
                                    <input
                                        type="checkbox"
                                        checked={selectedPlacements.has(p.id)}
                                        onChange={() => togglePlacement(p.id)}
                                        disabled={!baseActionKey}
                                    />
                                    {p.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                        disabled={saving || !baseActionKey || !actionLabel.trim() || !selectedPlacements.size}
                        onClick={() => void saveAction()}
                        data-testid="lifecycle-add-action-submit"
                    >
                        {saving ? "Saving…" : "Save action"}
                    </button>
                </div>
            ) : null}

            {!activeActions.length ? (
                <p className="text-xs text-alloy-midnight/55" data-testid="lifecycle-actions-empty">
                    No actions for this stage yet.
                </p>
            ) : (
                <ul className="space-y-2" data-testid="lifecycle-actions-list">
                    {activeActions.map((action) => (
                        <li
                            key={action.key + action.label}
                            className="rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5 text-xs"
                            data-testid={`lifecycle-action-${action.key}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <span className="font-medium text-alloy-midnight">{action.label}</span>
                                    {action.base_action_label ? (
                                        <p className="text-[10px] text-alloy-midnight/55">
                                            Base action: {action.base_action_label}
                                        </p>
                                    ) : null}
                                    <p className="text-[10px] text-alloy-midnight/55">
                                        Appears in:{" "}
                                        {action.placements
                                            .filter((p) => p.placement_id)
                                            .map((p) => p.placement_label)
                                            .join(", ")}
                                    </p>
                                </div>
                                {editable ? (
                                    <button
                                        type="button"
                                        className="shrink-0 text-[10px] font-medium text-alloy-midnight/50 hover:text-red-800"
                                        disabled={removingId != null}
                                        onClick={() => {
                                            const pid = action.placements.find((p) => p.placement_id)?.placement_id;
                                            if (pid) void removePlacement(pid);
                                        }}
                                        data-testid={`lifecycle-remove-action-${action.key}`}
                                    >
                                        Remove
                                    </button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <p className="text-[10px] text-alloy-midnight/45">
                Advanced:{" "}
                <Link href="/adminV2/settings/actions?entity_type=opportunity" className="text-alloy-pine hover:underline">
                    Action Buttons
                </Link>
            </p>
        </div>
    );
}
