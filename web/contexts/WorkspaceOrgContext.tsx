"use client";

import { createContext, useContext, type ReactNode } from "react";

type WorkspaceOrgValue = {
  orgName: string | null;
  /** Server-resolved current org UUID — drives session cache keys under admin workspace. */
  orgId: string | null;
  /** Auth user id — session cache must not reuse another principal’s workspace snapshot on the same org. */
  principalUserId: string | null;
};

const WorkspaceOrgContext = createContext<WorkspaceOrgValue>({
  orgName: null,
  orgId: null,
  principalUserId: null,
});

export function WorkspaceOrgProvider({
  orgName,
  orgId,
  principalUserId,
  children,
}: {
  orgName: string | null;
  orgId?: string | null;
  principalUserId?: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceOrgContext.Provider
      value={{ orgName, orgId: orgId ?? null, principalUserId: principalUserId ?? null }}
    >
      {children}
    </WorkspaceOrgContext.Provider>
  );
}

export function useWorkspaceOrg(): WorkspaceOrgValue {
  return useContext(WorkspaceOrgContext);
}
