import type { LayoutSettingsEntityKey } from "@/lib/adminV2/layoutsSettingsEntities";

export type LayoutSectionEditorCapability = {
    entity: LayoutSettingsEntityKey;
    supportsSectionOrder: boolean;
    supportsSectionVisibility: boolean;
    supportsWorkflowSectionRename: boolean;
    supportsAddHiddenSection: boolean;
    unavailableReason: string | null;
};

export function layoutSectionEditorCapability(entity: LayoutSettingsEntityKey): LayoutSectionEditorCapability {
    if (entity === "opportunity") {
        return {
            entity,
            supportsSectionOrder: true,
            supportsSectionVisibility: true,
            supportsWorkflowSectionRename: true,
            supportsAddHiddenSection: true,
            unavailableReason: null,
        };
    }
    return {
        entity,
        supportsSectionOrder: false,
        supportsSectionVisibility: false,
        supportsWorkflowSectionRename: false,
        supportsAddHiddenSection: false,
        unavailableReason: `Section configuration for ${entity} records is coming later. Preview the resolved layout below.`,
    };
}
