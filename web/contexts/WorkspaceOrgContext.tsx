"use client";

import { createContext, useContext, type ReactNode } from "react";

type WorkspaceOrgValue = {
  orgName: string | null;
  /** Server-resolved current org UUID — drives session cache keys under admin workspace. */
  orgId: string | null;
};

const WorkspaceOrgContext = createContext<WorkspaceOrgValue>({ orgName: null, orgId: null });

export function WorkspaceOrgProvider({
  orgName,
  orgId,
  children,
}: {
  orgName: string | null;
  orgId?: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceOrgContext.Provider value={{ orgName, orgId: orgId ?? null }}>
      {children}
    </WorkspaceOrgContext.Provider>
  );
}

export function useWorkspaceOrg(): WorkspaceOrgValue {
  return useContext(WorkspaceOrgContext);
}
