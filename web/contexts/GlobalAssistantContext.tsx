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
import { entityOperationalContextEqual } from "@/lib/adminV2/bos/activeOperationalContext";
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

/** AdminV2 workspace route context for Workflow Assist create proposals (metadata.scope). */
export type GlobalAssistantWorkspaceScope = {
    department_id: string;
    department_name?: string | null;
    work_unit_id?: string | null;
    work_unit_name?: string | null;
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
    /** Department / work-unit page scope for Workflow Assist create drafts. */
    workspaceScope: GlobalAssistantWorkspaceScope | null;
    setWorkspaceScope: (scope: GlobalAssistantWorkspaceScope | null) => void;
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
    /** Collapse thread panel when navigating away from a command-card CTA. */
    collapseCommandSurfaceAfterNavigation: () => void;
    commandSurfaceJobCardUi: CommandSurfaceJobCardUiState;
    setCommandSurfaceJobCardUi: (
        updater: CommandSurfaceJobCardUiState | ((prev: CommandSurfaceJobCardUiState) => CommandSurfaceJobCardUiState)
    ) => void;
};

const GlobalAssistantContext = createContext<GlobalAssistantContextValue | null>(null);

function workspaceScopeEqual(
    a: GlobalAssistantWorkspaceScope | null,
    b: GlobalAssistantWorkspaceScope | null
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.department_id === b.department_id &&
        (a.department_name ?? null) === (b.department_name ?? null) &&
        (a.work_unit_id ?? null) === (b.work_unit_id ?? null) &&
        (a.work_unit_name ?? null) === (b.work_unit_name ?? null)
    );
}

export function GlobalAssistantProvider({ children }: { children: ReactNode }) {
    const [commandSurfaceMode, setCommandSurfaceMode] = useState<CommandSurfaceMode>("job_overview");
    const [currentContext, setCurrentContext] = useState<GlobalAssistantEntityContext | null>(null);
    const [workspaceScope, setWorkspaceScopeState] = useState<GlobalAssistantWorkspaceScope | null>(null);

    const [commandSurfaceThread, setCommandSurfaceThreadState] = useState<CommandSurfaceThreadState>(() =>
        createEmptyThreadState()
    );
    const [commandSurfaceThreadExpanded, setCommandSurfaceThreadExpandedState] = useState(true);
    const [commandSurfaceJobCardUi, setCommandSurfaceJobCardUiState] = useState<CommandSurfaceJobCardUiState>({});
    const [commandSurfaceSessionRestored, setCommandSurfaceSessionRestored] = useState(false);

    useEffect(() => {
        const session = loadPersistedCommandSurfaceSession();
        setCommandSurfaceThreadState(session.thread);
        setCommandSurfaceThreadExpandedState(session.threadExpanded);
        setCommandSurfaceSessionRestored(true);
    }, []);

    useEffect(() => {
        if (!commandSurfaceSessionRestored) return;
        persistCommandSurfaceSession({
            thread: commandSurfaceThread,
            threadExpanded: commandSurfaceThreadExpanded,
        });
    }, [commandSurfaceSessionRestored, commandSurfaceThread, commandSurfaceThreadExpanded]);

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

    const collapseCommandSurfaceAfterNavigation = useCallback(() => {
        setCommandSurfaceThreadExpandedState(false);
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
        setCurrentContext((prev) => (entityOperationalContextEqual(prev, context) ? prev : context));
    }, []);

    const setWorkspaceScope = useCallback((scope: GlobalAssistantWorkspaceScope | null) => {
        setWorkspaceScopeState((prev) => (workspaceScopeEqual(prev, scope) ? prev : scope));
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
            workspaceScope,
            setWorkspaceScope,
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
            collapseCommandSurfaceAfterNavigation,
            commandSurfaceJobCardUi,
            setCommandSurfaceJobCardUi,
        }),
        [
            commandSurfaceMode,
            currentContext,
            workspaceScope,
            setWorkspaceScope,
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
            collapseCommandSurfaceAfterNavigation,
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
