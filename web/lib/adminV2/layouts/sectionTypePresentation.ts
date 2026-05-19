/** Operator-facing section type labels (Layouts composition). */

export type DrawerSectionKind = "field_section_ref" | "workflow_virtual" | "injected_system" | "layout_static";

export function drawerSectionTypeLabel(kind: string): string {
    switch (kind) {
        case "workflow_virtual":
            return "Workflow-controlled";
        case "injected_system":
            return "Built-in";
        case "layout_static":
            return "Template";
        case "field_section_ref":
        default:
            return "Custom";
    }
}

export function drawerSectionFieldsAssignable(kind: string): boolean {
    return kind === "field_section_ref";
}

export function drawerSectionTypeDetail(kind: string): string {
    switch (kind) {
        case "workflow_virtual":
            return "Workflow-controlled section: you can rename, show or hide, and reorder it where supported. Its fields are controlled by workflow configuration.";
        case "injected_system":
            return "Built-in section: this section is part of the standard drawer structure. You can show or hide or reorder it where supported, but its fields may be controlled by the record system.";
        case "field_section_ref":
        default:
            return "Custom section: you can move eligible fields into this section.";
    }
}

export function drawerSectionFieldsHereLabel(kind: string): string {
    if (drawerSectionFieldsAssignable(kind)) {
        return "You can move eligible fields into this section.";
    }
    if (kind === "workflow_virtual") {
        return "Fields are controlled by workflow configuration.";
    }
    return "Fields may be controlled by the record system.";
}
