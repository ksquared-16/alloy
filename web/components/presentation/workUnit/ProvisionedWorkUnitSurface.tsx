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
import { useEffect, useId, useMemo, useRef } from "react";
import type { FocusPanelSummaryDocProjection } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { WorkUnitSurfaceBodyFromModel } from "@/components/presentation/workUnit/WorkUnitSurface";
import { useCommittedWorkUnitSurfaceRuntime } from "@/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime";
import { usePublishedQueueRowSlotsOverlay } from "@/lib/presentation/runtime/usePublishedQueueRowSlotsOverlay";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowPresentation,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import { runtimeLabelProps, PRESENTATION_RUNTIME_LABELS } from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { useCommittedFocus } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { OperationalSubjectProvider } from "@/components/presentation/workUnit/OperationalSubjectContext";
import { CHILD_PRIMARY_ACTION_ABSENCE_COPY } from "@/lib/runtime/provisioning/childPrimaryActionAbsenceCopy";
import { focusPanelSeedForSubject } from "@/lib/presentation/runtime/focusPanelSeedFromQueueRow";
import { hasOperatorSelectedWorkView } from "@/lib/runtime/provisioning/contextualFocusAnswer";
import { useAttentionSubject } from "@/lib/runtime/kernel/useAttentionCardFocus";

declare global {
    interface Window {
        __ALLOY_QUEUE_ROW_SURFACE_DIAG__?: Record<string, unknown>;
        __ALLOY_FOCUS_CHILD_MISSION_DIAG__?: Record<string, unknown>;
        /** Increments only when ProvisionedWorkUnitSurface mounts — lens switches must not change this. */
        __ALLOY_WU_SHELL_MOUNT_COUNT__?: number;
    }
}

export function ProvisionedWorkUnitSurface() {
    // Stable across Work View (lens) commits on the same Work Unit. `data-surface-instance` is
    // `target::lens` and MUST change with the active view; do not use it as a remount signal.
    // `useId` is SSR/client-stable (unlike Math.random in useRef/useState).
    const shellMountId = `wu-shell${useId().replace(/:/g, "")}`;
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.__ALLOY_WU_SHELL_MOUNT_COUNT__ = (window.__ALLOY_WU_SHELL_MOUNT_COUNT__ ?? 0) + 1;
    }, []);

    const { model, intents } = useCommittedWorkUnitSurfaceRuntime();
    const focus = useCommittedFocus();
    const committed = focus.current;

    const committedOp =
        committed?.snapshot.terminal === "operational" ? committed.snapshot : null;

    // The operator NAMED a record and chose no cohort. Not a degraded operational surface: the pill
    // strip renders with nothing selected, and nothing below may substitute a lens to fill the gap.
    const committedContextual =
        committed?.snapshot.terminal === "contextual" ? committed.snapshot : null;

    // The terminals that carry a chosen lens. `terminal !== "error"` USED to mean this, and stopped
    // meaning it the moment a lens-free terminal existed — `activeWorkView` is not a field of every
    // non-error answer any more. Narrowed positively so a future terminal cannot silently join the
    // "has a lens" side by not being an error.
    const committedWithLens =
        committed
        && (committed.snapshot.terminal === "operational" || committed.snapshot.terminal === "empty")
            ? committed.snapshot
            : null;

    const processKey =
        committed && committed.snapshot.terminal !== "error"
            ? committed.snapshot.businessProcess.key
            : null;
    const workViewId = committedWithLens ? committedWithLens.activeWorkView.id : null;
    const workViewKey = committedWithLens
        ? committedWithLens.activeWorkView.label.trim().toLowerCase().replace(/\s+/g, "_") || null
        : null;

    const publishedOverlay = usePublishedQueueRowSlotsOverlay({
        surfaceId: model?.queue.provenance?.surfaceId ?? null,
        processKey,
    });

    const effectiveModel = useMemo(() => {
        if (!model) return null;
        if (!publishedOverlay) return model;

        const layout = publishedOverlay.layout;
        const defaultSlots = publishedOverlay.defaultSlots;

        return {
            ...model,
            queue: {
                ...model.queue,
                rowConfig: defaultSlots,
                // Rematch every row against the freshly published layout (Default + variants).
                // Do not merge into stale D1 variant slots — those freeze pre-publish fieldKeys
                // (e.g. contact email) and ignore Default edits (children.names).
                rows: model.queue.rows.map((row) => {
                    if (!row.context) return row;
                    const input = queueRowVariantMatchInputFromContext(row.context, {
                        workViewId,
                        workViewKey,
                    });
                    if (!input.processKey && processKey) {
                        input.processKey = processKey;
                    }
                    const presentation = resolveQueueRowPresentation(layout, row.context, input);
                    return {
                        ...row,
                        rowConfig: presentation.rowConfig,
                        ...(presentation.focus ? { focus: presentation.focus } : { focus: undefined }),
                    };
                }),
            },
        };
    }, [model, publishedOverlay, processKey, workViewId, workViewKey]);

    useEffect(() => {
        if (typeof window === "undefined" || !effectiveModel) return;
        const first = effectiveModel.queue.rows[0];
        const diag = {
            editedOrResolvedSurfaceId: effectiveModel.queue.provenance?.surfaceId ?? null,
            committedResolvedSource: effectiveModel.queue.provenance?.resolvedSource ?? null,
            committedSource: effectiveModel.queue.provenance?.source ?? null,
            overlay: publishedOverlay
                ? {
                      surfaceId: publishedOverlay.surfaceId,
                      processKey: publishedOverlay.processKey,
                      source: publishedOverlay.source,
                      fetchedAt: publishedOverlay.fetchedAt,
                      defaultFieldKeys: {
                          subject: publishedOverlay.defaultSlots.subject.fieldKeys ?? [],
                          status: publishedOverlay.defaultSlots.status.fieldKeys ?? [],
                          contact: publishedOverlay.defaultSlots.contact.fieldKeys ?? [],
                          attention: publishedOverlay.defaultSlots.attention.fieldKeys ?? [],
                          work: publishedOverlay.defaultSlots.work.fieldKeys ?? [],
                          groupCount: publishedOverlay.defaultSlots.groupCount.fieldKeys ?? [],
                      },
                  }
                : null,
            activeWorkViewId: workViewId,
            processKey,
            slotsSource: publishedOverlay ? "published_overlay_rematch" : "committed_snapshot",
            queueDefaultFieldKeys: {
                subject: effectiveModel.queue.rowConfig?.subject.fieldKeys ?? [],
                status: effectiveModel.queue.rowConfig?.status.fieldKeys ?? [],
                contact: effectiveModel.queue.rowConfig?.contact.fieldKeys ?? [],
                attention: effectiveModel.queue.rowConfig?.attention.fieldKeys ?? [],
                work: effectiveModel.queue.rowConfig?.work.fieldKeys ?? [],
                groupCount: effectiveModel.queue.rowConfig?.groupCount.fieldKeys ?? [],
            },
            firstRow: first
                ? {
                      id: first.entityId,
                      entityType: first.entityType,
                      title:
                          first.context?.row_subject?.display_name
                          ?? first.context?.case_context?.display_name
                          ?? null,
                      stageKey:
                          first.context?.row_stage_key
                          ?? first.context?.drawer_open?.stage_focus_key
                          ?? null,
                      rowConfigFieldKeys: {
                          subject: first.rowConfig?.subject.fieldKeys ?? [],
                          status: first.rowConfig?.status.fieldKeys ?? [],
                          contact: first.rowConfig?.contact.fieldKeys ?? [],
                          attention: first.rowConfig?.attention.fieldKeys ?? [],
                          work: first.rowConfig?.work.fieldKeys ?? [],
                          groupCount: first.rowConfig?.groupCount.fieldKeys ?? [],
                      },
                      context: first.context
                          ? {
                                subject_type: first.context.row_subject?.subject_type ?? null,
                                subject_id: first.context.row_subject?.subject_id ?? null,
                                subject_stage_key: first.context.row_subject?.stage_key ?? null,
                                row_stage_key: first.context.row_stage_key ?? null,
                                drawer_open_entity_id: first.context.drawer_open?.entity_id ?? null,
                                drawer_open_active_subject:
                                    first.context.drawer_open?.active_subject ?? null,
                                waitlist_context: first.context.waitlist_context ?? null,
                                placement_context: first.context.placement_context ?? null,
                                display_name: first.context.row_subject?.display_name ?? null,
                            }
                          : null,
                      hasChildrenNames: Boolean(
                          first.rowConfig?.groupCount.fieldKeys?.includes("children.names"),
                      ),
                      hasContactEmail: Boolean(
                          first.rowConfig?.contact.fieldKeys?.some((k) =>
                              k === "person.email" || k === "person.primary_email" || k.includes("email"),
                          ),
                      ),
                  }
                : null,
        };
        window.__ALLOY_QUEUE_ROW_SURFACE_DIAG__ = diag;
    }, [effectiveModel, publishedOverlay, processKey, workViewId]);

    /**
     * Keyed on LIVE attention, not the committed Record of Attention.
     *
     * The seed is the instant-identity carrier, and the queue rows it reads are already on the
     * client — but keying it on `committedOp` meant it only moved when the provisioning answer
     * committed, measured at 11.9s on a row -> row switch. For eleven seconds the operator saw the
     * previous child's name over an already-acknowledged click. Attention (K1) moves on the click
     * itself, so the identity is available immediately from canonical row context.
     *
     * Falls back to the committed subject when attention names a subject this queue has no row for
     * (e.g. straight after a Work View switch), which is the pre-existing cold-open behaviour.
     */
    const attentionSubject = useAttentionSubject();
    const lastSummaryDocRef = useRef<typeof op extends never ? never : NonNullable<typeof op>["focusPanelSummaryDoc"] | null>(null);
    const identitySeed = useMemo(
        () =>
            focusPanelSeedForSubject(
                attentionSubject ?? (committedOp ? committedOp.recordOfAttention.id : null),
                effectiveModel?.queue.rows,
                effectiveModel?.queue.rowConfig,
            )
            ?? focusPanelSeedForSubject(
                committedOp ? committedOp.recordOfAttention.id : null,
                effectiveModel?.queue.rows,
                effectiveModel?.queue.rowConfig,
            ),
        [attentionSubject, committedOp, effectiveModel?.queue.rows, effectiveModel?.queue.rowConfig],
    );

    if (!effectiveModel || !committed) return null;

    const snapshot = committed.snapshot;
    const op = snapshot.terminal === "operational" ? snapshot : null;
    const contextual = snapshot.terminal === "contextual" ? snapshot : null;
    // Same terminals as `committedWithLens` above, re-narrowed off the local `snapshot` for the render.
    const withLens =
        snapshot.terminal === "operational" || snapshot.terminal === "empty" ? snapshot : null;
    // ONE reading of "did the operator select a cohort", shared by every attribute below. Deriving it
    // per-attribute is how a surface ends up claiming a lens in one place and denying it in another.
    //
    // `null` on an error terminal — genuinely undecidable there, not false. A refusal still renders the
    // pill strip from its navigation frame and can legitimately show a selected pill, so answering
    // "false" would contradict what the operator sees. Undecidable is reported by omitting the
    // attribute, never by guessing a side.
    const cohortSelected =
        snapshot.terminal === "error" ? null : hasOperatorSelectedWorkView(snapshot);
    /*
     * PROGRESSIVE AUTHORITATIVE COMMIT — identity commits now, facts commit when they are B's.
     *
     * Measured on deployed eb896a8c: the selected subject reached this provider only when the
     * hover-started provisioning answer completed (14/14 samples committed within ~2ms of it), which
     * is P50 ~1,094ms of the operator's wait, and the panel then held the PRIOR subject until the
     * new record VM was complete, a further ~1,052ms. Between them they are essentially the whole
     * J5 wait, and both are the same policy: wait for a complete answer before showing anything.
     *
     * The queue selection already knows WHICH record is selected, and the published Summary
     * composition is layout configuration for the scope rather than any record's business truth. So
     * identity and geometry can commit immediately and truthfully.
     *
     * What may NOT come early is any FACT. While the committed answer still describes the previous
     * subject, `factsOp` is null, so every fact-bearing prop below resolves to null and the panel
     * renders reserved UNKNOWN rather than the previous subject's values. That is the line this
     * repair must not cross: an early B identity over A's values would be the mixed-subject frame
     * the atomic-subject contract forbids, and is worse than the latency it removes.
     */
    const selectedSubjectId =
        attentionSubject ?? (op ? String(op.recordOfAttention.id) : null);
    const answerDescribesSelection =
        op != null && selectedSubjectId != null
        && String(op.recordOfAttention.id) === String(selectedSubjectId);
    const factsOp = answerDescribesSelection ? op : null;
    /*
     * The published composition is scope configuration, so it survives a subject change. Retaining
     * the last one is what lets the configured cells exist at commit instead of the panel waiting
     * for a layout it already has. It is never a source of business truth.
     */
    if (op?.focusPanelSummaryDoc) lastSummaryDocRef.current = op.focusPanelSummaryDoc;
    const retainedSummaryDoc = op?.focusPanelSummaryDoc ?? lastSummaryDocRef.current;

    const firstRowKeys = effectiveModel.queue.rows[0]?.rowConfig;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitSurface)}
            className="flex min-h-0 flex-1 flex-col"
            data-component="ProvisionedWorkUnitSurface"
            data-shell-instance="work-unit-shell"
            data-shell-mount-id={shellMountId}
            data-shell-target={committed.ref.target}
            data-build-sha={BUILD_SHA}
            data-surface-ready="true"
            data-surface-mode="live"
            data-commit-version={committed.commitVersion}
            data-surface-instance={committed.surfaceId}
            data-terminal-outcome={committed.outcome}
            data-attention-version={committed.ref.version}
            // ABSENT, not empty-string: an attribute that is not there cannot be read as a lens whose
            // id happens to be blank. The same for the three below — a contextual surface has no row
            // grain (no rows), no Context Frame (it was entered from no Work View), and no panel scope
            // (scope is a statement about the subject's place in a cohort).
            data-active-work-view={withLens ? withLens.activeWorkView.id : undefined}
            data-cohort-selected={cohortSelected === null ? undefined : cohortSelected ? "true" : "false"}
            data-row-grain={withLens ? withLens.rowGrain : undefined}
            data-record-of-attention={
                snapshot.terminal === "operational" ? snapshot.recordOfAttention.id : undefined
            }
            data-contextual-subject={contextual ? contextual.subject.id : undefined}
            data-contextual-aspect={
                contextual?.aspect
                    ? `${contextual.aspect.cardKey}${contextual.aspect.itemId ? `:${contextual.aspect.itemId}` : ""}`
                    : undefined
            }
            data-context-frame={withLens ? withLens.contextFrame.workViewId : undefined}
            data-queue-row-slots-source={publishedOverlay ? "published_overlay_rematch" : "committed_snapshot"}
            data-queue-surface-id={effectiveModel.queue.provenance?.surfaceId ?? undefined}
            data-queue-surface-version={publishedOverlay?.fetchedAt ?? undefined}
            data-queue-surface-variant={effectiveModel.queue.provenance?.variant ?? undefined}
            data-queue-surface-source={
                publishedOverlay?.source ?? effectiveModel.queue.provenance?.resolvedSource ?? undefined
            }
            data-queue-column-keys={
                [
                    ...(firstRowKeys?.subject.fieldKeys ?? []),
                    ...(firstRowKeys?.status.fieldKeys ?? []),
                    ...(firstRowKeys?.contact.fieldKeys ?? []),
                    ...(firstRowKeys?.attention.fieldKeys ?? []),
                    ...(firstRowKeys?.work.fieldKeys ?? []),
                    ...(firstRowKeys?.groupCount.fieldKeys ?? []),
                ].join("|") || undefined
            }
            data-queue-row-surface-id={effectiveModel.queue.provenance?.surfaceId ?? undefined}
            data-queue-row-resolved-source={
                publishedOverlay?.source ?? effectiveModel.queue.provenance?.resolvedSource ?? undefined
            }
            data-queue-row-overlay-error={publishedOverlay?.loadError ?? undefined}
            data-queue-row-has-children-names={
                firstRowKeys?.groupCount.fieldKeys?.includes("children.names") ? "true" : "false"
            }
            data-queue-row-has-contact-email={
                firstRowKeys?.contact.fieldKeys?.some((k) => k.includes("email")) ? "true" : "false"
            }
            data-focus-panel-scope={withLens ? withLens.focusPanelScopeState : undefined}
            data-operational-at-first-sight={committed.outcome === "operational" ? "true" : "false"}
        >
            <div
                key={committed.ref.target}
                className="motion-surface-enter-forward flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-stretch"
            >
                <OperationalSubjectProvider
                    // ONE Focus Panel path. The committed subject is the Record of Attention when a
                    // cohort was paged, and the NAMED subject when one was not — same panel, same
                    // provider, no second composition and no fabricated row to hang the person off.
                    subjectId={selectedSubjectId ?? (contextual ? contextual.subject.id : null)}
                    // How the subject was reached, which is what decides when the panel is resolved.
                    // A contextual subject has no stage to report, and that is an answer, not a gap.
                    attentionKind={contextual ? "contextual" : "operational"}
                    identitySeed={identitySeed}
                    situation={
                        factsOp
                            ? {
                                  stageKey: factsOp.currentBusinessState.stageKey,
                                  stageLabel: factsOp.currentBusinessState.stageLabel,
                                  purpose: factsOp.currentBusinessState.purpose,
                                  workTemplateLabel: factsOp.currentBusinessState.workTemplateLabel,
                                  required: factsOp.currentBusinessState.required,
                              }
                            : null
                    }
                    decision={
                        factsOp
                            ? {
                                  workViewId: factsOp.contextFrame.workViewId,
                                  workViewLabel: factsOp.contextFrame.workViewLabel,
                                  scopeState: factsOp.focusPanelScopeState,
                                  destinationViewId: factsOp.focusPanelOutOfView?.destinationViewId ?? null,
                                  destinationViewLabel: factsOp.focusPanelOutOfView?.destinationViewLabel ?? null,
                              }
                            : null
                    }
                    // Null when the committed subject genuinely has no configured action — a child at a
                    // stage that configures none. The panel renders that absence; it does not stand in
                    // for it, and `actionAbsence` is what keeps it from reading as "still loading".
                    action={
                        factsOp?.primaryAction
                            ? { actionRef: factsOp.primaryAction.actionRef, label: factsOp.primaryAction.label }
                            : null
                    }
                    actionAbsence={
                        factsOp && !factsOp.primaryAction && factsOp.primaryActionAbsence
                            ? {
                                  code: factsOp.primaryActionAbsence,
                                  message: CHILD_PRIMARY_ACTION_ABSENCE_COPY[factsOp.primaryActionAbsence],
                              }
                            : null
                    }
                    stageWorkRuntime={factsOp ? factsOp.focusPanelStageWork?.stage_work_runtime ?? null : null}
                    operationalProjection={factsOp ? factsOp.focusPanelOperationalProjection ?? null : null}
                    workIntentRuntime={factsOp ? factsOp.focusPanelStageWork?.work_intent_runtime ?? null : null}
                    // A — commit-critical subject identity truth (domain-declared bindings; renders identity cards meaningful at commit).
                    subjectIdentityTruth={factsOp ? factsOp.subjectIdentityTruth ?? null : null}
                    // The participation the ANSWER resolved — identity only, carried so the browser
                    // can mount the participant-scoped cards from truth it already has.
                    resolvedParticipant={factsOp ? factsOp.resolvedParticipant ?? null : null}
                    // The tour signal the ANSWER resolved. Null means NOT ESTABLISHED, never
                    // "no tour" — same object, same navigation, so it cannot drift from the
                    // participant beside it.
                    resolvedTour={factsOp ? factsOp.resolvedTour ?? null : null}
                    // R2 — the subject grain the ANSWER resolved. Threaded from the committed snapshot so
                    // the panel never infers what the subject is. A contextual answer resolves it too
                    // (from the subject's entity class rather than a lens's Row Grain), so it is carried
                    // here as well — the alternative is the panel falling back to "a committed subject
                    // is an opportunity", which is the assumption this field exists to retire.
                    subjectGrain={
                        factsOp
                            ? factsOp.subjectGrain ?? null
                            : contextual
                              ? {
                                    grain: contextual.subject.grain,
                                    subjectType: contextual.subject.subjectType,
                                }
                              : null
                    }
                    // A — the published Summary composition for the committed scope: the panel presents
                    // the PUBLISHED composition at commit, not the code default standing in for a fetch.
                    summaryDocSeed={retainedSummaryDoc}
                >
                    <WorkUnitSurfaceBodyFromModel model={effectiveModel} intents={intents} />
                </OperationalSubjectProvider>
            </div>
        </div>
    );
}
