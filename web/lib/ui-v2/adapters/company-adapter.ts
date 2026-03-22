import type { ContextBlockConfig } from "../context-config";
import type { CompanyWorkspaceModel, ContextBlockVm } from "../workspace-types";
import { normalizeContextRelationshipGroups, type ContextRelationshipRawData } from "./context-adapter";

export type ToCompanyWorkspaceModelInput = {
  model: Omit<CompanyWorkspaceModel, "workspaceLevel" | "contextRail">;
  contextConfig?: ContextBlockConfig | null;
  contextRaw?: ContextRelationshipRawData;
  role?: string;
};

/**
 * Pre-built company model + optional context normalization (organization-level groups).
 */
export function toCompanyWorkspaceModel(input: ToCompanyWorkspaceModelInput): CompanyWorkspaceModel {
  const { model, contextConfig, contextRaw, role } = input;
  let contextRail: ContextBlockVm = { groups: [] };
  if (contextConfig && contextRaw) {
    contextRail = normalizeContextRelationshipGroups(contextConfig, contextRaw, {
      level: "organization",
      role,
    });
  }
  return {
    workspaceLevel: "company",
    ...model,
    contextRail,
  };
}
