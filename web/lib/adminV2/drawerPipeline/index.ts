export type {
    DrawerAboveFoldRenderModel,
    DrawerEnrichmentPhase,
    DrawerEnrichmentState,
    DrawerHeaderSignalsRenderSlot,
    DrawerHydrationPlan,
    DrawerInquirySummaryColumnMode,
    DrawerPipelineState,
    DrawerRecordSurface,
    DrawerSectionLifecycle,
    DrawerSectionRenderModel,
    DrawerSectionSlot,
    DrawerSectionValuePhase,
    DrawerShellContract,
    DrawerSignalTone,
    DrawerTaskPreviewRenderSlot,
    DrawerWhatMattersRenderSlot,
    DrawerFamilyContactsRenderSlot,
} from "@/lib/adminV2/drawerPipeline/types";

export { compileDrawerShellFromSections } from "@/lib/adminV2/drawerPipeline/compileShellFromSections";
export { assembleDrawerPipelineState } from "@/lib/adminV2/drawerPipeline/assemblePipelineState";
export { overviewSectionsFromAboveFoldModel } from "@/lib/adminV2/drawerPipeline/overviewSections";

export {
    buildDrawerEnrichmentState,
    drawerRecordHydrationPending,
    drawerRelationshipsFullHydrateFailed,
} from "@/lib/adminV2/drawerPipeline/enrichmentState";

export {
    drawerAboveFoldLayoutLocked,
    drawerBelowFoldEnrichmentReady,
    drawerFullBoundValuesReady,
    drawerOperationalStripReady,
    drawerLayoutFirstPaintGatesActive,
} from "@/lib/adminV2/drawerPipeline/layoutLock";

export {
    buildSectionRenderModels,
    stabilizeOverviewSectionsFromShell,
} from "@/lib/adminV2/drawerPipeline/sectionRenderModel";

export {
    buildJobDrawerPipelineState,
    compileJobDrawerShell,
    JOB_DRAWER_V2_OVERVIEW_SECTIONS,
    JOB_DEFERRED_OVERVIEW_SECTION_KEYS,
} from "@/lib/adminV2/drawerPipeline/adapters/job";

export { buildDrawerHydrationPlan } from "@/lib/adminV2/drawerPipeline/hydrationPlan";

export {
    buildOpportunityDrawerPipelineState,
    buildOpportunityAboveFoldRenderModel,
    compileOpportunityDrawerShell,
    compileOpportunityDrawerShellFromEntity,
    drawerShellToOpportunityRecordContract,
    opportunityShellToDrawerShellContract,
    readOpportunityDrawerGeometry,
    OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS,
    OPPORTUNITY_PRIMARY_SHELL_ATTACHES,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity";
