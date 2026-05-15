"use client";

import type { ReactNode } from "react";

import TaskAssistOpportunityWorkspace from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";
import { badgeLabel } from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import { WORKFLOW_ASSIST_NOTICE_TEXT } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { CommandSurfaceThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";
import type { TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistCompactAction } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
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
                className="max-w-[min(96%,560px)] rounded-2xl rounded-bl-md border px-3 py-2 text-[12px] leading-snug"
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
    onPickCandidate: (
        turnId: string,
        candidate: TaskAssistEntitySearchCandidate,
        intent: TaskAssistCommandIntent | null
    ) => void;
    onConfirmCandidate: (turnId: string, candidate: TaskAssistEntitySearchCandidate, intent: TaskAssistCommandIntent | null) => void;
    onToggleActionCard: (turnId: string) => void;
    onChooseTaskAssistAction?: (turnId: string, action: TaskAssistCompactAction) => void;
    onToggleTaskAssistMoreOptions?: (turnId: string) => void;
    renderJobLayoutCardActions?: (turnId: string) => ReactNode;
};

export default function CommandSurfaceThread({
    turns,
    busy,
    onPickCandidate,
    onConfirmCandidate,
    onToggleActionCard,
    onChooseTaskAssistAction,
    onToggleTaskAssistMoreOptions,
    renderJobLayoutCardActions,
}: CommandSurfaceThreadProps) {
    if (turns.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2 px-3 py-3" data-command-surface-thread="true">
            {turns.map((turn) => {
                switch (turn.kind) {
                    case "user_message":
                        return <UserBubble key={turn.id} text={turn.text} />;
                    case "assistant_notice":
                        return (
                            <AssistantBubble key={turn.id}>
                                <span data-command-surface-assistant-notice="true">{turn.text}</span>
                            </AssistantBubble>
                        );
                    case "workflow_notice":
                        return (
                            <AssistantBubble key={turn.id}>
                                <span className="font-semibold" data-command-surface-workflow-notice="true">
                                    {WORKFLOW_ASSIST_NOTICE_TEXT}
                                </span>
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
                                    <div className="text-[11px] font-semibold" style={{ color: CMD.textLabel }}>
                                        {turn.candidates.length === 1 ?
                                            "Confirm who you mean"
                                        :   "I found these matching records."}
                                    </div>
                                    {intentSummary(turn.intent) ? (
                                        <div className="text-[10px]" style={{ color: CMD.textSupporting }}>
                                            Next: {intentSummary(turn.intent)} — confirm before any send.
                                        </div>
                                    ) : null}
                                    <ul className="space-y-1">
                                        {turn.candidates.map((c) => (
                                            <li key={c.entity_id}>
                                                <button
                                                    type="button"
                                                    data-command-surface-candidate-row="true"
                                                    disabled={busy}
                                                    className="flex w-full flex-col rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-alloy-stone/[0.06] disabled:opacity-50"
                                                    style={{ borderColor: derived.border, color: CMD.textBody }}
                                                    onClick={() =>
                                                        turn.candidates.length === 1 ?
                                                            onConfirmCandidate(turn.id, c, turn.intent)
                                                        :   onPickCandidate(turn.id, c, turn.intent)
                                                    }
                                                >
                                                    <span className="font-semibold">{c.label}</span>
                                                    {c.subtitle ? (
                                                        <span style={{ color: CMD.textSupporting }}>{c.subtitle}</span>
                                                    ) : null}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    {turn.candidates.length === 1 ? (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                            data-command-surface-confirm-target="true"
                                            onClick={() => onConfirmCandidate(turn.id, turn.candidates[0]!, turn.intent)}
                                        >
                                            Confirm target
                                        </button>
                                    ) : null}
                                </div>
                            </AssistantBubble>
                        );
                    case "target_confirmed":
                        return (
                            <AssistantBubble key={turn.id}>
                                <div data-command-surface-target-confirmed="true">
                                    <span className="text-[11px] font-semibold">Target: </span>
                                    <span>{turn.candidate.label}</span>
                                    {intentSummary(turn.intent) ? (
                                        <div className="mt-0.5 text-[10px]" style={{ color: CMD.textSupporting }}>
                                            {intentSummary(turn.intent)}
                                        </div>
                                    ) : null}
                                </div>
                            </AssistantBubble>
                        );
                    case "action_card":
                        if (turn.card.type === "task_assist") {
                            const {
                                bootstrap,
                                entityId,
                                entityLabel,
                                expanded,
                                bootstrapKey,
                                uiPhase = "choose",
                                showMoreOptions = false,
                            } = turn.card;
                            const compactActions: { id: TaskAssistCompactAction; label: string }[] = [
                                { id: "draft_message", label: "Draft message" },
                                { id: "send_now", label: "Send now" },
                                { id: "schedule_later", label: "Schedule for later" },
                                { id: "create_reminder", label: "Create reminder" },
                            ];
                            return (
                                <AssistantBubble key={turn.id}>
                                    <div className="space-y-2" data-command-surface-task-assist-action-card="true">
                                        {uiPhase === "choose" ? (
                                            <>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {compactActions.map((a) => (
                                                        <button
                                                            key={a.id}
                                                            type="button"
                                                            disabled={busy}
                                                            data-command-surface-task-assist-compact-action={a.id}
                                                            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold hover:bg-alloy-stone/[0.06] disabled:opacity-50"
                                                            style={{ borderColor: derived.border, color: CMD.textBody }}
                                                            onClick={() => onChooseTaskAssistAction?.(turn.id, a.id)}
                                                        >
                                                            {a.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                                                    Nothing sends until you review and approve.
                                                </p>
                                            </>
                                        ) : (
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
                                                        className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                                                        style={{ borderColor: derived.border, color: CMD.textBody }}
                                                        onClick={() => onToggleActionCard(turn.id)}
                                                    >
                                                        {expanded ? "Collapse" : "Review & approve"}
                                                    </button>
                                                </div>
                                                {expanded ? (
                                                    <TaskAssistOpportunityWorkspace
                                                        entityId={entityId}
                                                        active
                                                        source_surface="command_bar"
                                                        command_bootstrap={bootstrap}
                                                        command_bootstrap_key={bootstrapKey}
                                                        command_bar_surface="compact"
                                                        show_v11_lists={showMoreOptions}
                                                        className="mb-0 border-0 bg-transparent px-0 py-1 shadow-none"
                                                    />
                                                ) : (
                                                    <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                                                        Open review to edit the draft, pick a recipient, and approve before anything sends.
                                                    </p>
                                                )}
                                                {!showMoreOptions ? (
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
                                            </>
                                        )}
                                    </div>
                                </AssistantBubble>
                            );
                        }
                        return (
                            <AssistantBubble key={turn.id}>
                                <div className="space-y-2" data-command-surface-job-layout-action-card="true">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <div className="text-[13px] font-semibold">{turn.card.headline}</div>
                                            {turn.card.subline ? (
                                                <div className="text-[11px]" style={{ color: CMD.textSupporting }}>
                                                    {turn.card.subline}
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
                                            {badgeLabel(turn.card.confidence)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="text-[11px] font-semibold underline-offset-2 hover:underline"
                                        style={{ color: brand.secondary }}
                                        onClick={() => onToggleActionCard(turn.id)}
                                    >
                                        {turn.card.expanded ? "Hide details" : "Show layout preview"}
                                    </button>
                                    {turn.card.expanded && renderJobLayoutCardActions ?
                                        renderJobLayoutCardActions(turn.id)
                                    :   null}
                                </div>
                            </AssistantBubble>
                        );
                    default:
                        return null;
                }
            })}
        </div>
    );
}
