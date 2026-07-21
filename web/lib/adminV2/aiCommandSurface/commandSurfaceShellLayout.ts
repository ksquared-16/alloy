/**
 * Command surface shell layout + loading coordination (BOS UX Cards 18–20).
 * Perceived performance only — no artificial delays.
 */

import type { CommandSurfaceRouteResult } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { CommandSurfaceThreadTurn } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";

/** Collapsed thread panel chrome (header + active-record row). */
export const COMMAND_SURFACE_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX = 72;

/** Expanded thread scroll region minimum (pairs with max-h in shell). */
export const COMMAND_SURFACE_THREAD_SCROLL_MIN_HEIGHT_PX = 48;

/** Right-rail copilot panel — visible chat chrome, not input-only. */
export const COMMAND_SURFACE_RAIL_PANEL_MIN_HEIGHT_PX = 248;

/** Rail collapsed thread preview body minimum. */
export const COMMAND_SURFACE_RAIL_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX = 120;

/** Rail expanded thread scroll region minimum. */
export const COMMAND_SURFACE_RAIL_THREAD_SCROLL_MIN_HEIGHT_PX = 120;

export type BosRailActionIconKey =
    | "summarize"
    | "missing"
    | "draft"
    | "documents"
    | "outreach"
    | "insight";

/** @deprecated Use {@link BosRailActionIconKey} */
export type BosRailStarterIconKey = BosRailActionIconKey;

export type CommandSurfaceRailStarterSuggestion = {
    title: string;
    description: string;
    prompt: string;
    icon: BosRailActionIconKey;
};

export const COMMAND_SURFACE_RAIL_STARTER_SUGGESTIONS: readonly CommandSurfaceRailStarterSuggestion[] = [
    {
        title: "Summarize this lead",
        description: "Get a quick overview of details and history",
        prompt: "Summarize this lead",
        icon: "summarize",
    },
    {
        title: "Identify missing information",
        description: "See what's needed to move forward",
        prompt: "What information is missing?",
        icon: "missing",
    },
    {
        title: "Draft follow-up",
        description: "Create a personalized follow-up message",
        prompt: "Draft follow-up",
        icon: "draft",
    },
];

export const CONFIGURATION_RAIL_STARTER_SUGGESTIONS: readonly CommandSurfaceRailStarterSuggestion[] = [
    {
        title: "Explain this configuration",
        description: "Summarize the active state and working changes",
        prompt: "Explain this configuration",
        icon: "summarize",
    },
    {
        title: "Review configuration attention",
        description: "Identify setup, publication, or assignment issues",
        prompt: "What configuration needs attention?",
        icon: "missing",
    },
    {
        title: "Review unpublished changes",
        description: "Explain what remains private to Organization",
        prompt: "Review unpublished configuration changes",
        icon: "insight",
    },
];

/** Context-aware first starter title (presentation only — prompts unchanged). */
export function resolveCommandSurfaceRailStarterSuggestions(args: {
    hasWorkUnitScope: boolean;
    hasOpportunityContext: boolean;
    opportunitySingular: string;
    isConfigurationContext?: boolean;
}): readonly CommandSurfaceRailStarterSuggestion[] {
    if (args.isConfigurationContext) return CONFIGURATION_RAIL_STARTER_SUGGESTIONS;
    const leadLabel =
        args.opportunitySingular === "Inquiry" || args.opportunitySingular === "Opportunity" ?
            "Lead"
        :   args.opportunitySingular;

    const summarizeTitle =
        args.hasWorkUnitScope && !args.hasOpportunityContext ? "Summarize this queue"
        : args.hasOpportunityContext ? `Summarize this ${leadLabel.toLowerCase()}`
        : "Summarize this queue";

    return [
        { ...COMMAND_SURFACE_RAIL_STARTER_SUGGESTIONS[0], title: summarizeTitle },
        COMMAND_SURFACE_RAIL_STARTER_SUGGESTIONS[1],
        COMMAND_SURFACE_RAIL_STARTER_SUGGESTIONS[2],
    ];
}

/** Operator-facing search notice (Card 18 — one line, replaces stacked routing+search). */
export const COMMAND_SURFACE_SEARCHING_NOTICE = "Searching records…";

export const COMMAND_SURFACE_PROCESSING_LABEL = "Processing…";

export const CAPABILITY_GATE_CHECKING_LABEL = "Checking permissions…";

/** Entity-only Task Assist commands defer routing notice to the searching notice in runTaskAssistRoute. */
export function isEntitySearchOnlyTaskAssistRoute(route: CommandSurfaceRouteResult): boolean {
    if (route.route !== "task_assist") return false;
    const q = route.slots.entity_search_text?.trim();
    if (!q || q.length < 2) return false;
    if (route.slots.comms_verb || route.slots.reminder_verb) return false;
    const intent = route.taskAssistIntent;
    if (intent && intent.intent_type !== "unknown") return false;
    return true;
}

/** Skip generic routing when boundary/search specialist notices carry the explanation. */
export function shouldAppendCommandSurfaceRoutingNotice(route: CommandSurfaceRouteResult): boolean {
    if (route.route === "clarify") return false;
    if (
        route.route === "workflow_assist" &&
        !route.workflowAssistReadIntent &&
        !route.workflowAssistCreateIntent
    ) {
        return false;
    }
    if (isEntitySearchOnlyTaskAssistRoute(route)) return false;
    return true;
}

const SEARCHING_NOTICE_MARKERS = [
    COMMAND_SURFACE_SEARCHING_NOTICE,
    "Looking up matching records",
] as const;

function turnIsSearchOrRoutingNotice(turn: CommandSurfaceThreadTurn): boolean {
    if (turn.kind !== "assistant_notice") return false;
    if (turn.noticeRole === "routing" || turn.noticeRole === "searching") return true;
    const t = turn.text.trim();
    return SEARCHING_NOTICE_MARKERS.some((m) => t.includes(m));
}

/**
 * Avoid stacked "Working…" when routing or searching notice already communicates progress.
 */
export function shouldShowInlineThreadBusyIndicator(args: {
    busy: boolean;
    turns: readonly CommandSurfaceThreadTurn[];
}): boolean {
    if (!args.busy) return false;
    for (let i = args.turns.length - 1; i >= 0; i--) {
        const turn = args.turns[i]!;
        if (turn.kind === "user_message") return true;
        if (turnIsSearchOrRoutingNotice(turn)) return false;
    }
    return true;
}

export function resolveCommandSurfaceThreadStatusLabel(args: {
    busy: boolean;
    turns: readonly CommandSurfaceThreadTurn[];
}): string | null {
    if (!args.busy) return null;
    if (!shouldShowInlineThreadBusyIndicator(args)) return null;
    return COMMAND_SURFACE_PROCESSING_LABEL;
}
