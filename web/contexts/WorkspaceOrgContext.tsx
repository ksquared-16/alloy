"use client";

import { createContext, useContext, type ReactNode } from "react";

type WorkspaceOrgValue = {
  orgName: string | null;
};

const WorkspaceOrgContext = createContext<WorkspaceOrgValue>({ orgName: null });

export function WorkspaceOrgProvider({
  orgName,
  children,
}: {
  orgName: string | null;
  children: ReactNode;
}) {
  return <WorkspaceOrgContext.Provider value={{ orgName }}>{children}</WorkspaceOrgContext.Provider>;
}

export function useWorkspaceOrg(): WorkspaceOrgValue {
  return useContext(WorkspaceOrgContext);
}
