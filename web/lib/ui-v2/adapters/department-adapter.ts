import type { ContextBlockConfig } from "../context-config";
import type {
  ContextBlockVm,
  DepartmentWorkspaceModel,
  DepartmentWorkspaceSourcePayload,
} from "../workspace-types";
import { normalizeContextRelationshipGroups, type ContextRelationshipRawData } from "./context-adapter";

/**
 * When backend payloads are already view-model shaped, pass through with validation hooks later.
 * For now: identity merge for pre-built models + optional context normalization.
 */
export type ToDepartmentWorkspaceModelInput = {
  /** Pre-normalized workspace content (context rail supplied via adapter + config) */
  model: Omit<DepartmentWorkspaceModel, "workspaceLevel" | "contextRail">;
  contextConfig?: ContextBlockConfig | null;
  contextRaw?: ContextRelationshipRawData;
  level?: "department";
  role?: string;
};

export function toDepartmentWorkspaceModel(input: ToDepartmentWorkspaceModelInput): DepartmentWorkspaceModel {
  const { model, contextConfig, contextRaw, role } = input;
  let contextRail: ContextBlockVm = { groups: [] };
  if (contextConfig && contextRaw) {
    contextRail = normalizeContextRelationshipGroups(contextConfig, contextRaw, {
      level: "department",
      role,
    });
  }
  return {
    workspaceLevel: "department",
    ...model,
    contextRail,
  };
}

/**
 * Stub for future: map arbitrary API payload → DepartmentWorkspaceModel.
 * Implement field mapping per endpoint when wired — keeps blocks decoupled.
 */
export function toDepartmentWorkspaceModelFromPayload(
  _payload: DepartmentWorkspaceSourcePayload,
  _context?: { contextConfig?: ContextBlockConfig; contextRaw?: ContextRelationshipRawData; role?: string }
): DepartmentWorkspaceModel {
  throw new Error(
    "toDepartmentWorkspaceModelFromPayload: wire API mapping when backend contract is available. Use demo models or toDepartmentWorkspaceModel() with a built model."
  );
}
