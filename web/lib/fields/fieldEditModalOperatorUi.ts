/**
 * Pass 3 — operator field edit modal section visibility (testable).
 */

export type FieldEditModalSectionId =
    | "display_label"
    | "help_text"
    | "staff_editability"
    | "where_it appears"
    | "legacy_required_checkbox"
    | "developer_details";

export type FieldEditModalContext = {
    policySettingsSupported: boolean;
    hasPolicyView: boolean;
    policyEditable: boolean;
    inlineRequirementEditable: boolean;
    developerDetailsOpen: boolean;
};

/** Sections shown in the default (non-developer) modal flow, in order. */
export function operatorFieldEditModalSections(ctx: FieldEditModalContext): FieldEditModalSectionId[] {
    const sections: FieldEditModalSectionId[] = ["display_label", "help_text"];

    if (ctx.policySettingsSupported && ctx.hasPolicyView && ctx.policyEditable) {
        sections.push("staff_editability");
    } else if (!ctx.policySettingsSupported) {
        sections.push("legacy_required_checkbox");
    }

    sections.push("where_it appears");

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
