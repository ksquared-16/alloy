export {
    compileOpportunityDrawerShell,
    compileOpportunityDrawerShellFromEntity,
    drawerShellToOpportunityRecordContract,
    opportunityShellToDrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity/compileShell";

export { readOpportunityDrawerGeometry } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/geometry";
export type { OpportunityDrawerGeometry } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/geometry";

export {
    OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS,
    OPPORTUNITY_PRIMARY_SHELL_ATTACHES,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity/deferredSections";

export {
    buildOpportunityAboveFoldRenderModel,
    overviewSectionsFromAboveFoldModel,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildAboveFoldRenderModel";

export { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildPipelineState";
