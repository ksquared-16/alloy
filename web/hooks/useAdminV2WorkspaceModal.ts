"use client";

import { useSyncExternalStore } from "react";

import {
    getAdminV2WorkspaceModalSnapshot,
    subscribeAdminV2WorkspaceModal,
    type AdminV2WorkspaceModalKey,
} from "@/lib/adminV2/workspaceModalCoordinator";

export function useAdminV2WorkspaceModal(): AdminV2WorkspaceModalKey | null {
    return useSyncExternalStore(
        subscribeAdminV2WorkspaceModal,
        () => getAdminV2WorkspaceModalSnapshot().active,
        () => null
    );
}
