"use client";

import type { ReactNode } from "react";

import TaskAssistClarificationCard from "@/components/admin/taskAssist/TaskAssistClarificationCard";
import TaskAssistCompactDraftCard from "@/components/admin/taskAssist/TaskAssistCompactDraftCard";
import TaskAssistCompactReminderCard from "@/components/admin/taskAssist/TaskAssistCompactReminderCard";
import TaskAssistOpportunityWorkspace from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";
import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import { ConfigLayoutAssistFieldSetupCard } from "@/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard";
import type { ConfigLayoutAssistFieldSetupConfirmPayload } from "@/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard";
import { ConfigLayoutAssistProposalThreadCard } from "@/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistProposalThreadCard";
import { ConfigLayoutAssistReadyCard } from "@/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistReadyCard";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import { WorkflowAssistProposalActionCard } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistProposalActionCard";
import { WorkflowAssistReadThreadCard } from "@/app/adminV2/components/aiCommandSurface/WorkflowAssistReadThreadCard";
import { badgeLabel } from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import {
    WORKFLOW_ASSIST_AUTOMATIONS_HREF,
    WORKFLOW_ASSIST_NOTICE_TEXT,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { CommandSurfaceThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";
import type { ConfigProposalReviewDebugLog } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import type { TaskAssistClarificationKind } from "@/lib/agent/taskAssist/taskAssistClarification";
import type { TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import {
    formatCandidateDebugLine,
    formatCandidateOperatorPresentation,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchDisambiguation";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import { isStaleOperationalProposalEntity } from "@/lib/adminV2/bos/activeOperationalContext";
import type { WorkflowAssistThreadMutationHandlersV1 } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { neutral, derived, brand, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function intentSummary(intent: TaskAssistCommandIntent | null): string | null {
    if (!intent || intent.intent_type === "unknown") return null;
    const ch = intent.channel_hint ? ` · ${intent.channel_hint.toUpperCase()}` : "";
    switch (intent.intent_type) {
        case "draft_message":
            return `Draft message${ch}`;
        case "schedule_message":
            return `Schedule send${ch}${intent.timing_hint_text ? ` · ${intent.timing_hint_text}` : ""}`;
        case "create_reminder":
            return `Reminder / task${intent.timing_hint_text ? ` · ${intent.timing_hint_text}` : ""}`;
        default:
            return null;
    }
}

function taskAssistActionLabel(bootstrap: { intent_type: string; channel_hint?: string | null }): string {
    const ch = bootstrap.channel_hint ? ` · ${bootstrap.channel_hint.toUpperCase()}` : "";
    switch (bootstrap.intent_type) {
        case "schedule_message":
            return `Schedule message${ch}`;
        case "create_reminder":
            return `Create reminder / task`;
        default:
            return `Draft message${ch}`;
    }
}

function UserBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-end" data-command-surface-user-message="true">
            <div
                className="max-w-[min(92%,520px)] rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-snug"
                style={{ backgroundColor: derived.adminV2AiBarPineWash, color: CMD.textBody }}
            >
                {text}
            </div>
        </div>
    );
}

function AssistantBubble({ children }: { children: ReactNode }) {
    return (
        <div className="flex justify-start" data-command-surface-assistant-turn="true">
            <div
                className={`max-w-[min(96%,560px)] rounded-2xl rounded-bl-md border px-3 py-2 text-[12px] leading-snug ${COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}`}
                style={{ borderColor: derived.border, backgroundColor: neutral.surface, color: CMD.textBody }}
            >
                {children}
            </div>
        </div>
    );
}

export type CommandSurfaceThreadProps = {
    turns: CommandSurfaceThreadTurn[];
    busy: boolean;
    /** Active opportunity id from GlobalAssistantContext — blocks stale task assist applies. */
    activeOperationalEntityId?: string | null;
    onPickCandidate: (
        turnId: string,
        candidate: TaskAssistEntitySearchCandidate,
        intent: TaskAssistCommandIntent | null
    ) => void;
    onConfirmCandidate: (
        turnId: string,
        candidate: TaskAssistEntitySearchCandidate,
        intent: TaskAssistCommandIntent | null,
        workflowExplain?: { submittedCommand: string; intent: import("@/lib/agent/workflowAssist/workflowAssistReadV1").WorkflowAssistReadIntentV1 } | null
    ) => void;
    onToggleActionCard: (turnId: string) => void;
    onToggleTaskAssistMoreOptions?: (turnId: string) => void;
    renderJobLayoutCardActions?: (turnId: string) => ReactNode;
    workflowAssistMutation?: WorkflowAssistThreadMutationHandlersV1 | null;
    /** When false, proposal/apply CTAs stay disabled (e.g. ops or capability not yet loaded). */
    workflowAssistMutationsAllowed?: boolean;
    /** Shown on read cards when mutations are not allowed for this session. */
    workflowAssistMutationBlockedReason?: string | null;
    onClarificationChip?: (
        turnId: string,
        candidate: TaskAssistEntitySearchCandidate,
        intent: TaskAssistCommandIntent,
        kind: TaskAssistClarificationKind,
        payload: { goalText?: string; timingText?: string; custom?: boolean }
    ) => void;
    onConfirmFuzzySuggestion?: (
        turnId: string,
        candidate: TaskAssistEntitySearchCandidate,
        intent: TaskAssistCommandIntent | null
    ) => void;
    /** Navigate to Settings config proposals review (command surface footer). */
    onReviewConfigProposal: (proposalId: string) => void;
    /** Propose a narrow edit for an existing workflow (duplicate warning path). */
    onWorkflowAssistProposeEdit?: (workflowId: string) => void;
    debugReviewNavigation?: ConfigProposalReviewDebugLog;
    onConfirmConfigFieldSetup?: (command: string, payload: ConfigLayoutAssistFieldSetupConfirmPayload) => void;
    onApproveConfigProposal?: (proposalId: string) => void;
    configAssistCanApproveAndApply?: boolean;
};

export default function CommandSurfaceThread({
    turns,
    busy,
    activeOperationalEntityId = null,
    onPickCandidate,
    onConfirmCandidate,
    onToggleActionCard,
    onToggleTaskAssistMoreOptions,
    renderJobLayoutCardActions,
    workflowAssistMutation,
    workflowAssistMutationsAllowed = false,
    workflowAssistMutationBlockedReason,
    onClarificationChip,
    onConfirmFuzzySuggestion,
    onReviewConfigProposal,
    onWorkflowAssistProposeEdit,
    debugReviewNavigation,
    onConfirmConfigFieldSetup,
    onApproveConfigProposal,
    configAssistCanApproveAndApply = false,
}: CommandSurfaceThreadProps) {
    const showSearchDebug =
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_COMMAND_SURFACE_SEARCH_DEBUG === "1";

    if (turns.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2 px-3 py-3" data-command-surface-thread="true">
            {turns.map((turn) => {
                switch (turn.kind) {
                    case "user_message":
                        return <UserBubble key={turn.id} text={turn.text} />;
                    case "assistant_notice": {
                        const isContextBoundary = turn.noticeRole === "context_boundary";
                        return (
                            <div
                                key={turn.id}
                                className={isContextBoundary ? "border-t border-alloy-stone/20 pt-2 mt-1" : undefined}
                                data-command-surface-context-boundary={isContextBoundary ? "true" : undefined}
                            >
                                <AssistantBubble>
                                    <span
                                        data-command-surface-assistant-notice="true"
                                        className={isContextBoundary ? "font-medium text-alloy-midnight/80" : undefined}
                                    >
                                        {turn.text}
                                    </span>
                                </AssistantBubble>
                            </div>
                        );
                    }
                    case "workflow_assist_read":
                        return (
                            <AssistantBubble key={turn.id}>
                                <WorkflowAssistReadThreadCard
                                    submittedCommand={turn.submittedCommand}
                                    intent={turn.intent}
                                    payload={turn.payload}
                                    error={turn.error}
                                    mutation={workflowAssistMutation ?? undefined}
                                    mutationBlockedReason={workflowAssistMutationBlockedReason ?? undefined}
                                />
                            </AssistantBubble>
                        );
                    case "workflow_notice":
                        return (
                            <AssistantBubble key={turn.id}>
                                <div className="space-y-1.5" data-command-surface-workflow-notice="true">
                                    <p className="text-[12px] leading-snug">{WORKFLOW_ASSIST_NOTICE_TEXT}</p>
                                    <CommandSurfaceCardLink
                                        href={WORKFLOW_ASSIST_AUTOMATIONS_HREF}
                                        className="inline-block text-[11px] font-semibold text-alloy-blue hover:underline"
                                        data-command-surface-workflow-assist-open-automations="true"
                                    >
                                        Open Automations
                                    </CommandSurfaceCardLink>
                                </div>
                            </AssistantBubble>
                        );
                    case "error":
                        return (
                            <AssistantBubble key={turn.id}>
                                <span style={{ color: semantic.warning }} data-command-surface-error="true">
                                    {turn.text}
                                </span>
                            </AssistantBubble>
                        );
                    case "candidate_results":
                        return (
                            <AssistantBubble key={turn.id}>
                                <div className="space-y-1.5" data-command-surface-candidate-results="true">
                                    <ul className="space-y-1">
                                        {turn.candidates.map((c) => {
                                            const presentation = formatCandidateOperatorPresentation(c);
                                            return (
                                            <li key={c.entity_id}>
                                                <button
                                                    type="button"
                                                    data-command-surface-candidate-row="true"
                                                    data-entity-id={c.entity_id}
                                                    disabled={busy}
                                                    className="flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-alloy-stone/[0.06] disabled:opacity-50"
                                                    style={{ borderColor: derived.border, color: CMD.textBody }}
                                                    onClick={() =>
                                                        turn.candidates.length === 1 ?
                                                            onConfirmCandidate(turn.id, c, turn.intent, turn.workflowExplain)
                                                        :   onPickCandidate(turn.id, c, turn.intent)
                                                    }
                                                >
                                                    <span className="font-semibold leading-snug">
                                                        {presentation.primaryLabel}
                                                    </span>
                                                    {presentation.secondaryLine ? (
                                                        <span
                                                            className="text-[10px] leading-snug"
                                                            style={{ color: CMD.textSupporting }}
                                                        >
                                                            {presentation.secondaryLine}
                                                        </span>
                                                    ) : null}
                                                    {presentation.relatedPeopleLine ? (
                                                        <span
                                                            className="text-[10px] leading-snug"
                                                            style={{ color: CMD.textSupporting }}
                                                        >
                                                            {presentation.relatedPeopleLine}
                                                        </span>
                                                    ) : null}
                                                    {presentation.matchReasonLine ? (
                                                        <span
                                                            className="text-[9px] leading-snug"
                                                            style={{ color: CMD.textLabel }}
                                                            data-command-surface-candidate-match-reason="true"
                                                        >
                                                            {presentation.matchReasonLine}
                                                        </span>
                                                    ) : null}
                                                    {showSearchDebug ? (
                                                        <span
                                                            className="font-mono text-[9px] leading-tight"
                                                            style={{ color: CMD.textLabel }}
                                                            data-command-surface-candidate-debug="true"
                                                        >
                                                            {formatCandidateDebugLine(c)}
                                                        </span>
                                                    ) : null}
                                                </button>
                                            </li>
                                            );
                                        })}
                                    </ul>
                                    {turn.candidates.length === 1 ? (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                            data-command-surface-confirm-target="true"
                                            onClick={() =>
                                                onConfirmCandidate(
                                                    turn.id,
                                                    turn.candidates[0]!,
                                                    turn.intent,
                                                    turn.workflowExplain
                                                )
                                            }
                                        >
                                            Confirm target
                                        </button>
                                    ) : null}
                                </div>
                            </AssistantBubble>
                        );
                    case "target_confirmed":
                        return null;
                    case "task_clarification":
                        return (
                            <AssistantBubble key={turn.id}>
                                <TaskAssistClarificationCard
                                    kind={turn.clarificationKind}
                                    disabled={busy}
                                    onChip={(payload) =>
                                        onClarificationChip?.(
                                            turn.id,
                                            turn.candidate,
                                            turn.intent,
                                            turn.clarificationKind,
                                            payload
                                        )
                                    }
                                />
                            </AssistantBubble>
                        );
                    case "fuzzy_entity_suggestion":
                        return (
                            <AssistantBubble key={turn.id}>
                                <div className="space-y-2" data-command-surface-fuzzy-suggestion="true">
                                    <p className="text-[12px] font-medium">
                                        Did you mean {turn.candidate.label}?
                                    </p>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                                        data-command-surface-fuzzy-confirm="true"
                                        onClick={() =>
                                            onConfirmFuzzySuggestion?.(turn.id, turn.candidate, turn.intent)
                                        }
                                    >
                                        Yes, use {turn.candidate.label}
                                    </button>
                                </div>
                            </AssistantBubble>
                        );
                    case "action_card":
                        if (turn.card.type === "workflow_assist_proposal") {
                            return (
                                <AssistantBubble key={turn.id}>
                                    <WorkflowAssistProposalActionCard
                                        suggestion={turn.card.suggestion}
                                        createInterpreted={turn.card.createInterpreted}
                                        applyAllowed={workflowAssistMutationsAllowed}
                                        onProposeEditExisting={onWorkflowAssistProposeEdit}
                                    />
                                </AssistantBubble>
                            );
                        }
                        if (turn.card.type === "config_layout_assist_field_setup") {
                            const card = turn.card;
                            return (
                                <AssistantBubble key={turn.id}>
                                    <ConfigLayoutAssistFieldSetupCard
                                        draft={card.draft}
                                        sectionOptions={card.sectionOptions}
                                        busy={busy}
                                        onConfirm={(payload) =>
                                            onConfirmConfigFieldSetup?.(card.draft.command, payload)
                                        }
                                    />
                                </AssistantBubble>
                            );
                        }
                        if (turn.card.type === "config_layout_assist_ready") {
                            const card = turn.card;
                            return (
                                <AssistantBubble key={turn.id}>
                                    <ConfigLayoutAssistReadyCard
                                        readySummary={card.readySummary}
                                        persistedProposalId={card.persistedProposalId}
                                        busy={busy}
                                        canApproveAndApply={configAssistCanApproveAndApply}
                                        onApproveAndApply={() =>
                                            onApproveConfigProposal?.(card.persistedProposalId)
                                        }
                                    />
                                </AssistantBubble>
                            );
                        }
                        if (turn.card.type === "config_layout_assist_proposal") {
                            return (
                                <AssistantBubble key={turn.id}>
                                    <ConfigLayoutAssistProposalThreadCard
                                        proposal={turn.card.proposal}
                                        trace={turn.card.trace}
                                        persistedProposalId={turn.card.persistedProposalId}
                                        onReviewConfigProposal={onReviewConfigProposal}
                                        debugReviewNavigation={debugReviewNavigation}
                                    />
                                </AssistantBubble>
                            );
                        }
                        if (turn.card.type === "task_assist") {
                            const {
                                bootstrap,
                                entityId,
                                entityLabel,
                                locationLabel,
                                expanded,
                                bootstrapKey,
                                uiPhase = "draft",
                                showMoreOptions = false,
                            } = turn.card;
                            const staleProposal = isStaleOperationalProposalEntity(
                                entityId,
                                activeOperationalEntityId
                            );
                            return (
                                <AssistantBubble key={turn.id}>
                                    <div className="space-y-2" data-command-surface-task-assist-action-card="true">
                                        {uiPhase === "reminder" ? (
                                            <TaskAssistCompactReminderCard
                                                entityId={entityId}
                                                entityLabel={entityLabel}
                                                locationLabel={locationLabel}
                                                bootstrap={bootstrap}
                                                bootstrapKey={bootstrapKey}
                                                mutationsBlocked={staleProposal}
                                            />
                                        ) : null}
                                        {uiPhase === "draft" ? (
                                            <TaskAssistCompactDraftCard
                                                entityId={entityId}
                                                entityLabel={entityLabel}
                                                locationLabel={locationLabel}
                                                bootstrap={bootstrap}
                                                bootstrapKey={bootstrapKey}
                                                autoPropose
                                                mutationsBlocked={staleProposal}
                                            />
                                        ) : null}
                                        {uiPhase === "workspace" ? (
                                            <>
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <div className="text-[12px] font-semibold">{taskAssistActionLabel(bootstrap)}</div>
                                                        <div className="text-[10px]" style={{ color: CMD.textSupporting }}>
                                                            {entityLabel}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-45"
                                                        style={{ borderColor: derived.border, color: CMD.textBody }}
                                                        disabled={staleProposal}
                                                        onClick={() => onToggleActionCard(turn.id)}
                                                    >
                                                        {expanded ? "Collapse" : "Review & approve"}
                                                    </button>
                                                </div>
                                                {expanded && !staleProposal ? (
                                                    <TaskAssistOpportunityWorkspace
                                                        entityId={entityId}
                                                        entity_display_label={entityLabel}
                                                        active
                                                        source_surface="command_bar"
                                                        command_bootstrap={bootstrap}
                                                        command_bootstrap_key={bootstrapKey}
                                                        command_bar_surface="compact"
                                                        show_v11_lists={showMoreOptions}
                                                        className="mb-0 border-0 bg-transparent px-0 py-1 shadow-none"
                                                    />
                                                ) : expanded && staleProposal ? (
                                                    <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                                                        Switch operational context to this record to review and approve.
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                                                        Open review to edit the draft, pick a recipient, and approve before anything sends.
                                                    </p>
                                                )}
                                            </>
                                        ) : null}
                                        {showMoreOptions && uiPhase === "draft" && !staleProposal ? (
                                            <TaskAssistOpportunityWorkspace
                                                entityId={entityId}
                                                entity_display_label={entityLabel}
                                                active
                                                source_surface="command_bar"
                                                command_bootstrap={bootstrap}
                                                command_bootstrap_key={bootstrapKey}
                                                command_bar_surface="compact"
                                                show_v11_lists
                                                className="mb-0 border-0 bg-transparent px-0 py-1 shadow-none"
                                            />
                                        ) : null}
                                        {uiPhase === "draft" && !showMoreOptions ? (
                                            <button
                                                type="button"
                                                className="text-[10px] font-semibold underline-offset-2 hover:underline"
                                                style={{ color: brand.secondary }}
                                                data-command-surface-task-assist-more-options="true"
                                                onClick={() => onToggleTaskAssistMoreOptions?.(turn.id)}
                                            >
                                                More options (saved drafts, schedule history)
                                            </button>
                                        ) : null}
                                    </div>
                                </AssistantBubble>
                            );
                        }
                        if (turn.card.type === "job_layout") {
                            const card = turn.card;
                            return (
                                <AssistantBubble key={turn.id}>
                                    <div className="space-y-2" data-command-surface-job-layout-action-card="true">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="text-[13px] font-semibold">{card.headline}</div>
                                                {card.subline ? (
                                                    <div className="text-[11px]" style={{ color: CMD.textSupporting }}>
                                                        {card.subline}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <span
                                                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                                style={{
                                                    backgroundColor: "rgba(0, 162, 131, 0.14)",
                                                    color: brand.secondary,
                                                }}
                                            >
                                                {badgeLabel(card.confidence)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="text-[11px] font-semibold underline-offset-2 hover:underline"
                                            style={{ color: brand.secondary }}
                                            onClick={() => onToggleActionCard(turn.id)}
                                        >
                                            {card.expanded ? "Hide details" : "Show layout preview"}
                                        </button>
                                        {card.expanded && renderJobLayoutCardActions ?
                                            renderJobLayoutCardActions(turn.id)
                                        :   null}
                                    </div>
                                </AssistantBubble>
                            );
                        }
                        return null;
                    default:
                        return null;
                }
            })}
        </div>
    );
}
