export type {
    DrawerAboveFoldRenderModel,
    DrawerEnrichmentPhase,
    DrawerEnrichmentState,
    DrawerHydrationPlan,
    DrawerInquirySummaryColumnMode,
    DrawerPipelineState,
    DrawerRecordSurface,
    DrawerSectionLifecycle,
    DrawerSectionRenderModel,
    DrawerSectionSlot,
    DrawerSectionValuePhase,
    DrawerShellContract,
    DrawerTaskPreviewRenderSlot,
    DrawerWhatMattersRenderSlot,
    DrawerFamilyContactsRenderSlot,
} from "@/lib/adminV2/drawerPipeline/types";

export {
    buildDrawerEnrichmentState,
    drawerRecordHydrationPending,
    drawerRelationshipsFullHydrateFailed,
} from "@/lib/adminV2/drawerPipeline/enrichmentState";

export {
    drawerAboveFoldLayoutLocked,
    drawerBelowFoldEnrichmentReady,
    drawerFullBoundValuesReady,
    drawerLayoutFirstPaintGatesActive,
} from "@/lib/adminV2/drawerPipeline/layoutLock";

export {
    buildSectionRenderModels,
    stabilizeOverviewSectionsFromShell,
} from "@/lib/adminV2/drawerPipeline/sectionRenderModel";

export { buildDrawerHydrationPlan } from "@/lib/adminV2/drawerPipeline/hydrationPlan";

export {
    buildOpportunityDrawerPipelineState,
    buildOpportunityAboveFoldRenderModel,
    compileOpportunityDrawerShell,
    compileOpportunityDrawerShellFromEntity,
    drawerShellToOpportunityRecordContract,
    opportunityShellToDrawerShellContract,
    overviewSectionsFromAboveFoldModel,
    readOpportunityDrawerGeometry,
    OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS,
    OPPORTUNITY_PRIMARY_SHELL_ATTACHES,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity";
