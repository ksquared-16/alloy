"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DrawerTabKey } from "@/lib/entityPresentation";

export type LayoutRuntimeDrawerHostActions = {
    /** Switch drawer tab from overview widgets (e.g. View all activity). */
    onSelectDrawerTab?: (tab: DrawerTabKey) => void;
    /** Open linked Lead / Opportunity drawer from relationship overview surfaces. */
    onOpenOpportunity?: (opportunityId: string) => void;
    /** Tab key used for full activity history on this drawer surface. */
    activityTabKey?: DrawerTabKey;
};

const LayoutRuntimeDrawerHostContext = createContext<LayoutRuntimeDrawerHostActions>({});

export function LayoutRuntimeDrawerHostProvider({
    value,
    children,
}: {
    value: LayoutRuntimeDrawerHostActions;
    children: ReactNode;
}) {
    return (
        <LayoutRuntimeDrawerHostContext.Provider value={value}>{children}</LayoutRuntimeDrawerHostContext.Provider>
    );
}

export function useLayoutRuntimeDrawerHost(): LayoutRuntimeDrawerHostActions {
    return useContext(LayoutRuntimeDrawerHostContext);
}
