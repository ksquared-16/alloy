"use client";

import { useSyncExternalStore } from "react";
import {
    getAdminV2NavigationTransitionSnapshot,
    subscribeAdminV2NavigationTransition,
    type AdminV2NavigationTransitionSnapshot,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

const SERVER_SNAPSHOT = getAdminV2NavigationTransitionSnapshot();

/**
 * React subscription to the module transition store (Card 2+ shell / page wiring).
 */
export function useAdminV2NavigationTransition(): AdminV2NavigationTransitionSnapshot {
    return useSyncExternalStore(
        subscribeAdminV2NavigationTransition,
        getAdminV2NavigationTransitionSnapshot,
        () => SERVER_SNAPSHOT
    );
}
