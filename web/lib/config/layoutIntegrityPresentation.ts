/**
 * Card 6 — Operator-facing presentation for layout integrity reports (read-only).
 * No validation logic; formats existing API `LayoutIntegrityReportV1` for Settings UI.
 */

import type { LayoutIntegrityIssue, LayoutIntegrityIssueCode, LayoutIntegrityReportV1 } from "@/lib/config/layoutIntegrityTypes";

export type LayoutIntegrityPanelState = "idle" | "loading" | "error" | "clean" | "issues";

export type LayoutIntegrityIssueCategory =
    | "visibility"
    | "field_registry"
    | "write_path"
    | "sections"
    | "layout"
    | "options"
    | "other";

const ISSUE_CATEGORY_BY_CODE: Record<LayoutIntegrityIssueCode, LayoutIntegrityIssueCategory> = {
    required_field_not_visible: "visibility",
    required_on_layout_not_visible: "visibility",
    visible_field_missing_definition: "field_registry",
    editable_without_write_target: "write_path",
    related_record_missing_ownership: "write_path",
    empty_section: "sections",
    duplicate_field_placement: "layout",
    deprecated_field_visible: "visibility",
    action_controlled_incorrectly_editable: "write_path",
    option_field_no_active_options: "options",
    invalid_section_reference: "sections",
    layout_ordering_conflict: "layout",
    field_never_exposed: "visibility",
};

const CATEGORY_LABEL: Record<LayoutIntegrityIssueCategory, string> = {
    visibility: "Visibility",
    field_registry: "Field registry",
    write_path: "Edit / save path",
    sections: "Sections",
    layout: "Drawer layout",
    options: "Option sets",
    other: "Other",
};

const CODE_OPERATOR_TITLE: Partial<Record<LayoutIntegrityIssueCode, string>> = {
    required_field_not_visible: "Required field is hidden",
    required_on_layout_not_visible: "Required on layout but missing from drawer",
    visible_field_missing_definition: "Layout references unknown field",
    editable_without_write_target: "Editable field has no save path",
    related_record_missing_ownership: "Related-record field misconfigured",
    empty_section: "Empty section in layout",
    duplicate_field_placement: "Field appears more than once",
    deprecated_field_visible: "Deprecated field still visible",
    action_controlled_incorrectly_editable: "Action-controlled field marked editable",
    option_field_no_active_options: "Select field has no active options",
    invalid_section_reference: "Layout references invalid section",
    layout_ordering_conflict: "Section order conflict",
    field_never_exposed: "Field never shown in drawer",
};

export function getLayoutIntegrityPanelState(args: {
    loading: boolean;
    error: string | null;
    report: LayoutIntegrityReportV1 | null;
}): LayoutIntegrityPanelState {
    if (args.loading) return "loading";
    if (args.error) return "error";
    if (!args.report) return "idle";
    if ((args.report.issue_count ?? 0) > 0) return "issues";
    return "clean";
}

export function issueCategory(issue: LayoutIntegrityIssue): LayoutIntegrityIssueCategory {
    return ISSUE_CATEGORY_BY_CODE[issue.code] ?? "other";
}

export function issueCategoryLabel(category: LayoutIntegrityIssueCategory): string {
    return CATEGORY_LABEL[category] ?? "Other";
}

export function issueOperatorTitle(issue: LayoutIntegrityIssue): string {
    return CODE_OPERATOR_TITLE[issue.code] ?? issue.code.replace(/_/g, " ");
}

export function formatLayoutIntegritySummary(report: LayoutIntegrityReportV1): string {
    const n = report.issue_count ?? 0;
    if (n === 0) return "No issues found";
    const parts: string[] = [];
    if (report.error_count > 0) {
        parts.push(`${report.error_count} error${report.error_count === 1 ? "" : "s"}`);
    }
    if (report.warning_count > 0) {
        parts.push(`${report.warning_count} warning${report.warning_count === 1 ? "" : "s"}`);
    }
    return `${n} issue${n === 1 ? "" : "s"} (${parts.join(", ")})`;
}

export function formatIssueTargetLine(issue: LayoutIntegrityIssue): string | null {
    const parts: string[] = [];
    if (issue.entity_type) parts.push(`Entity: ${issue.entity_type}`);
    if (issue.section_key) parts.push(`Section: ${issue.section_key}`);
    if (issue.field_key) parts.push(`Field: ${issue.field_key}`);
    if (issue.layout_id) parts.push(`Layout: ${issue.layout_id.slice(0, 8)}…`);
    return parts.length ? parts.join(" · ") : null;
}

export type LayoutIntegrityFixLink = { href: string; label: string };

/** Suggested Settings destinations for operators (read-only guidance). */
export function fixLinksForIssue(issue: LayoutIntegrityIssue): LayoutIntegrityFixLink[] {
    const entity = issue.entity_type ?? "opportunity";
    const links: LayoutIntegrityFixLink[] = [
        { href: `/settings/fields?entity=${encodeURIComponent(entity)}`, label: "Fields" },
        { href: "/settings/field-sections", label: "Field grouping" },
    ];
    if (
        issue.code === "layout_ordering_conflict" ||
        issue.code === "invalid_section_reference" ||
        issue.code === "duplicate_field_placement" ||
        issue.code === "required_on_layout_not_visible"
    ) {
        links.push({ href: "/settings/surfaces", label: "Surfaces" });
    }
    if (issue.code === "option_field_no_active_options") {
        links.push({ href: "/settings/option-sets", label: "Option sets" });
    }
    return links;
}

export type GroupedLayoutIntegrityIssues = {
    severity: "error" | "warning";
    issues: LayoutIntegrityIssue[];
};

export function groupIssuesBySeverity(issues: LayoutIntegrityIssue[]): GroupedLayoutIntegrityIssues[] {
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const out: GroupedLayoutIntegrityIssues[] = [];
    if (errors.length) out.push({ severity: "error", issues: errors });
    if (warnings.length) out.push({ severity: "warning", issues: warnings });
    return out;
}

export type IssuesByCategory = {
    category: LayoutIntegrityIssueCategory;
    label: string;
    issues: LayoutIntegrityIssue[];
};

export function groupIssuesByCategory(issues: LayoutIntegrityIssue[]): IssuesByCategory[] {
    const map = new Map<LayoutIntegrityIssueCategory, LayoutIntegrityIssue[]>();
    for (const issue of issues) {
        const cat = issueCategory(issue);
        const list = map.get(cat) ?? [];
        list.push(issue);
        map.set(cat, list);
    }
    const order: LayoutIntegrityIssueCategory[] = [
        "visibility",
        "field_registry",
        "write_path",
        "sections",
        "layout",
        "options",
        "other",
    ];
    return order
        .filter((c) => map.has(c))
        .map((c) => ({
            category: c,
            label: issueCategoryLabel(c),
            issues: map.get(c)!,
        }));
}

export function entityTypeLabel(entityType: string): string {
    return entityType.charAt(0).toUpperCase() + entityType.slice(1);
}
