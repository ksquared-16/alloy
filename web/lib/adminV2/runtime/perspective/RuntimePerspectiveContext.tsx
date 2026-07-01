"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import { runtimePerspectiveSignature } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";

/**
 * Single runtime source of the active Perspective.
 *
 * The active Perspective is owned by the work-unit page (where `selectedQueueKey`,
 * `selectedQueueKeyRef`, and `workUnit.queue_definition` live). The page publishes it
 * here via {@link setActiveRuntimePerspective}. Because the runtime split controller and
 * BOS live in different parts of the React tree (siblings, not descendants), the source
 * of truth is a small external store read with `useSyncExternalStore` — the context
 * provider below is an ergonomic in-tree wrapper over the same store.
 */

let activePerspective: RuntimePerspective | null = null;
let activeSignature = "";
const listeners = new Set<() => void>();

export function getActiveRuntimePerspective(): RuntimePerspective | null {
    return activePerspective;
}

function getServerSnapshot(): RuntimePerspective | null {
    return null;
}

export function subscribeRuntimePerspective(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Publish the active Perspective (no-op when unchanged by signature). */
export function setActiveRuntimePerspective(perspective: RuntimePerspective | null): void {
    const nextSignature = runtimePerspectiveSignature(perspective);
    if (nextSignature === activeSignature && perspective === activePerspective) return;
    if (nextSignature === activeSignature && activePerspective != null && perspective != null) {
        // Same identity signature — keep latest object but avoid notifying churn.
        activePerspective = perspective;
        return;
    }
    activePerspective = perspective;
    activeSignature = nextSignature;
    for (const listener of listeners) listener();
}

/** Read the active Perspective reactively from anywhere in the tree. */
export function useActiveRuntimePerspective(): RuntimePerspective | null {
    return useSyncExternalStore(subscribeRuntimePerspective, getActiveRuntimePerspective, getServerSnapshot);
}

const RuntimePerspectiveContext = createContext<RuntimePerspective | null>(null);

/** In-tree provider that mirrors the external store into React context for descendants. */
export function RuntimePerspectiveProvider({ children }: { children: ReactNode }) {
    const perspective = useActiveRuntimePerspective();
    return (
        <RuntimePerspectiveContext.Provider value={perspective}>{children}</RuntimePerspectiveContext.Provider>
    );
}

/** Context hook for descendants; falls back to the store if no provider is mounted. */
export function useRuntimePerspective(): RuntimePerspective | null {
    const ctx = useContext(RuntimePerspectiveContext);
    const store = useActiveRuntimePerspective();
    return ctx ?? store;
}
