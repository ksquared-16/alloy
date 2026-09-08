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
import {
    adaptBusinessProcessEvidenceToProcessCard,
    type ProcessCardActionInput,
} from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import {
    projectProcessCardCommands,
    type ProcessCardCommand,
} from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import { resolveTourCommandPresentation } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveTourCommandPresentation";
import {
    logProcessCardCommandDrift,
    logProcessCardCommandWithheld,
    logProcessCardCommandProjection,
} from "@/lib/adminV2/runtime/diagnostics/processCardCommandDiagnostics";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { warmCurrentWorkCapabilityOnIntent } from "@/lib/adminV2/runtime/focusPanel/currentWork/warmCurrentWorkCapabilities";
import ProcessCard from "@/components/operationalCards/ProcessCard";
import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import { currentWorkActivityRowKey } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActivityRowKey";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    mutation?: FocusPanelMutation;
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
export default function BusinessProcessCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
}: Props) {
    /*
     * THE SHARED COMMAND WORKSPACE, HOSTED WHERE THE CARD NOW LIVES.
     *
     * A configured command that opens a capability asks the platform for its command workspace.
     * That workspace is a presentation of the Current Work card — and this card SUPERSEDES it, so
     * a published layout composes no `current_work` cell and the request had nowhere to land:
     * "Reschedule Tour" opened nothing at all. Rendering the shared component here is what makes
     * the existing chrome reachable again. It is emphatically not a Process-specific panel — it is
     * the same component, with the same capability hosts and the same dismiss behaviour.
     */
    if (coordination?.currentWorkWorkspace?.open) {
        return (
            <CurrentWorkCard
                model={model}
                context={context}
                coordination={coordination}
                mutation={mutation}
                presentation="workspace"
            />
        );
    }
    return (
        <BusinessProcessSummary
            model={model}
            context={context}
            receded={receded}
            coordination={coordination}
        />
    );
}

function BusinessProcessSummary({ model, context, receded = false, coordination }: Props) {
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
                case "communications_composer":
                    /*
                     * LAUNCHER SELECTION MAY CHANGE HOW A COMMAND IS PRESENTED. IT MUST NEVER
                     * CHANGE WHICH COMMAND IS INVOKED.
                     *
                     * This branch used to drop the configured command and call
                     * `resolveCommunicationsComposerAction()`, which returns the FIRST
                     * record-header action whose key, label or description matches a broad
                     * outreach regex. So a configured `send_tour_invitation` was executed as
                     * whatever generic outreach action happened to match first — normally
                     * `quick_message` — and the operator landed in a blank Compose New with the
                     * tour, the invitation and the prepared draft all thrown away.
                     *
                     * Nothing was missing underneath. Carrying the identity into the shared
                     * command workspace reaches the canonical path Current Work already uses:
                     * the workspace matches the action by `key` / `actionRef` / `handlerKey`,
                     * `CurrentWorkActionPanel` hosts the composer for THAT action, and
                     * `applyRegistryResolvedActionClient` runs it with `mode: "prepare"` —
                     * minting and rendering the invitation without sending — before opening the
                     * contextual composer with opportunity, recipient, subject, body and
                     * invitation id.
                     *
                     * This is deliberately the same call the `default` branch makes. Every other
                     * branch already carried `command.key` or `plan.action`; this was the one
                     * that did not, and identifying an executable action by its label is exactly
                     * what `resolveCurrentWorkActionSurface` and `projectProcessCardCommands`
                     * both say must never happen.
                     */
                    coordination?.openCurrentWorkWorkspace?.({ kind: "action", actionKey: command.key });
                    return;
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

    /*
     * ONE TOUR CONCEPT INSTEAD OF FOUR LOOSE COMMANDS.
     *
     * The configured Tour capabilities were rendered as unrelated buttons, so a scheduled tour
     * still offered "Schedule Tour" next to "Cancel Tour" and the operator had to infer the state
     * from which buttons happened to be present. Current Work already grouped them through
     * `partitionTourGroupedActions`; the Process card simply never asked.
     *
     * It asks now, through the SAME partition — no second notion of which commands are Tour
     * commands — and `resolveTourCommandPresentation` supplies the one thing neither surface had:
     * a label carrying the current state, branched on the canonical `statusKey` rather than on
     * any rendered string.
     *
     * Grouping is presentation only. Nothing here adds, removes, reorders or enables a command:
     * the set and its order are still exactly what `projectProcessCardCommands` returned, and the
     * primary command keeps its emphasis whether or not it sits inside the group.
     */
    const tourPresentation = useMemo(
        () =>
            resolveTourCommandPresentation(projection.commands, context.signals.tour, {
                timeZone: viewerTimeZone,
            }),
        [projection.commands, context.signals.tour, viewerTimeZone],
    );

    /*
     * WARM ON INTENT, SO THE CLICK LANDS ON SOMETHING ALREADY THERE.
     *
     * Send Tour Invitation opens through a prepare step that mints the invitation and renders the
     * template before the composer has anything to show — seconds of "Preparing tour invitation…"
     * if it starts at the click. Current Work has always warmed its capabilities on intent through
     * `warmCurrentWorkCapabilityOnIntent`; the Process card, which is where an operator actually
     * clicks, never reported the gesture, so every command it launched started cold.
     *
     * This is the SAME dispatcher, keyed on the resolved interaction host — no Tour-specific
     * preloading here, and nothing this card knows about what any command needs. Intent is hover
     * or keyboard focus, never render: prepare mints a real invitation, so it must follow a gesture
     * the operator actually made.
     */
    const warmCommand = useCallback(
        (command: ProcessCardCommand) => warmCurrentWorkCapabilityOnIntent(command.action, context),
        [context],
    );

    const actions = useMemo<ProcessCardActionInput[]>(() => {
        const toInput = (command: ProcessCardCommand): ProcessCardActionInput => ({
            key: command.key,
            label: command.label,
            primary: command.prominence === "primary",
            disabled: command.status !== "executable",
            disabledReason: command.unavailableReason,
            onInvoke: () => invoke(command),
            onIntent: () => warmCommand(command),
        });

        if (!tourPresentation.grouped) return projection.commands.map(toInput);

        // The group takes the position of the first Tour command, so configuration's ordering
        // survives collapsing: a Tour concept configured second stays second.
        const firstTourIndex = projection.commands.findIndex((c) => tourPresentation.tour.includes(c));
        const grouped: ProcessCardActionInput = {
            key: "tour",
            label: tourPresentation.label ?? "Tour",
            // The control leads only if configuration gave one of its members the lead.
            primary: tourPresentation.tour.some((c) => c.prominence === "primary"),
            // Executable when any member is; the members carry their own verdicts.
            disabled: tourPresentation.tour.every((c) => c.status !== "executable"),
            disabledReason: null,
            // Reaching the group IS intent toward its members — the menu item is one hover away,
            // and the member commands are the ones carrying a prepare step.
            onIntent: () => tourPresentation.tour.forEach(warmCommand),
            menu: tourPresentation.tour.map(toInput),
        };

        const out: ProcessCardActionInput[] = [];
        projection.commands.forEach((command, index) => {
            if (tourPresentation.tour.includes(command)) {
                if (index === firstTourIndex) out.push(grouped);
                return;
            }
            out.push(toInput(command));
        });
        return out;
    }, [projection.commands, invoke, tourPresentation, warmCommand]);

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
        // Both halves together: what configuration named, and what the row became.
        const psi = context.publishedStageInputs as
            | { operatingPlan?: { work_templates?: Array<Record<string, unknown>> }; commandProjection?: unknown }
            | null
            | undefined;
        logProcessCardCommandProjection({
            processKey,
            stageKey,
            configuredRefs: projection.configuredRefs,
            commandKeys: projection.commands.map((c) => c.key),
            planTemplates: (psi?.operatingPlan?.work_templates ?? []).map((t) => ({
                label: String((t as { label?: unknown }).label ?? ""),
                helpful: (((t as { helpful_actions?: Array<{ action_ref?: string }> }).helpful_actions) ?? []).map(
                    (h) => String(h.action_ref ?? ""),
                ),
            })),
            commandProjection: psi?.commandProjection ?? null,
        });
    }, [
        projection.drift,
        projection.withheld,
        projection.configuredRefs,
        projection.commands,
        context.businessProcess.key,
        context.businessProcess.stageKey,
    ]);

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
