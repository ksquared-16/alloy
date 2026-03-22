import type { ContextBlockConfig } from "../context-config";
import type { WorkUnitWorkspaceModel, WorkUnitWorkspaceSourcePayload } from "../workspace-types";
import { normalizeContextRelationshipGroups, type ContextRelationshipRawData } from "./context-adapter";

export type ToWorkUnitWorkspaceModelInput = {
  model: Omit<WorkUnitWorkspaceModel, "workspaceLevel">;
  contextConfig?: ContextBlockConfig | null;
  contextRaw?: ContextRelationshipRawData;
  role?: string;
};

export function toWorkUnitWorkspaceModel(input: ToWorkUnitWorkspaceModelInput): WorkUnitWorkspaceModel {
  const { model, contextConfig, contextRaw, role } = input;
  let contextPanel = model.contextPanel;
  if (contextConfig && contextRaw) {
    contextPanel = normalizeContextRelationshipGroups(contextConfig, contextRaw, {
      level: "work_unit",
      role,
    });
  }
  return {
    workspaceLevel: "work_unit",
    ...model,
    contextPanel,
  };
}

export function toWorkUnitWorkspaceModelFromPayload(_payload: WorkUnitWorkspaceSourcePayload): WorkUnitWorkspaceModel {
  throw new Error(
    "toWorkUnitWorkspaceModelFromPayload: scaffold — implement when work-unit API is defined."
  );
}
