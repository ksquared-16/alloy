/**
 * Record drawer layout composition capabilities (Settings control plane).
 * BOS: human operators and config_layout_assist proposals use the same mutation classes and admin APIs.
 * @see docs/product/bos-foundation.md
 * @see docs/sprints/05_2026/record_experience_builder_phase_1.md
 */

import type { LayoutSettingsEntityKey } from "@/lib/adminV2/layoutsSettingsEntities";
import {
    LAYOUT_MUTATION_CLASS,
    type LayoutMutationClass,
} from "@/lib/adminV2/layouts/layoutMutationClasses";

/** BOS capability that may propose/apply layout composition deltas (no separate AI architecture). */
export const LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY = "config_layout_assist" as const;

export type LayoutCompositionFidelity =
    | "opportunity_runtime_mirror"
    | "person_runtime_mirror"
    | "presentation_ordered_skeleton";

export type LayoutCompositionCapabilitiesInput = {
    entity: LayoutSettingsEntityKey;
    /** From effective-preview `workflow.workflow_v1_configured`. */
    workflowV1Configured?: boolean;
    /** From effective-preview `person_runtime.runtime_v1_active`. */
    personRuntimeV1Active?: boolean;
};

export type LayoutCompositionCapabilities = {
    entity: LayoutSettingsEntityKey;
    fidelity: LayoutCompositionFidelity;
    isReadOnly: boolean;
    canManageSections: boolean;
    canAssignFields: boolean;
    canPreviewActions: boolean;
    canUseLinkedBlocks: boolean;
    supportsWorkflowVirtualSections: boolean;
    supportsFieldReorder: boolean;
    supportsSectionArchive: boolean;
    allowedMutationClasses: LayoutMutationClass[];
    primaryBosCapability: typeof LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY;
    readOnlyReason: string | null;
};

function opportunityEditable(workflowV1Configured: boolean): LayoutCompositionCapabilities {
    if (!workflowV1Configured) {
        return {
            entity: "opportunity",
            fidelity: "opportunity_runtime_mirror",
            isReadOnly: true,
            canManageSections: false,
            canAssignFields: false,
            canPreviewActions: false,
            canUseLinkedBlocks: false,
            supportsWorkflowVirtualSections: false,
            supportsFieldReorder: false,
            supportsSectionArchive: false,
            allowedMutationClasses: [],
            primaryBosCapability: LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
            readOnlyReason:
                "Drawer composition editing requires inquiry workflow v1 on the effective opportunity layout. Section order may still be viewable in preview.",
        };
    }
    return {
        entity: "opportunity",
        fidelity: "opportunity_runtime_mirror",
        isReadOnly: false,
        canManageSections: true,
        canAssignFields: true,
        canPreviewActions: true,
        canUseLinkedBlocks: true,
        supportsWorkflowVirtualSections: true,
        supportsFieldReorder: true,
        supportsSectionArchive: true,
        allowedMutationClasses: [
            LAYOUT_MUTATION_CLASS.A_DRAWER_CHROME,
            LAYOUT_MUTATION_CLASS.B_FIELD_PLACEMENT,
            LAYOUT_MUTATION_CLASS.C_CATALOG_SECTION,
            LAYOUT_MUTATION_CLASS.D_ACTIONS_READ_ONLY,
        ],
        primaryBosCapability: LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
        readOnlyReason: null,
    };
}

function readOnlyEntity(
    entity: LayoutSettingsEntityKey,
    reason: string
): LayoutCompositionCapabilities {
    return {
        entity,
        fidelity: "presentation_ordered_skeleton",
        isReadOnly: true,
        canManageSections: false,
        canAssignFields: false,
        canPreviewActions: false,
        canUseLinkedBlocks: false,
        supportsWorkflowVirtualSections: false,
        supportsFieldReorder: false,
        supportsSectionArchive: entity === "opportunity",
        allowedMutationClasses: entity === "opportunity" ? [LAYOUT_MUTATION_CLASS.C_CATALOG_SECTION] : [],
        primaryBosCapability: LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
        readOnlyReason: reason,
    };
}

export function resolveLayoutCompositionCapabilities(
    input: LayoutCompositionCapabilitiesInput
): LayoutCompositionCapabilities {
    const workflowV1Configured = input.workflowV1Configured === true;

    if (input.entity === "opportunity") {
        return opportunityEditable(workflowV1Configured);
    }
    if (input.entity === "job") {
        return readOnlyEntity(
            "job",
            "Job drawer section order is not editable here yet. Use Fields and Field grouping for field catalog changes; preview shows template ordering."
        );
    }
    if (input.entity === "schedule") {
        return readOnlyEntity(
            "schedule",
            "Schedule drawer composition uses layout blocks and global templates. Editing from Layouts is not supported in this phase."
        );
    }
    if (input.entity === "person") {
        const runtimeActive = input.personRuntimeV1Active === true;
        return {
            entity: "person",
            fidelity: runtimeActive ? "person_runtime_mirror" : "presentation_ordered_skeleton",
            isReadOnly: true,
            canManageSections: false,
            canAssignFields: false,
            canPreviewActions: false,
            canUseLinkedBlocks: false,
            supportsWorkflowVirtualSections: false,
            supportsFieldReorder: false,
            supportsSectionArchive: false,
            allowedMutationClasses: [],
            primaryBosCapability: LAYOUT_COMPOSITION_PRIMARY_BOS_CAPABILITY,
            readOnlyReason:
                "Person drawer layouts use Runtime v1 operating variants (child, parent, generic). Review effective variants below. Editing from Layouts is deferred to a later phase.",
        };
    }
    return readOnlyEntity(
        input.entity,
        "Drawer composition editing is not supported for this record type in this phase."
    );
}

/** Whether Class B mutations are allowed for the current capabilities. */
export function layoutCompositionAllowsFieldPlacement(cap: LayoutCompositionCapabilities): boolean {
    return !cap.isReadOnly && cap.canAssignFields && cap.supportsFieldReorder;
}
