"use client";

import { createContext, useContext, type ReactNode } from "react";

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
  return (
    <WorkspaceOrgContext.Provider
      value={{ orgName, orgId: orgId ?? null, principalUserId: principalUserId ?? null, accessScopeFingerprint: fp }}
    >
      {children}
    </WorkspaceOrgContext.Provider>
  );
}

export function useWorkspaceOrg(): WorkspaceOrgValue {
  return useContext(WorkspaceOrgContext);
}
