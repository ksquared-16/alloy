"use client";

import { useEffect, useMemo } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { notifyWorkspaceSiteFilterPersistenceScope } from "@/contexts/WorkspaceSiteFilterContext";
import { registerWorkspaceSiteFilterPersistenceScope } from "@/lib/adminV2/workspaceSiteFilterClient";

/** Registers org/principal/fingerprint for workspace site sessionStorage keys (layout runs under `WorkspaceOrgProvider`). */
export default function WorkspaceSiteFilterPersistenceScopeBridge() {
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();

    const scope = useMemo(
        () => ({
            orgId,
            principalUserId,
            accessScopeFingerprint,
        }),
        [orgId, principalUserId, accessScopeFingerprint]
    );

    if (typeof window !== "undefined") {
        registerWorkspaceSiteFilterPersistenceScope(scope);
    }

    useEffect(() => {
        notifyWorkspaceSiteFilterPersistenceScope(scope);
    }, [scope]);

    return null;
}
