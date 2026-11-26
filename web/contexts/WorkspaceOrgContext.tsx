"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { setCurrentWorkspaceScope } from "@/lib/workspace/currentWorkspaceScope";

type WorkspaceOrgValue = {
  orgName: string | null;
  /** Server-resolved current org UUID — drives session cache keys under admin workspace. */
  orgId: string | null;
  /** Auth user id — session cache must not reuse another principal’s workspace snapshot on the same org. */
  principalUserId: string | null;
  /**
   * Effective dept/site access dimensions — session cache keys must vary when scope changes for the same user.
   */
  accessScopeFingerprint: string;
};

const WorkspaceOrgContext = createContext<WorkspaceOrgValue>({
  orgName: null,
  orgId: null,
  principalUserId: null,
  accessScopeFingerprint: "scope:unknown",
});

export function WorkspaceOrgProvider({
  orgName,
  orgId,
  principalUserId,
  accessScopeFingerprint,
  children,
}: {
  orgName: string | null;
  orgId?: string | null;
  principalUserId?: string | null;
  accessScopeFingerprint: string;
  children: ReactNode;
}) {
  const fp = typeof accessScopeFingerprint === "string" && accessScopeFingerprint.trim() ? accessScopeFingerprint.trim() : "scope:unknown";
  // Publish the live workspace scope for non-React prewarm affordances (sidebar / shell nav) so their
  // Work Unit surface prewarm keys match the runtime's session-cache scope exactly.
  useEffect(() => {
    setCurrentWorkspaceScope({ orgId: orgId ?? null, userId: principalUserId ?? null, scopeFingerprint: fp });
  }, [orgId, principalUserId, fp]);
  // Stable value identity (all primitives): consumers re-render only when a field actually changes,
  // not on every unrelated parent render — this provider wraps the whole runtime tree.
  const value = useMemo<WorkspaceOrgValue>(
    () => ({ orgName, orgId: orgId ?? null, principalUserId: principalUserId ?? null, accessScopeFingerprint: fp }),
    [orgName, orgId, principalUserId, fp],
  );
  return <WorkspaceOrgContext.Provider value={value}>{children}</WorkspaceOrgContext.Provider>;
}

export function useWorkspaceOrg(): WorkspaceOrgValue {
  return useContext(WorkspaceOrgContext);
}
