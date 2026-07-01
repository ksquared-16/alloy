"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { collectAllOpportunityStatusRows, statusKeySetsEqual } from "@/lib/lifecycle/lifecycleActivationStep3";
import {
    resolveLifecycleStatusRowToggleSelected,
    type LifecycleStatusesSaveState,
} from "@/lib/lifecycle/lifecycleStatusesCardState";

type StatusOptionRow = {
    status_key: string;
    status_label: string;
};

export default function LifecycleStatusesCard({
    payload,
    statusOptionRows,
    statusesSettingsHref = "/admin/settings/statuses?entity_type=opportunities",
    loading,
    saving,
    saveState,
    savedKeys,
    error,
    onToggleStatus,
}: {
    payload: EnrollmentStatusStagesPayload | null;
    /** Stage-scoped vocabulary from bootstrap (lead vs enrollment status entity). */
    statusOptionRows?: readonly StatusOptionRow[] | null;
    statusesSettingsHref?: string;
    loading: boolean;
    saving?: boolean;
    saveState: LifecycleStatusesSaveState;
    savedKeys: readonly string[];
    error: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
}) {
    const draftKeys = saveState.saveDraftKeys;
    const draftKeySet = useMemo(() => new Set(draftKeys), [draftKeys]);
    const savedKeySet = useMemo(() => new Set(savedKeys), [savedKeys]);
    const dirty = useMemo(
        () => !statusKeySetsEqual(draftKeySet, savedKeySet),
        [draftKeySet, savedKeySet]
    );
    const allRows = useMemo(() => {
        if (statusOptionRows != null) {
            return statusOptionRows.map((row) => ({
                status_key: row.status_key,
                status_label: row.status_label,
            }));
        }
        return collectAllOpportunityStatusRows(payload);
    }, [payload, statusOptionRows]);
    const inputDisabled = loading || Boolean(saving);

    const activateStatusRow = (statusKey: string, currentlyChecked: boolean) => {
        if (inputDisabled) return;
        const selected = resolveLifecycleStatusRowToggleSelected(currentlyChecked);
        onToggleStatus(statusKey, selected);
    };

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
                    {statusOptionRows != null
                        ? "No enrollment statuses are configured for this stage."
                        : "No statuses exist yet for this record type."}
                </p>
                <Link
                    href={statusesSettingsHref}
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
                    const optionKey = row.status_key;
                    const checked = draftKeySet.has(optionKey);
                    return (
                        <li key={optionKey}>
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={checked}
                                disabled={inputDisabled}
                                className={`flex w-full cursor-pointer items-center gap-2 rounded border border-alloy-forge/10 px-2 py-1 text-left text-xs hover:bg-alloy-stone/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alloy-pine/40 disabled:cursor-not-allowed disabled:opacity-60 ${
                                    checked ? "border-alloy-pine/35 bg-alloy-pine/5" : ""
                                }`}
                                data-testid={`lifecycle-activation-status-row-${optionKey}`}
                                data-status-key={optionKey}
                                onClick={() => activateStatusRow(optionKey, checked)}
                            >
                                <input
                                    type="checkbox"
                                    readOnly
                                    tabIndex={-1}
                                    className="pointer-events-none shrink-0"
                                    checked={checked}
                                    disabled={inputDisabled}
                                    aria-hidden
                                    data-testid={`lifecycle-activation-status-${optionKey}`}
                                    data-checked={checked ? "true" : "false"}
                                />
                                <span>{row.status_label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {draftKeys.length === 0 ? (
                <p className="text-xs text-amber-800" data-testid="lifecycle-activation-statuses-hint">
                    Select at least one status to continue.
                </p>
            ) : dirty ? (
                <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-activation-statuses-unsaved">
                    Unsaved selection — use Save stage to persist.
                </p>
            ) : (
                <p className="text-[10px] text-alloy-pine" data-testid="lifecycle-activation-statuses-saved">
                    Statuses saved for this stage.
                </p>
            )}

            <Link
                href={statusesSettingsHref}
                className="inline-block text-[11px] font-medium text-alloy-pine hover:underline"
            >
                Create or edit status definitions
            </Link>
        </div>
    );
}
