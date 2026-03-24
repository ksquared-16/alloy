import type { DemoIndustryId, DemoWorkspaceLevelId } from "./workspace-demo-types";
import {
  resolveDemoWorkspaceSlices,
  type DemoSelectedContext,
  type IndustryWorkspaceDemoBundle,
  DEMO_FLOW_DEFAULT_CONTEXT,
} from "./workspace-demo-navigation";

export type { DemoIndustryId, DemoWorkspaceLevelId } from "./workspace-demo-types";
export {
  DEMO_DEFAULT_INDUSTRY,
  DEMO_DEFAULT_LEVEL,
  DEMO_INDUSTRY_OPTIONS,
  DEMO_LEVEL_OPTIONS,
} from "./workspace-demo-types";

export type { DemoSelectedContext, IndustryWorkspaceDemoBundle };
export { resolveDemoWorkspaceSlices, DEMO_FLOW_DEFAULT_CONTEXT };

/**
 * Canonical demo inputs per industry with empty drill context (backward compatible).
 * Prefer `resolveDemoWorkspaceSlices(industry, selectedContext)` when context is non-empty.
 */
export const INDUSTRY_WORKSPACE_DEMOS: Record<DemoIndustryId, IndustryWorkspaceDemoBundle> = {
  home_services: resolveDemoWorkspaceSlices("home_services", {}),
  childcare: resolveDemoWorkspaceSlices("childcare", {}),
  insurance: resolveDemoWorkspaceSlices("insurance", {}),
};
