"use client";

/**
 * React binding for the caller's own hide-only workspace visibility override (Access V3, S5). One
 * loader per browser tab, shared by the sidebar and the controls so a save is reflected in both.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import {
    workspaceVisibilityFromAdminAuth,
    type VisibilityPrincipal,
    type WorkspaceVisibility,
} from "@/lib/access/workspaceVisibility";
import {
    WorkspaceVisibilityOverrideLoader,
    appliedOverride,
    type OverrideEntry,
} from "@/lib/access/workspaceVisibilityOverrideLoader";

export const workspaceVisibilityOverrideLoader = new WorkspaceVisibilityOverrideLoader((input, init) => fetch(input, init));

/**
 * This principal's entry, or `null` while the principal is unknown. Loads once per principal, and
 * again if the entry is dropped (invalidate) or failed while this component stays mounted.
 */
export function useWorkspaceVisibilityOverride(principal: VisibilityPrincipal | null): OverrideEntry | null {
    const loader = workspaceVisibilityOverrideLoader;
    const userId = principal?.userId ?? "";
    const orgId = principal?.orgId ?? "";
    const known = Boolean(userId && orgId);
    const entry = useSyncExternalStore(
        loader.subscribe,
        () => (known ? loader.get({ userId, orgId }) : null),
        () => null,
    );
    useEffect(() => {
        if (known) loader.retainOnly({ userId, orgId });
    }, [loader, known, userId, orgId]);
    const missing = entry == null;
    useEffect(() => {
        if (known && missing) loader.ensure({ userId, orgId });
    }, [loader, known, missing, userId, orgId]);
    return entry;
}

export type OwnWorkspaceVisibility = {
    principal: VisibilityPrincipal | null;
    entry: OverrideEntry | null;
    /** Role defaults less the applied own override (when one is loaded for this principal). */
    visibility: WorkspaceVisibility;
    /** Role defaults alone — what the roles show, before any override. */
    roleDefaults: WorkspaceVisibility;
};

/** The current principal's workspace visibility: role defaults, then its own hide-only override. */
export function useOwnWorkspaceVisibility(): OwnWorkspaceVisibility {
    const auth = useAdminAuthOptional();
    const principal = useMemo(
        () => (auth?.userId && auth.orgId ? { userId: auth.userId, orgId: auth.orgId } : null),
        [auth?.userId, auth?.orgId],
    );
    const entry = useWorkspaceVisibilityOverride(principal);
    const override = appliedOverride(entry, principal);
    const roleDefaults = useMemo(() => workspaceVisibilityFromAdminAuth(auth, null), [auth]);
    const visibility = useMemo(
        () => (override ? workspaceVisibilityFromAdminAuth(auth, override) : roleDefaults),
        [auth, override, roleDefaults],
    );
    return { principal, entry, visibility, roleDefaults };
}
