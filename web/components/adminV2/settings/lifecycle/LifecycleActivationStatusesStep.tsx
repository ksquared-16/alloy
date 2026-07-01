"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    collectAllOpportunityStatusRows,
    statusKeySetsEqual,
} from "@/lib/lifecycle/lifecycleActivationStep3";
export default function LifecycleActivationStatusesStep({
    payload,
    loading,
    stageKey,
    draftKeys,
    savedKeys,
    error,
    canSaveStatuses,
    onToggleStatus,
}: {
    payload: EnrollmentStatusStagesPayload | null;
    loading: boolean;
    stageKey: string;
    draftKeys: Set<string>;
    savedKeys: Set<string>;
    error: string | null;
    canSaveStatuses: boolean;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
}) {
    const dirty = useMemo(() => !statusKeySetsEqual(draftKeys, savedKeys), [draftKeys, savedKeys]);
    const allRows = useMemo(() => collectAllOpportunityStatusRows(payload), [payload]);

    if (loading) {
        return (
            <div className="space-y-2" data-testid="lifecycle-activation-statuses-loading">
                <div className="h-8 animate-pulse rounded-md bg-alloy-forge/10" />
                <div className="h-8 animate-pulse rounded-md bg-alloy-forge/10" />
                <div className="h-8 animate-pulse rounded-md bg-alloy-forge/10" />
            </div>
        );
    }

    if (!allRows.length) {
        return (
            <div className="space-y-2" data-testid="lifecycle-activation-statuses-empty">
                <p className="text-xs text-alloy-midnight/60">
                    No statuses exist yet for this record type.
                </p>
                <Link
                    href="/admin/settings/statuses?entity_type=opportunities"
                    className="inline-flex rounded-md border border-alloy-pine/30 bg-alloy-pine/5 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/10"
                    data-testid="lifecycle-activation-create-status"
                >
                    Create status
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-2" data-testid="lifecycle-activation-statuses-editor">
            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <ul className="space-y-1" data-testid="lifecycle-activation-status-list">
                {allRows.map((row) => {
                    const checked = draftKeys.has(row.status_key);
                    return (
                        <li key={row.status_key}>
                            <label className="flex cursor-pointer items-center gap-2 rounded border border-alloy-forge/10 px-2 py-1 text-xs hover:bg-alloy-stone/5">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => onToggleStatus(row.status_key, e.target.checked)}
                                    data-testid={`lifecycle-activation-status-${row.status_key}`}
                                />
                                <span>{row.status_label}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>

            {draftKeys.size === 0 ? (
                <p className="text-xs text-amber-800" data-testid="lifecycle-activation-statuses-hint">
                    Select at least one status to continue.
                </p>
            ) : dirty ? (
                <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-activation-statuses-unsaved">
                    Unsaved selection — use Save &amp; continue to persist.
                </p>
            ) : (
                <p className="text-[10px] text-alloy-pine" data-testid="lifecycle-activation-statuses-saved">
                    Statuses saved for this stage.
                </p>
            )}

            <Link
                href="/admin/settings/statuses?entity_type=opportunities"
                className="inline-block text-[11px] font-medium text-alloy-pine hover:underline"
            >
                Create or edit status definitions
            </Link>
        </div>
    );
}
