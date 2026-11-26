export type * from "@/lib/configRuntime/configurationObject/types";
export {
    ORGANIZATION_SURFACE_CLASSIFICATION,
    configurationObjectEligibleSurfaces,
} from "@/lib/configRuntime/configurationObject/eligibility";
export {
    resolveConfigurationObjectSelection,
    resolveConfigurationObjectConcernState,
    shouldApplyConfigurationObjectResponse,
} from "@/lib/configRuntime/configurationObject/selection";
export {
    visibleConfigurationObjectConcerns,
    resolveActiveConfigurationObjectConcern,
    configurationObjectConcernHref,
    configurationObjectCollectionHref,
} from "@/lib/configRuntime/configurationObject/concernRegistry";
export {
    createConfigurationObjectEditSession,
    beginConfigurationObjectEdit,
    patchConfigurationObjectDraft,
    cancelConfigurationObjectEdit,
    markConfigurationObjectSaving,
    failConfigurationObjectSave,
    completeConfigurationObjectSave,
    configurationObjectEditBlocksNavigation,
    isConfigurationObjectEditMode,
} from "@/lib/configRuntime/configurationObject/editingLifecycle";
export {
    projectConfigurationObjectOverviewRegions,
    CONFIGURATION_OBJECT_OVERVIEW_REGION_PURPOSE,
} from "@/lib/configRuntime/configurationObject/overview";
export {
    buildProgramsConfigurationObjectDescriptor,
    PROGRAMS_WORKSPACE_SIBLING_CHAPTERS,
} from "@/lib/configRuntime/configurationObject/programsAdoptionSeam";
export {
    CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR,
    CONFIGURATION_OBJECT_HARNESS_DOMAIN_ID,
    CONFIGURATION_OBJECT_HARNESS_FIXTURES,
    harnessCollectionItems,
    harnessIdentity,
    harnessRecord,
} from "@/lib/configRuntime/configurationObject/harnessFixture";
