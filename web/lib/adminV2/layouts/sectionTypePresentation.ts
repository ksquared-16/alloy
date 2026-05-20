/** Operator-facing section type labels (Layouts composition). */

export type DrawerSectionKind = "field_section_ref" | "workflow_virtual" | "injected_system" | "layout_static";

export function drawerSectionTypeLabel(kind: string): string {
    switch (kind) {
        case "header_region":
            return "Header";
        case "workflow_virtual":
            return "Workflow section";
        case "injected_system":
            return "Standard section";
        case "layout_static":
            return "Standard section";
        case "field_section_ref":
        default:
            return "Custom section";
    }
}

export function drawerSectionFieldsAssignable(kind: string): boolean {
    return kind === "field_section_ref";
}

export function drawerSectionTypeDetail(kind: string): string {
    switch (kind) {
        case "header_region":
            return "Title, status, summary fields, and header actions.";
        case "workflow_virtual":
            return "Workflow section: show, hide, reorder, and set field behavior where supported.";
        case "injected_system":
            return "Standard section: show, hide, reorder, and set field behavior where supported.";
        case "field_section_ref":
        default:
            return "Custom section: add or remove fields and set field behavior.";
    }
}

export function drawerSectionFieldsHereLabel(kind: string): string {
    if (drawerSectionFieldsAssignable(kind)) {
        return "You can move eligible fields into this section.";
    }
    if (kind === "workflow_virtual") {
        return "Fields come from workflow configuration.";
    }
    if (kind === "header_region") {
        return "Header summary fields and actions.";
    }
    return "Some fields are fixed; others support layout behavior where listed.";
}
