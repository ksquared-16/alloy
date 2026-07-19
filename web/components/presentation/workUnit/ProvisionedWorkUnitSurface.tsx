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
import { runtimeLabelProps, PRESENTATION_RUNTIME_LABELS } from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { useCommittedFocus } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { OperationalSubjectProvider } from "@/components/presentation/workUnit/OperationalSubjectContext";
import { focusPanelSeedForSubject } from "@/lib/presentation/runtime/focusPanelSeedFromQueueRow";

export function ProvisionedWorkUnitSurface() {
    const { model, intents } = useCommittedWorkUnitSurfaceRuntime();
    const focus = useCommittedFocus();
    const committed = focus.current;

    // INSTANT-IDENTITY SEED — the committed subject's row identity, from the SAME committed queue
    // the row was rendered from. Keyed by `recordOfAttention.id`, so it re-derives on a subject
    // commit and never drifts from what the operator clicked. Feeds the Focus Panel pending header
    // so a cold open shows the family name immediately instead of the generic entity noun. Computed
    // before the commit gate below so hook order is stable; a null subject seeds nothing.
    const committedOp =
        committed?.snapshot.terminal === "operational" ? committed.snapshot : null;
    const identitySeed = useMemo(
        () =>
            focusPanelSeedForSubject(
                committedOp ? committedOp.recordOfAttention.id : null,
                model?.queue.rows,
                model?.queue.rowConfig,
            ),
        [committedOp, model?.queue.rows, model?.queue.rowConfig],
    );

    // Cannot happen: the Host mounts this only when Focus has committed. Rendering nothing is the
    // honest response to an impossible state — never a skeleton, which would BE visible construction.
    if (!model || !committed) return null;

    const snapshot = committed.snapshot;
    // The operational variant, narrowed once. Empty/error terminals carry no subject truth.
    const op = snapshot.terminal === "operational" ? snapshot : null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitSurface)}
            className="flex min-h-0 flex-1 flex-col"
            data-component="ProvisionedWorkUnitSurface"
            data-build-sha={BUILD_SHA}
            // K4 certification markers. `data-surface-ready` is always true because this component
            // only exists after commit — the harness reads it, but the runtime never consults it.
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
            // The three-state projection, exposed for certification (D4 requirement).
            data-focus-panel-scope={
                snapshot.terminal !== "error" ? snapshot.focusPanelScopeState : undefined
            }
            data-operational-at-first-sight={committed.outcome === "operational" ? "true" : "false"}
        >
            <div
                // Key by the WORK UNIT (target), NOT the full surfaceId (target::lens). A Work View
                // pill is a LENS move — same work unit, new lens — and keying by surfaceId remounted the
                // entire body (header + pills + queue + focus panel) on every pill click, so the shell
                // visibly "reloaded" as if it were a new page (Kelly). Keyed by target, a pill switch
                // keeps the header + pill strip mounted and fixed; only the model changes, so the queue
                // and Focus Panel swap in place while the chrome stays put. A real Work Unit change
                // (different target) still changes the key → the surface-enter animation still plays.
                key={committed.ref.target}
                className="motion-surface-enter-forward flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-stretch"
            >
                {/* The Focus Panel's operational truth comes from the COMMITTED SNAPSHOT — not from
                    a record VM fetch. D1 already resolved Situation/Decision/Action (U-P5/U-O4/U-O5);
                    reading them here is what makes the first visible frame operational instead of
                    "named but unresolved". */}
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
                    // COMMIT-CRITICAL Current Work — the answer OWNS this projection; the Focus Panel
                    // renders Current Work from it at commit, the drawer VM only enriches (Settlement).
                    // The published stage config + work-intent runtime travel with it so the atomic
                    // commit-critical Focus Panel renders the SAME CurrentWorkCard the resolved VM does (A).
                    stageWorkRuntime={op ? op.focusPanelStageWork?.stage_work_runtime ?? null : null}
                    publishedStageInputs={op ? op.focusPanelStageWork?.published_stage_inputs ?? null : null}
                    workIntentRuntime={op ? op.focusPanelStageWork?.work_intent_runtime ?? null : null}
                >
                    <WorkUnitSurfaceBodyFromModel model={model} intents={intents} />
                </OperationalSubjectProvider>
            </div>
        </div>
    );
}
