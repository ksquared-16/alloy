/**
 * Operator field edit modal — section visibility and capability matrix (testable).
 */

import {
    canOperatorEditRequirementInline,
    FIELD_EDIT_LAYOUT_BEHAVIOR_NOTE,
    fieldBehaviorConfiguredOnRecordLayouts,
    operatorRequirementLockedReason,
} from "@/lib/fields/fieldSettingsOperatorUi";
import type { FieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

export type FieldEditModalSectionId =
    | "display_label"
    | "help_text"
    | "layout_behavior_note"
    | "staff_editability"
    | "staff_editability_locked_note"
    | "where_it_appears"
    | "legacy_required_checkbox"
    | "developer_details";

export type FieldEditModalContext = {
    entityType: string;
    policySettingsSupported: boolean;
    hasPolicyView: boolean;
    policyEditable: boolean;
    inlineRequirementEditable: boolean;
    layoutBehaviorOnRecordLayouts: boolean;
    developerDetailsOpen: boolean;
};

export type FieldEditModalCapabilities = {
    /** Policy-backed entity (opportunity, job). */
    policySettingsSupported: boolean;
    showStaffEditabilitySelect: boolean;
    showLegacyRequiredCheckbox: boolean;
    showStaffEditabilityLockedNote: boolean;
    staffEditabilityLockedNote: string;
    requirementSetInTableNote: boolean;
    /** Card 6 — behavior on Record layouts; hide policy controls in modal. */
    showLayoutBehaviorNote: boolean;
    layoutBehaviorNote: string;
};

export function buildFieldEditModalContext(params: {
    entityType: string;
    policySettingsSupported: boolean;
    policyView: FieldPolicySettingsView | null;
}): FieldEditModalContext {
    const hasPolicyView = Boolean(params.policyView);
    const policyEditable = Boolean(params.policyView?.policyEditable);
    const layoutBehaviorOnRecordLayouts = fieldBehaviorConfiguredOnRecordLayouts(params.entityType);
    return {
        entityType: params.entityType,
        policySettingsSupported: params.policySettingsSupported,
        hasPolicyView,
        policyEditable,
        layoutBehaviorOnRecordLayouts,
        inlineRequirementEditable:
            !layoutBehaviorOnRecordLayouts &&
            params.policySettingsSupported &&
            hasPolicyView &&
            canOperatorEditRequirementInline(params.policyView),
        developerDetailsOpen: false,
    };
}

export function buildFieldEditModalCapabilities(params: {
    entityType: string;
    fieldKey: string;
    policySettingsSupported: boolean;
    policyView: FieldPolicySettingsView | null;
}): FieldEditModalCapabilities {
    const { entityType, fieldKey, policySettingsSupported, policyView } = params;
    const hasPolicyView = Boolean(policyView);
    const policyEditable = Boolean(policyView?.policyEditable);

    if (fieldBehaviorConfiguredOnRecordLayouts(entityType) && policySettingsSupported) {
        return {
            policySettingsSupported: true,
            showStaffEditabilitySelect: false,
            showLegacyRequiredCheckbox: false,
            showStaffEditabilityLockedNote: false,
            staffEditabilityLockedNote: "",
            requirementSetInTableNote: false,
            showLayoutBehaviorNote: true,
            layoutBehaviorNote: FIELD_EDIT_LAYOUT_BEHAVIOR_NOTE,
        };
    }

    if (policySettingsSupported && hasPolicyView) {
        const lockedNote = policyEditable
            ? ""
            : operatorRequirementLockedReason(entityType, fieldKey, policyView);
        return {
            policySettingsSupported: true,
            showStaffEditabilitySelect: policyEditable,
            showLegacyRequiredCheckbox: false,
            showStaffEditabilityLockedNote: !policyEditable && Boolean(lockedNote),
            staffEditabilityLockedNote: lockedNote,
            requirementSetInTableNote: policyEditable,
            showLayoutBehaviorNote: false,
            layoutBehaviorNote: "",
        };
    }

    return {
        policySettingsSupported: false,
        showStaffEditabilitySelect: false,
        showLegacyRequiredCheckbox: true,
        showStaffEditabilityLockedNote: false,
        staffEditabilityLockedNote: "",
        requirementSetInTableNote: false,
        showLayoutBehaviorNote: false,
        layoutBehaviorNote: "",
    };
}

/** Sections shown in the default (non-developer) modal flow, in order. */
export function operatorFieldEditModalSections(ctx: FieldEditModalContext): FieldEditModalSectionId[] {
    const sections: FieldEditModalSectionId[] = ["display_label", "help_text"];

    if (ctx.layoutBehaviorOnRecordLayouts && ctx.policySettingsSupported) {
        sections.push("layout_behavior_note");
    } else if (ctx.policySettingsSupported && ctx.hasPolicyView && ctx.policyEditable) {
        sections.push("staff_editability");
    } else if (ctx.policySettingsSupported && ctx.hasPolicyView && !ctx.policyEditable) {
        sections.push("staff_editability_locked_note");
    } else if (!ctx.policySettingsSupported) {
        sections.push("legacy_required_checkbox");
    }

    sections.push("where_it_appears");

    if (ctx.developerDetailsOpen) {
        sections.push("developer_details");
    }

    return sections;
}

export function operatorModalShowsDeveloperDetailsByDefault(): boolean {
    return false;
}

export function operatorModalSectionIsVisible(
    section: FieldEditModalSectionId,
    ctx: FieldEditModalContext
): boolean {
    return operatorFieldEditModalSections(ctx).includes(section);
}
