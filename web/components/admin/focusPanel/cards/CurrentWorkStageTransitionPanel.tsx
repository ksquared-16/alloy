"use client";

import { useCallback, useEffect, useState } from "react";

import { StageTransitionReconciliationDialog } from "@/components/workIntent/StageTransitionReconciliationDialog";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import {
    STAGE_TRANSITION_RECONCILIATION_REQUIRED_ERROR,
    type StageTransitionReconciliationPreflight,
} from "@/lib/lifecycle/stageTransitionReconciliationTypes";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

type Props = {
    action: CurrentWorkActionVM;
    opportunityId: string;
    nextStatusKey: string;
    onClose: () => void;
    onComplete: () => void;
};

/**
 * Canonical process transition runner for Current Work Other Transitions.
 * Uses the same preflight + reconciliation + PATCH path as the drawer status control.
 */
export default function CurrentWorkStageTransitionPanel({
    action,
    opportunityId,
    nextStatusKey,
    onClose,
    onComplete,
}: Props) {
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [preflight, setPreflight] = useState<StageTransitionReconciliationPreflight | null>(null);
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    /*
     * CANONICAL LIFECYCLE BOUNDARY, not the generic record PATCH.
     *
     * This panel used to send `status_key` to `PATCH /api/admin/opportunities/[id]`, because that route
     * was the only one that could reconcile the work being left behind. That reconciliation now lives
     * in the canonical transition execution, so the configured transition reference goes to the server
     * and the server decides what it means: ref -> current-stage-scoped resolution -> typed destination
     * -> enrollment.decide -> transition policy -> reconciliation -> outcome execution.
     *
     * The panel no longer names a lifecycle field at all. It sends the operator's intent and, when
     * asked, the operator's reconciliation answers.
     */
    const executeTransition = useCallback(
        async (
            configuredRef: string,
            reconciliation?: {
                work: Array<{ work_id: string; resolution: "completed" | "skipped" | "carry_forward" }>;
                attention?: "cleared" | "carry_forward";
            },
        ) => {
            const res = await fetch("/api/admin/enrollment-status-transition/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    opportunity_id: opportunityId,
                    configured_transition_ref: configuredRef,
                    source_surface: "opportunity_drawer",
                    ...(reconciliation ? { stage_transition_reconciliation: reconciliation } : {}),
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                stage_transition_reconciliation_preflight?: StageTransitionReconciliationPreflight;
            };
            if (res.status === 409 && json.error === STAGE_TRANSITION_RECONCILIATION_REQUIRED_ERROR) {
                return {
                    ok: false as const,
                    reconciliationRequired: true as const,
                    preflight: json.stage_transition_reconciliation_preflight ?? null,
                };
            }
            if (!res.ok) throw new Error(json.error ?? "Transition failed");
            return { ok: true as const };
        },
        [opportunityId],
    );

    const finishOk = useCallback(() => {
        dispatchOpportunityDrawerRecordPatch(opportunityId, {});
        onComplete();
    }, [onComplete, opportunityId]);

    /*
     * One attempt. The canonical endpoint answers 409 with the preflight when the operator still owes
     * a reconciliation decision, so the separate preflight round-trip this panel used to make is gone —
     * there is one source of that answer now instead of two that could disagree.
     */
    const runTransition = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await executeTransition(nextStatusKey);
            if (!result.ok && result.reconciliationRequired && result.preflight) {
                setPendingKey(nextStatusKey);
                setPreflight(result.preflight);
                setBusy(false);
                return;
            }
            finishOk();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Transition failed");
            setBusy(false);
        }
    }, [executeTransition, finishOk, nextStatusKey]);

    useEffect(() => {
        void runTransition();
    }, [runTransition]);

    return (
        <aside
            className="alloy-os-currentwork__action-panel"
            data-work-action-panel="true"
            data-work-action-panel-key={action.key}
            data-work-action-surface="process_transition"
            aria-label={`${action.label} transition`}
        >
            <div className="alloy-os-currentwork__action-panel-header">
                <div>
                    <p className="alloy-os-currentwork__action-panel-eyebrow">Other transition</p>
                    <h3 className="alloy-os-currentwork__action-panel-title">{action.label}</h3>
                    {action.description ?
                        <p className="alloy-os-currentwork__action-panel-desc">{action.description}</p>
                    :   null}
                </div>
                <button
                    type="button"
                    className="alloy-os-currentwork__action-panel-close"
                    onClick={onClose}
                    aria-label="Close transition"
                    data-work-action-panel-close="true"
                >
                    Close
                </button>
            </div>

            {busy && !preflight ?
                <p className="alloy-os-household__row-detail">Checking transition requirements…</p>
            :   null}
            {error ?
                <p className="alloy-os-currentwork__error" role="alert">
                    {error}
                </p>
            :   null}

            {preflight && pendingKey ?
                <StageTransitionReconciliationDialog
                    open
                    preflight={preflight}
                    saving={busy}
                    onCancel={() => {
                        setPreflight(null);
                        setPendingKey(null);
                        onClose();
                    }}
                    onContinue={(reconciliation) => {
                        void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                const result = await executeTransition(pendingKey, reconciliation);
                                if (!result.ok) {
                                    throw new Error("Transition still requires reconciliation.");
                                }
                                finishOk();
                            } catch (err) {
                                setError(err instanceof Error ? err.message : "Transition failed");
                                setBusy(false);
                            }
                        })();
                    }}
                />
            :   null}
        </aside>
    );
}
