"use client";

import { useSyncExternalStore } from "react";

import {
    getAdminV2WorkspaceModal,
    subscribeAdminV2WorkspaceModal,
    type AdminV2WorkspaceModalKey,
} from "@/lib/adminV2/workspaceModalCoordinator";

/**
 * Active shell-level workspace modal (inbox / processing / tasks / analytics), or null.
 *
 * Lets the left rail reflect the open operational workspace: when a modal is open its
 * sidebar item is the active anchor, and route-based active state defers to it. SSR /
 * first client render is always `null` (no modal open on the server), so no hydration drift.
 */
export function useActiveAdminV2WorkspaceModal(): AdminV2WorkspaceModalKey | null {
    return useSyncExternalStore(subscribeAdminV2WorkspaceModal, getAdminV2WorkspaceModal, () => null);
}
