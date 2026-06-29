"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

/**
 * Carries the server-resolved `/workspace` first-paint seed (lifecycle landing cards) from the
 * workspace server layout into the client landing page, so the surface reveals once with tiles
 * already present (Operational Runtime Doctrine Laws 1/3/5). Empty by default → the client page
 * behaves exactly as before (additive; runtime-flag rollback path intact).
 */
const WorkspaceFirstPaintSeedContext = createContext<readonly OperatorLifecycleLandingCard[]>([]);

export function WorkspaceFirstPaintSeedProvider({
    initialLifecycleCards = [],
    children,
}: {
    initialLifecycleCards?: readonly OperatorLifecycleLandingCard[];
    children: ReactNode;
}) {
    return (
        <WorkspaceFirstPaintSeedContext.Provider value={initialLifecycleCards}>
            {children}
        </WorkspaceFirstPaintSeedContext.Provider>
    );
}

/** Server-seeded lifecycle landing cards for `/workspace` first paint; `[]` when not seeded. */
export function useWorkspaceFirstPaintLifecycleSeed(): readonly OperatorLifecycleLandingCard[] {
    return useContext(WorkspaceFirstPaintSeedContext);
}
