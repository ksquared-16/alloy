import type { TaskAssistCommandIntent, TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

/** Dispatched on `window` so any surface can request scroll/focus on the AdminV2 bottom command bar. */
export const ADMIN_V2_FOCUS_COMMAND_BAR = "alloy-adminv2-focus-command-bar" as const;

export type AdminV2FocusCommandBarDetail = {
    /** When set, the command surface should switch to this mode after focus. */
    preferMode?: "job_overview" | "task_assist";
    /** Prefill the command input (e.g. Ask Workflow Assist from workspace automation). */
    seedCommand?: string;
    /** Expand the thread panel when focusing so prior Assist turns stay visible. */
    expandThread?: boolean;
    /**
     * When true with `seedCommand`, submit the seed to the Orchestrator immediately.
     * Only for explicit operator CTAs (e.g. drawer BOS handoff) — not general focus events.
     */
    autoSubmitSeedCommand?: boolean;
    /**
     * BOS drawer handoff: use this Task Assist intent instead of NL parsing the seed.
     */
    taskAssistHandoffIntent?: TaskAssistCommandIntent | null;
    /** BOS drawer handoff: pre-built bootstrap with synthesized communication draft. */
    taskAssistHandoffBootstrap?: TaskAssistCommandBootstrap | null;
    /**
     * BOS handoff entity — used when assistant context has not flushed before auto-submit.
     * Prevents generic record search from queue row / drawer CTAs.
     */
    handoffEntity?: { entity_id: string; label: string } | null;
};
