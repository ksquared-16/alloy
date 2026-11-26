"use client";

/**
 * The queue's handle on "open this record" — deliberately its OWN module.
 *
 * `useFocusPanelOpen` is a `useContext` wrapper and nothing more, but it used to live in
 * `FocusPanelSurface.tsx`. Importing a value from that file drags its whole module graph:
 * `FocusPanelSurface` imports `InlineOpportunityFocusPanel`, which reaches the card registry, the
 * card implementations and the drawer. So `QueueRegion` — which needs one hook to open a row — pulled
 * the entire Focus Panel graph into the queue's own import chain, and the rows could not paint until
 * all of it had been fetched and parsed. Measured: rows appeared ~13 ms after the LAST of 78 chunks.
 *
 * A context and its hook have no dependencies worth splitting, so they sit here and both sides import
 * them. `FocusPanelSurface` still owns the PROVIDER; this file owns only the channel.
 */
import { createContext, useContext } from "react";

import type { QueueRowModel } from "@/lib/presentation/runtime";

export type FocusPanelOpenContextValue = {
    openRecord: (row: QueueRowModel) => void;
    prefetchRecord: (row: QueueRowModel) => void;
};

export const FocusPanelOpenContext = createContext<FocusPanelOpenContextValue | null>(null);

export function useFocusPanelOpen(): FocusPanelOpenContextValue {
    const ctx = useContext(FocusPanelOpenContext);
    if (!ctx) {
        throw new Error("useFocusPanelOpen must be used within FocusPanelSurface");
    }
    return ctx;
}
