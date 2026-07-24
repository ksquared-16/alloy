"use client";

/**
 * The Work Unit surface, rendered from committed Focus.
 *
 * Governing: alloy-runtime-kernel.md §K3 — "Focus … hands Presentation the committed world to render.
 * Presentation never asks Focus for permission and never tells Focus it is ready."
 *
 * This is deliberately tiny. It is mounted ONLY when K3 has committed a Work Unit, so there is no
 * cold shell, no skeleton, and no readiness gate to consult: the first frame it ever renders is
 * already operational. `WorkUnitSurfaceBody` is the SAME canonical presentation tree the old runtime
 * used — the difference is where its model comes from, not what renders it.
 */
import { useMemo } from "react";
import { WorkUnitSurfaceBodyFromModel } from "@/components/presentation/workUnit/WorkUnitSurface";
import { useCommittedWorkUnitSurfaceRuntime } from "@/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime";
import { usePublishedQueueRowSlotsOverlay } from "@/lib/presentation/runtime/usePublishedQueueRowSlotsOverlay";
import { mergeCompactSlotsInheritDefault } from "@/lib/presentation/runtime/mergeCompactSlotsInheritDefault";
import { runtimeLabelProps, PRESENTATION_RUNTIME_LABELS } from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { useCommittedFocus } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { OperationalSubjectProvider } from "@/components/presentation/workUnit/OperationalSubjectContext";
import { focusPanelSeedForSubject } from "@/lib/presentation/runtime/focusPanelSeedFromQueueRow";

export function ProvisionedWorkUnitSurface() {
    const { model, intents } = useCommittedWorkUnitSurfaceRuntime();
    const focus = useCommittedFocus();
    const committed = focus.current;

    const committedOp =
        committed?.snapshot.terminal === "operational" ? committed.snapshot : null;

    const publishedSlots = usePublishedQueueRowSlotsOverlay({
        surfaceId: model?.queue.provenance?.surfaceId ?? null,
        processKey: null,
    });

    const effectiveModel = useMemo(() => {
        if (!model) return null;
        if (!publishedSlots) return model;
        return {
            ...model,
            queue: {
                ...model.queue,
                rowConfig: publishedSlots,
                // Per-row variant overrides must inherit freshly published Default slots
                // (children.names/count, contact, work) — otherwise a stale matched variant
                // keeps wiping Default after Surface Builder publish.
                rows: model.queue.rows.map((row) =>
                    row.rowConfig
                        ? {
                              ...row,
                              rowConfig: mergeCompactSlotsInheritDefault(row.rowConfig, publishedSlots),
                          }
                        : row,
                ),
            },
        };
    }, [model, publishedSlots]);

    const identitySeed = useMemo(
        () =>
            focusPanelSeedForSubject(
                committedOp ? committedOp.recordOfAttention.id : null,
                effectiveModel?.queue.rows,
                effectiveModel?.queue.rowConfig,
            ),
        [committedOp, effectiveModel?.queue.rows, effectiveModel?.queue.rowConfig],
    );

    if (!effectiveModel || !committed) return null;

    const snapshot = committed.snapshot;
    const op = snapshot.terminal === "operational" ? snapshot : null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitSurface)}
            className="flex min-h-0 flex-1 flex-col"
            data-component="ProvisionedWorkUnitSurface"
            data-build-sha={BUILD_SHA}
            data-surface-ready="true"
            data-surface-mode="live"
            data-commit-version={committed.commitVersion}
            data-surface-instance={committed.surfaceId}
            data-terminal-outcome={committed.outcome}
            data-attention-version={committed.ref.version}
            data-active-work-view={snapshot.terminal !== "error" ? snapshot.activeWorkView.id : undefined}
            data-row-grain={snapshot.terminal !== "error" ? snapshot.rowGrain : undefined}
            data-record-of-attention={
                snapshot.terminal === "operational" ? snapshot.recordOfAttention.id : undefined
            }
            data-context-frame={snapshot.terminal !== "error" ? snapshot.contextFrame.workViewId : undefined}
            data-queue-row-slots-source={publishedSlots ? "published_overlay" : "committed_snapshot"}
            data-focus-panel-scope={
                snapshot.terminal !== "error" ? snapshot.focusPanelScopeState : undefined
            }
            data-operational-at-first-sight={committed.outcome === "operational" ? "true" : "false"}
        >
            <div
                key={committed.ref.target}
                className="motion-surface-enter-forward flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-stretch"
            >
                <OperationalSubjectProvider
                    subjectId={op ? op.recordOfAttention.id : null}
                    identitySeed={identitySeed}
                    situation={
                        op
                            ? {
                                  stageKey: op.currentBusinessState.stageKey,
                                  stageLabel: op.currentBusinessState.stageLabel,
                                  purpose: op.currentBusinessState.purpose,
                                  workTemplateLabel: op.currentBusinessState.workTemplateLabel,
                                  required: op.currentBusinessState.required,
                              }
                            : null
                    }
                    decision={
                        op
                            ? {
                                  workViewId: op.contextFrame.workViewId,
                                  workViewLabel: op.contextFrame.workViewLabel,
                                  scopeState: op.focusPanelScopeState,
                              }
                            : null
                    }
                    action={op ? { actionRef: op.primaryAction.actionRef, label: op.primaryAction.label } : null}
                    stageWorkRuntime={op ? op.focusPanelStageWork?.stage_work_runtime ?? null : null}
                    publishedStageInputs={op ? op.focusPanelStageWork?.published_stage_inputs ?? null : null}
                    workIntentRuntime={op ? op.focusPanelStageWork?.work_intent_runtime ?? null : null}
                    subjectSnapshot={op ? op.focusPanelSubjectSnapshot ?? null : null}
                    summaryDocSeed={op ? op.focusPanelSummaryDoc ?? null : null}
                >
                    <WorkUnitSurfaceBodyFromModel model={effectiveModel} intents={intents} />
                </OperationalSubjectProvider>
            </div>
        </div>
    );
}
