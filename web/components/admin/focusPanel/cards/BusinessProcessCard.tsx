"use client";

import { useCallback, useEffect, useMemo } from "react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { adaptBusinessProcessEvidenceToProcessCard } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import {
    projectProcessCardCommands,
    type ProcessCardCommand,
} from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import {
    logProcessCardCommandDrift,
    logProcessCardCommandWithheld,
} from "@/lib/adminV2/runtime/diagnostics/processCardCommandDiagnostics";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import ProcessCard from "@/components/operationalCards/ProcessCard";
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
    // The SAME canonical projection the Focus Panel activity mode reads. No Process-local activity
    // store and no separate fetch.
    const activity = useMemo(
        () =>
            buildCurrentWorkActivityPreviewItemsFromContext(context, {
                timeZone: viewerTimeZone,
                limit: 25,
            }),
        [context, viewerTimeZone],
    );

    /*
     * THE COMMANDS THE PUBLISHED PROCESS CONFIGURED — and emphatically not the record-header list.
     *
     * This card read `context.recordHeaderActions`: the registry's generic record-header slots,
     * resolved from what is executable for the record. Nothing in that list is aware of the
     * published Business Process, so the card offered commands the configuration never selected,
     * in the registry's order, with emphasis this file invented (`i === 0`). The two
     * responsibilities were reversed — the platform was choosing the set, and the configuration was
     * not consulted at all.
     *
     * `projectProcessCardCommands` restores the boundary: the published revision decides WHICH
     * commands and in WHAT ORDER, and the action/capability platform decides whether each one can
     * run right now. Both verdicts arrive decided; this file adds neither.
     */
    const projection = useMemo(() => projectProcessCardCommands(context), [context]);

    /*
     * EXECUTION IS THE SHARED HOST'S. The card plans through the platform's own planner and hands
     * the result to the existing chrome — the Current Work command workspace for capability
     * surfaces, the record command host for registry-resolved actions. There is no Process-specific
     * command panel, and no key-switching here: `planCurrentWorkActionExecution` owns that.
     */
    const invoke = useCallback(
        (command: ProcessCardCommand) => {
            const plan = planCurrentWorkActionExecution(command.action);
            switch (plan.kind) {
                case "blocked":
                case "unsupported":
                    // Already rendered as unavailable with this reason. Never substitute another command.
                    return;
                case "record_outcome":
                    coordination?.openCurrentWorkWorkspace?.({ kind: "record_outcome" });
                    return;
                case "communications_composer": {
                    const composer = coordination?.resolveCommunicationsComposerAction?.() ?? null;
                    if (composer) coordination?.invokeHeaderAction?.(composer);
                    return;
                }
                case "header_delegate": {
                    const resolved = plan.action.resolved;
                    if (resolved) {
                        coordination?.invokeHeaderAction?.(resolved);
                        return;
                    }
                    coordination?.openCurrentWorkWorkspace?.({ kind: "action", actionKey: command.key });
                    return;
                }
                default:
                    // The shared command workspace resolves the SAME configured command by identity.
                    coordination?.openCurrentWorkWorkspace?.({ kind: "action", actionKey: command.key });
            }
        },
        [coordination],
    );

    const actions = useMemo(
        () =>
            projection.commands.map((command) => ({
                key: command.key,
                label: command.label,
                primary: command.prominence === "primary",
                disabled: command.status !== "executable",
                disabledReason: command.unavailableReason,
                onInvoke: () => invoke(command),
            })),
        [projection.commands, invoke],
    );

    /*
     * DRIFT IS REPORTED, NEVER RENDERED. A configured command whose action is no longer registered
     * would otherwise vanish silently and read as "the process configures nothing" — a different
     * and false statement. It stays off the card face (an operator must never read a platform
     * limitation as a command) and becomes an observable configuration fault instead.
     */
    useEffect(() => {
        const processKey = context.businessProcess.key ?? null;
        const stageKey = context.businessProcess.stageKey ?? null;
        for (const row of projection.drift) {
            logProcessCardCommandDrift({ processKey, stageKey, ...row });
        }
        // Not a fault: an executable command configuration did not select. Recorded so "the row is
        // exactly what was configured" stays checkable rather than merely asserted.
        for (const row of projection.withheld) {
            logProcessCardCommandWithheld({ processKey, stageKey, ...row });
        }
    }, [projection.drift, projection.withheld, context.businessProcess.key, context.businessProcess.stageKey]);

    const processEvidence = useMemo(
        () =>
            adaptBusinessProcessEvidenceToProcessCard({
                evidence,
                subjectLabel: context.subject?.label ?? null,
                // `occurredAt` is already the formatted, viewer-timezone string the previous card
                // rendered; the locked component calls that field `when`.
                activity: activity.map((a) => ({ id: a.id ?? null, label: a.label, when: a.occurredAt ?? "" })),
                actions,
            }),
        [evidence, context.subject?.label, activity, actions],
    );

    /*
     * ONE PRESENTATION. This file no longer draws a card — it supplies canonical evidence to the
     * locked component the design lab renders from fixtures. Maintaining a production approximation
     * beside the approved specimen is what QA failed, and the only way that cannot recur is for
     * there to be nothing here to drift.
     */
    return (
        <ProcessCard
            evidence={processEvidence}
            receded={receded}
            fallbackTitle={model.title}
            onViewAllActivity={() => coordination?.openFocusPanelMode?.("activity")}
        />
    );
}
