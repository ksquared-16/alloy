"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type GlobalAssistantEntityType = "opportunities";

export type GlobalAssistantAction = "draft_sms" | "draft_email" | "schedule" | "reminder";

export type GlobalAssistantSourceSurface = "opportunity_drawer" | "header" | "queue" | "global_shell";

export type GlobalAssistantEntityContext = {
    entity_type: GlobalAssistantEntityType;
    entity_id: string;
    label: string;
    source_surface: GlobalAssistantSourceSurface;
    available_actions?: GlobalAssistantAction[];
};

type GlobalAssistantContextValue = {
    isOpen: boolean;
    currentContext: GlobalAssistantEntityContext | null;
    openAssistant: () => void;
    closeAssistant: () => void;
    setAssistantContext: (context: GlobalAssistantEntityContext | null) => void;
    openAssistantWithContext: (context: GlobalAssistantEntityContext) => void;
};

const GlobalAssistantContext = createContext<GlobalAssistantContextValue | null>(null);

export function GlobalAssistantProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentContext, setCurrentContext] = useState<GlobalAssistantEntityContext | null>(null);

    const openAssistant = useCallback(() => {
        setIsOpen(true);
    }, []);

    const closeAssistant = useCallback(() => {
        setIsOpen(false);
    }, []);

    const setAssistantContext = useCallback((context: GlobalAssistantEntityContext | null) => {
        setCurrentContext(context);
    }, []);

    const openAssistantWithContext = useCallback((context: GlobalAssistantEntityContext) => {
        setCurrentContext(context);
        setIsOpen(true);
    }, []);

    const value = useMemo(
        () => ({
            isOpen,
            currentContext,
            openAssistant,
            closeAssistant,
            setAssistantContext,
            openAssistantWithContext,
        }),
        [isOpen, currentContext, openAssistant, closeAssistant, setAssistantContext, openAssistantWithContext]
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

/** Optional hook for components that may render outside the provider (e.g. tests). */
export function useGlobalAssistantOptional(): GlobalAssistantContextValue | null {
    return useContext(GlobalAssistantContext);
}
