"use client";

import { useEffect } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { notifyWorkspaceSiteFilterPersistenceScope } from "@/contexts/WorkspaceSiteFilterContext";

/** Registers org/principal/fingerprint for workspace site sessionStorage keys (layout runs under `WorkspaceOrgProvider`). */
export default function WorkspaceSiteFilterPersistenceScopeBridge() {
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();

    useEffect(() => {
        notifyWorkspaceSiteFilterPersistenceScope({
            orgId,
            principalUserId,
            accessScopeFingerprint,
        });
    }, [orgId, principalUserId, accessScopeFingerprint]);

    return null;
}
