/**
 * Layout integrity issue types (Configuration / Layout Assist V1 — Card 4).
 */

export type LayoutIntegritySeverity = "warning" | "error";

export const LAYOUT_INTEGRITY_ISSUE_CODES = [
    "required_field_not_visible",
    "visible_field_missing_definition",
    "editable_without_write_target",
    "related_record_missing_ownership",
    "empty_section",
    "duplicate_field_placement",
    "deprecated_field_visible",
    "action_controlled_incorrectly_editable",
    "option_field_no_active_options",
    "invalid_section_reference",
    "layout_ordering_conflict",
    "field_never_exposed",
] as const;

export type LayoutIntegrityIssueCode = (typeof LAYOUT_INTEGRITY_ISSUE_CODES)[number];

export type LayoutIntegrityIssue = {
    severity: LayoutIntegritySeverity;
    code: LayoutIntegrityIssueCode;
    entity_type?: string;
    layout_id?: string;
    field_key?: string;
    section_key?: string;
    message: string;
    recommendation?: string;
};

export type LayoutIntegrityReportV1 = {
    version: 1;
    entity_type: string;
    checked_at_iso: string;
    issues: LayoutIntegrityIssue[];
    issue_count: number;
    error_count: number;
    warning_count: number;
};
