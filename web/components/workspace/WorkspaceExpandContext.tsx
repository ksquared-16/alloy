"use client";

/**
 * Shared Workspace expand/restore — owned by the Operational Workspace modal shell.
 * Modules (Assignments, Processing, Communications, Work Items) consume the same
 * context; no feature-local full-screen CSS.
 */

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from "react";

export type WorkspaceExpandContextValue = {
    expanded: boolean;
    expand: () => void;
    restore: () => void;
    toggle: () => void;
};

const WorkspaceExpandContext = createContext<WorkspaceExpandContextValue | null>(null);

/** Controlled provider — shell owns expanded state (Escape restore, geometry, z-index). */
export function WorkspaceExpandProvider({
    children,
    expanded,
    onExpandedChange,
}: {
    children: ReactNode;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
}) {
    const expand = useCallback(() => onExpandedChange(true), [onExpandedChange]);
    const restore = useCallback(() => onExpandedChange(false), [onExpandedChange]);
    const toggle = useCallback(
        () => onExpandedChange(!expanded),
        [expanded, onExpandedChange],
    );

    const value = useMemo(
        () => ({ expanded, expand, restore, toggle }),
        [expanded, expand, restore, toggle],
    );

    return (
        <WorkspaceExpandContext.Provider value={value}>{children}</WorkspaceExpandContext.Provider>
    );
}

export function useWorkspaceExpand(): WorkspaceExpandContextValue {
    const ctx = useContext(WorkspaceExpandContext);
    if (!ctx) {
        return {
            expanded: false,
            expand: () => {},
            restore: () => {},
            toggle: () => {},
        };
    }
    return ctx;
}
