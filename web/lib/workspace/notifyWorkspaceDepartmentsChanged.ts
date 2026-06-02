"use client";

import { invalidateAdminV2WorkspaceSessionCache } from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { buildAccessScopeCacheFingerprint } from "@/lib/admin/accessScope";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { bustWorkspaceDepartmentsFetchDedupe } from "@/lib/workspace/workspaceAdminFetchDedupe";

/**
 * After lifecycle builder creates/deletes a department, bust workspace session cache
 * so the next /workspace visit does not hydrate stale department tiles.
 */
export function notifyWorkspaceDepartmentsChanged(
    orgId: string | null,
    principalUserId: string | null,
    accessScopeFingerprintOrDim?: string | AdminAccessScopeDimensions | null
): void {
    if (!orgId || typeof window === "undefined") return;
    const fp =
        typeof accessScopeFingerprintOrDim === "string"
            ? accessScopeFingerprintOrDim
            : accessScopeFingerprintOrDim
              ? buildAccessScopeCacheFingerprint(accessScopeFingerprintOrDim)
              : "";
    invalidateAdminV2WorkspaceSessionCache(orgId, principalUserId, fp || null);
    bustWorkspaceDepartmentsFetchDedupe();
    try {
        window.dispatchEvent(new CustomEvent("alloy:workspace-departments-changed", { detail: { orgId } }));
    } catch {
        /* ignore */
    }
}
