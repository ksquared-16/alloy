"use client";

/** Session state for the Orchestrator command bar (thread, context, focus). Task Assist is a routed specialist — not this provider's product name. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
    ADMIN_V2_FOCUS_COMMAND_BAR,
    type AdminV2FocusCommandBarDetail,
} from "@/lib/adminV2/aiCommandSurface/adminV2CommandBarEvents";
import {
    clearPersistedCommandSurfaceSession,
    loadPersistedCommandSurfaceSession,
    persistCommandSurfaceSession,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadPersistence";
import { createEmptyThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";
import type { CommandSurfaceThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";

export type GlobalAssistantEntityType = "opportunities";

export type GlobalAssistantAction = "draft_sms" | "draft_email" | "schedule" | "reminder";

export type GlobalAssistantSourceSurface = "opportunity_drawer" | "header" | "queue" | "global_shell" | "command_bar";

export type GlobalAssistantEntityContext = {
    entity_type: GlobalAssistantEntityType;
    entity_id: string;
    label: string;
    source_surface: GlobalAssistantSourceSurface;
    available_actions?: GlobalAssistantAction[];
};

export type CommandSurfaceMode = "job_overview" | "task_assist";

export type CommandSurfaceJobCardUiState = Record<
    string,
    {
        advancedOpen: boolean;
        detailsOpen: boolean;
        applyAnyway: boolean;
        applying: boolean;
    }
>;

type GlobalAssistantContextValue = {
    /** Internal compat for drawer launcher — not exposed in command bar UI (Interaction Layer V1). */
    commandSurfaceMode: CommandSurfaceMode;
    setCommandSurfaceMode: (mode: CommandSurfaceMode) => void;
    currentContext: GlobalAssistantEntityContext | null;
    /** Scroll/focus the bottom command bar; optional mode hint for Task Assist vs job layout. */
    focusCommandBar: (detail?: AdminV2FocusCommandBarDetail) => void;
    /** @deprecated Card 9 — use {@link focusCommandBar}. Kept for compatibility. */
    openAssistant: () => void;
    /** Switch to job layout tab on the command bar; does not clear context. */
    closeAssistant: () => void;
    setAssistantContext: (context: GlobalAssistantEntityContext | null) => void;
    openAssistantWithContext: (context: GlobalAssistantEntityContext) => void;
    /** Command surface thread — persisted in sessionStorage for AdminV2 navigation within the tab session. */
    commandSurfaceThread: CommandSurfaceThreadState;
    setCommandSurfaceThread: (
        updater: CommandSurfaceThreadState | ((prev: CommandSurfaceThreadState) => CommandSurfaceThreadState)
    ) => void;
    commandSurfaceThreadExpanded: boolean;
    setCommandSurfaceThreadExpanded: (expanded: boolean) => void;
    clearCommandSurfaceConversation: () => void;
    commandSurfaceJobCardUi: CommandSurfaceJobCardUiState;
    setCommandSurfaceJobCardUi: (
        updater: CommandSurfaceJobCardUiState | ((prev: CommandSurfaceJobCardUiState) => CommandSurfaceJobCardUiState)
    ) => void;
};

const GlobalAssistantContext = createContext<GlobalAssistantContextValue | null>(null);

export function GlobalAssistantProvider({ children }: { children: ReactNode }) {
    const [commandSurfaceMode, setCommandSurfaceMode] = useState<CommandSurfaceMode>("job_overview");
    const [currentContext, setCurrentContext] = useState<GlobalAssistantEntityContext | null>(null);

    const [sessionLoaded] = useState(() => loadPersistedCommandSurfaceSession());
    const [commandSurfaceThread, setCommandSurfaceThreadState] = useState<CommandSurfaceThreadState>(
        () => sessionLoaded.thread
    );
    const [commandSurfaceThreadExpanded, setCommandSurfaceThreadExpandedState] = useState(
        () => sessionLoaded.threadExpanded
    );
    const [commandSurfaceJobCardUi, setCommandSurfaceJobCardUiState] = useState<CommandSurfaceJobCardUiState>({});

    useEffect(() => {
        persistCommandSurfaceSession({
            thread: commandSurfaceThread,
            threadExpanded: commandSurfaceThreadExpanded,
        });
    }, [commandSurfaceThread, commandSurfaceThreadExpanded]);

    const setCommandSurfaceThread = useCallback(
        (updater: CommandSurfaceThreadState | ((prev: CommandSurfaceThreadState) => CommandSurfaceThreadState)) => {
            setCommandSurfaceThreadState((prev) => (typeof updater === "function" ? updater(prev) : updater));
        },
        []
    );

    const setCommandSurfaceThreadExpanded = useCallback((expanded: boolean) => {
        setCommandSurfaceThreadExpandedState(expanded);
    }, []);

    const setCommandSurfaceJobCardUi = useCallback(
        (
            updater:
                | CommandSurfaceJobCardUiState
                | ((prev: CommandSurfaceJobCardUiState) => CommandSurfaceJobCardUiState)
        ) => {
            setCommandSurfaceJobCardUiState((prev) => (typeof updater === "function" ? updater(prev) : updater));
        },
        []
    );

    const clearCommandSurfaceConversation = useCallback(() => {
        setCommandSurfaceThreadState(createEmptyThreadState());
        setCommandSurfaceJobCardUiState({});
        clearPersistedCommandSurfaceSession();
    }, []);

    const focusCommandBar = useCallback((detail?: AdminV2FocusCommandBarDetail) => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(ADMIN_V2_FOCUS_COMMAND_BAR, { detail: detail ?? {} }));
        }
    }, []);

    const openAssistant = useCallback(() => {
        focusCommandBar({
            preferMode: currentContext?.entity_type === "opportunities" ? "task_assist" : "job_overview",
        });
    }, [currentContext, focusCommandBar]);

    const closeAssistant = useCallback(() => {
        setCommandSurfaceMode("job_overview");
    }, []);

    const setAssistantContext = useCallback((context: GlobalAssistantEntityContext | null) => {
        setCurrentContext(context);
    }, []);

    const openAssistantWithContext = useCallback(
        (context: GlobalAssistantEntityContext) => {
            setCurrentContext(context);
            setCommandSurfaceMode("task_assist");
            focusCommandBar({ preferMode: "task_assist" });
        },
        [focusCommandBar]
    );

    const value = useMemo(
        () => ({
            commandSurfaceMode,
            setCommandSurfaceMode,
            currentContext,
            focusCommandBar,
            openAssistant,
            closeAssistant,
            setAssistantContext,
            openAssistantWithContext,
            commandSurfaceThread,
            setCommandSurfaceThread,
            commandSurfaceThreadExpanded,
            setCommandSurfaceThreadExpanded,
            clearCommandSurfaceConversation,
            commandSurfaceJobCardUi,
            setCommandSurfaceJobCardUi,
        }),
        [
            commandSurfaceMode,
            currentContext,
            focusCommandBar,
            openAssistant,
            closeAssistant,
            setAssistantContext,
            openAssistantWithContext,
            commandSurfaceThread,
            setCommandSurfaceThread,
            commandSurfaceThreadExpanded,
            setCommandSurfaceThreadExpanded,
            clearCommandSurfaceConversation,
            commandSurfaceJobCardUi,
            setCommandSurfaceJobCardUi,
        ]
    );

    return <GlobalAssistantContext.Provider value={value}>{children}</GlobalAssistantContext.Provider>;
}

export function useGlobalAssistant(): GlobalAssistantContextValue {
    const ctx = useContext(GlobalAssistantContext);
    if (!ctx) {
        throw new Error("useGlobalAssistant must be used within GlobalAssistantProvider");
    }
    return ctx;
}

export function useGlobalAssistantOptional(): GlobalAssistantContextValue | null {
    return useContext(GlobalAssistantContext);
}
