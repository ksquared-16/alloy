"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { EnrollmentProcessStageActionRow } from "@/lib/lifecycle/enrollmentProcessStageActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function EnrollmentProcessActionsCard({ activeStage }: { activeStage: LifecycleOperatorStage }) {
    const [actions, setActions] = useState<EnrollmentProcessStageActionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/enrollment-process/stage-actions?stage=${encodeURIComponent(activeStage)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                actions?: EnrollmentProcessStageActionRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load actions");
            setActions(j.actions ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setActions([]);
        } finally {
            setLoading(false);
        }
    }, [activeStage]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <p className="text-xs text-alloy-midnight/50">Loading actions…</p>;
    if (error) {
        return (
            <p className="text-xs text-red-700" role="alert">
                {error}
            </p>
        );
    }

    if (!actions.length) {
        return (
            <p className="text-xs text-alloy-midnight/55" data-testid="enrollment-process-actions-empty">
                No opportunity actions are cataloged for this stage.
            </p>
        );
    }

    return (
        <ul className="space-y-2" data-testid="enrollment-process-actions-list">
            {actions.map((action) => (
                <li
                    key={action.key}
                    className="rounded-md border border-alloy-forge/10 bg-white/80 px-2 py-1.5 text-xs"
                    data-testid={`enrollment-process-action-${action.key}`}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-alloy-midnight">{action.label}</span>
                        <span
                            className={
                                action.definition_active
                                    ? "text-alloy-pine/90"
                                    : "text-alloy-midnight/40"
                            }
                        >
                            {action.definition_active ? "Active" : "Inactive"}
                        </span>
                    </div>
                    {action.operational_note ? (
                        <p className="mt-0.5 text-[10px] text-amber-900/75">{action.operational_note}</p>
                    ) : null}
                    <ul className="mt-1 space-y-0.5 text-[11px] text-alloy-midnight/55">
                        {action.placements.map((p) => (
                            <li key={`${action.key}-${p.placement_label}`}>{p.placement_label}</li>
                        ))}
                    </ul>
                </li>
            ))}
            <li>
                <Link
                    href="/adminV2/settings/actions?entity_type=opportunity"
                    className="text-xs font-medium text-alloy-pine hover:underline"
                >
                    Action Buttons
                </Link>
            </li>
        </ul>
    );
}
