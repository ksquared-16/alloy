"use client";

import { useMemo } from "react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import { currentWorkActivityRowKey } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActivityRowKey";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/** Two identities per stage, then a count. A busy family must not destroy the rail. */
const MAX_MARKERS_PER_STAGE = 2;

/**
 * THE BUSINESS PROCESS CARD — where this record has been, where it is, and what to do about it.
 *
 * ── IT COMPOSES; IT DOES NOT OWN ──
 *
 * Every fact arrives decided. Stages and their order come from the department lifecycle;
 * the case's stage from the operational context; participants and their stages from the
 * participation rows; work from Current Work; activity from the canonical activity projection.
 * `buildBusinessProcessCardEvidence` does that composition — this file only phrases it.
 *
 * ── THE CASE MARKER IS THE CASE'S ──
 *
 * Participant markers sit UNDER a stage; they never decide which stage is `current`. A case at Tour
 * with a child at Waitlist shows exactly that: the case marker at Tour, the child's marker at
 * Waitlist. Any other behaviour would let one child's state rewrite the family's position.
 *
 * ── PLACEMENT IS BY KEY ──
 *
 * The evidence places participants by `stageKey`. A participant it could not place is not dropped —
 * it is reported, so a missing marker looks like the gap it is instead of a smaller family.
 */
export default function BusinessProcessCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(
        () =>
            buildBusinessProcessCardEvidence(context, {
                // THE CANONICAL CARRIER. The case remains the panel subject; this only says which
                // participant is the operator's current concern. Absent is ordinary and means no
                // emphasis — never "pick one".
                selectedParticipantId: context.participantScope?.participationId ?? null,
            }),
        [context],
    );

    const viewerTimeZone = useAdminViewerTimezone();
    // The SAME canonical projection the Current Work card reads. No Process-local activity store,
    // and no separate fetch: `limit` is generous because the closed card shows no rows at all —
    // the bound belongs to the menu's height, never to the record.
    const activityItems = useMemo(
        () =>
            buildCurrentWorkActivityPreviewItemsFromContext(context, {
                timeZone: viewerTimeZone,
                limit: 25,
            }),
        [context, viewerTimeZone],
    );

    const stages = evidence.stages;
    const hasRail = stages.length > 0;

    return (
        <div className="alloy-os-process" data-business-process-card="true">
            <UniversalCard
                title={model.title}
                insight=""
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                density="compact"
                gridSpan="row"
                receded={receded}
                data-universal-card-key="business_process"
                footerAction={null}
            >
                {/* 1 · THE JOURNEY. Configured stages, the case marker, participants beneath. */}
                {hasRail ? (
                    <div className="alloy-os-process__rail" data-process-rail="true">
                        {stages.map((stage) => (
                            <div
                                key={stage.key}
                                className="alloy-os-process__rail-stage"
                                data-process-stage={stage.key}
                                data-process-stage-state={stage.state}
                            >
                                <span className="alloy-os-process__rail-node" aria-hidden />
                                <p className="alloy-os-process__rail-label">{stage.label}</p>
                                {/* Two configured slots. There is never a third. */}
                                {stage.primarySupport ? (
                                    <p className="alloy-os-process__rail-support">{stage.primarySupport}</p>
                                ) : null}
                                {stage.secondarySupport ? (
                                    <p className="alloy-os-process__rail-support">{stage.secondarySupport}</p>
                                ) : null}
                                {stage.participants.length > 0 && !evidence.participantsAligned ? (
                                    <div className="alloy-os-process__rail-participants">
                                        {visibleMarkers(stage.participants).map((p) => (
                                            <span
                                                key={p.id}
                                                className="alloy-os-process__marker"
                                                data-process-participant={p.id}
                                                data-process-participant-scoped={p.scoped ? "true" : undefined}
                                            >
                                                <CardAvatar
                                                    name={p.name}
                                                    imageUrl={p.imageUrl}
                                                    size={18}
                                                    role="child"
                                                    recordId={p.id}
                                                />
                                                <span className="alloy-os-process__marker-name">{p.firstName}</span>
                                            </span>
                                        ))}
                                        {hiddenCount(stage.participants) > 0 ? (
                                            <span className="alloy-os-process__marker-more">
                                                +{hiddenCount(stage.participants)}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}

                {/* 2 · CURRENT WORK — its own owner's answer, phrased compactly. */}
                {evidence.currentWork && !evidence.currentWork.isEmpty ? (
                    <div className="alloy-os-process__work" data-process-work="true">
                        <div className="alloy-os-process__work-main">
                            <p className="alloy-os-process__work-label">
                                Case{evidence.caseStageLabel ? ` · ${evidence.caseStageLabel}` : ""}
                            </p>
                            <p className="alloy-os-process__work-line">{evidence.currentWork.answerLine}</p>
                            {evidence.currentWork.supportingLine ? (
                                <p className="alloy-os-process__needed">{evidence.currentWork.supportingLine}</p>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {/* 3 · FOOT ROW — participants left, activity right, on one line. */}
                {evidence.selectedParticipant || activityItems.length > 0 ? (
                    <div className="alloy-os-process__foot">
                        <div className="alloy-os-process__foot-left">
                            {evidence.selectedParticipant ? (
                                <div className="alloy-os-process__scoped" data-process-scoped-participant="true">
                                    <CardAvatar
                                        name={evidence.selectedParticipant.name}
                                        imageUrl={evidence.selectedParticipant.imageUrl}
                                        size={22}
                                        role="child"
                                        recordId={evidence.selectedParticipant.id}
                                    />
                                    <span className="alloy-os-process__scoped-name">
                                        {evidence.selectedParticipant.name}
                                    </span>
                                    {evidence.selectedParticipant.stageLabel ? (
                                        <span className="alloy-os-process__participant-stage">
                                            {evidence.selectedParticipant.stageLabel}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                        <div className="alloy-os-process__foot-right">
                            {activityItems.length > 0 ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="alloy-os-process__activity-trigger"
                                            data-process-activity-trigger="true"
                                        >
                                            Recent activity
                                            <span className="alloy-os-process__activity-count">
                                                {activityItems.length}
                                            </span>
                                            <span aria-hidden="true">▾</span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        sideOffset={4}
                                        data-process-activity-menu="true"
                                        className="alloy-os-currentwork__tour-menu alloy-os-process__activity-menu"
                                    >
                                        {activityItems.map((item, index) => (
                                            <DropdownMenuItem
                                                // THE canonical owner of an activity row's identity.
                                                // Keying on label+formatted-time is the collision this
                                                // function exists to remove.
                                                key={currentWorkActivityRowKey(item, index)}
                                                className="alloy-os-currentwork__tour-menu-item alloy-os-process__activity-item"
                                            >
                                                <span className="alloy-os-currentwork__recent-activity-label">
                                                    {item.label}
                                                </span>
                                                <span className="alloy-os-currentwork__recent-activity-when">
                                                    {item.occurredAt}
                                                </span>
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuItem
                                            className="alloy-os-currentwork__tour-menu-item alloy-os-process__activity-all"
                                            data-process-activity-all="true"
                                            onSelect={() => coordination?.openFocusPanelMode?.("activity")}
                                        >
                                            View all activity →
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}

/**
 * Bounded markers — but a SCOPED participant is never the one dropped.
 *
 * The cap exists so a large family cannot destroy the rail. A scoped participant disappearing into
 * `+N` would defeat the reason the operator scoped them, so they take a visible slot and the
 * ordinary bounded identities give one up.
 */
function visibleMarkers<T extends { scoped: boolean }>(participants: readonly T[]): T[] {
    if (participants.length <= MAX_MARKERS_PER_STAGE) return [...participants];
    const scoped = participants.filter((p) => p.scoped);
    const rest = participants.filter((p) => !p.scoped);
    return [...scoped, ...rest].slice(0, MAX_MARKERS_PER_STAGE);
}

function hiddenCount(participants: readonly unknown[]): number {
    return Math.max(0, participants.length - MAX_MARKERS_PER_STAGE);
}
