import { describe, expect, it } from "vitest";
import {
    fixLinksForIssue,
    formatIssueTargetLine,
    formatLayoutIntegritySummary,
    getLayoutIntegrityPanelState,
    groupIssuesBySeverity,
    issueCategory,
    issueCategoryLabel,
    issueOperatorTitle,
} from "@/lib/config/layoutIntegrityPresentation";
import type { LayoutIntegrityReportV1 } from "@/lib/config/layoutIntegrityTypes";

const sampleReport = (overrides: Partial<LayoutIntegrityReportV1> = {}): LayoutIntegrityReportV1 => ({
    version: 1,
    entity_type: "opportunity",
    checked_at_iso: "2026-05-18T12:00:00.000Z",
    issues: [],
    issue_count: 0,
    error_count: 0,
    warning_count: 0,
    ...overrides,
});

describe("layoutIntegrityPresentation", () => {
    it("resolves panel states", () => {
        expect(getLayoutIntegrityPanelState({ loading: true, error: null, report: null })).toBe("loading");
        expect(getLayoutIntegrityPanelState({ loading: false, error: "fail", report: null })).toBe("error");
        expect(getLayoutIntegrityPanelState({ loading: false, error: null, report: null })).toBe("idle");
        expect(
            getLayoutIntegrityPanelState({
                loading: false,
                error: null,
                report: sampleReport({ issue_count: 0 }),
            })
        ).toBe("clean");
        expect(
            getLayoutIntegrityPanelState({
                loading: false,
                error: null,
                report: sampleReport({ issue_count: 1, error_count: 1, warning_count: 0 }),
            })
        ).toBe("issues");
    });

    it("formats summary with error and warning counts", () => {
        expect(formatLayoutIntegritySummary(sampleReport())).toBe("No issues found");
        expect(
            formatLayoutIntegritySummary(
                sampleReport({ issue_count: 3, error_count: 1, warning_count: 2 })
            )
        ).toBe("3 issues (1 error, 2 warnings)");
    });

    it("maps issue code to category and operator title", () => {
        const issue = {
            severity: "error" as const,
            code: "required_field_not_visible" as const,
            message: "Field is required but hidden",
            field_key: "name",
            entity_type: "opportunity",
        };
        expect(issueCategory(issue)).toBe("visibility");
        expect(issueCategoryLabel("visibility")).toBe("Visibility");
        expect(issueOperatorTitle(issue)).toBe("Required field is hidden");
    });

    it("formats target line from issue metadata", () => {
        const line = formatIssueTargetLine({
            severity: "warning",
            code: "invalid_section_reference",
            entity_type: "job",
            section_key: "pricing",
            field_key: "gross_price_cents",
            layout_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            message: "x",
        });
        expect(line).toContain("Entity: job");
        expect(line).toContain("Section: pricing");
        expect(line).toContain("Field: gross_price_cents");
    });

    it("groups by severity with errors first", () => {
        const grouped = groupIssuesBySeverity([
            { severity: "warning", code: "empty_section", message: "w" },
            { severity: "error", code: "required_field_not_visible", message: "e", field_key: "a" },
        ]);
        expect(grouped).toHaveLength(2);
        expect(grouped[0]?.severity).toBe("error");
    });

    it("uses operator-friendly titles instead of raw issue codes in UI copy", () => {
        const issue = {
            severity: "error" as const,
            code: "editable_without_write_target" as const,
            message: "Field has no write path",
        };
        const title = issueOperatorTitle(issue);
        expect(title).not.toBe(issue.code);
        expect(title.toLowerCase()).toContain("save");
    });

    it("suggests layout settings link for layout issues", () => {
        const links = fixLinksForIssue({
            severity: "warning",
            code: "layout_ordering_conflict",
            message: "m",
        });
        expect(links.some((l) => l.href.includes("/layouts"))).toBe(true);
    });

    it("maps required_on_layout_not_visible to layout-specific operator title", () => {
        const issue = {
            severity: "error" as const,
            code: "required_on_layout_not_visible" as const,
            message: 'Field "campus_pref" is required on this layout (required_on_save) but is not present in the drawer layout preview.',
            field_key: "campus_pref",
            entity_type: "opportunity",
        };
        expect(issueCategory(issue)).toBe("visibility");
        expect(issueOperatorTitle(issue)).toContain("layout");
        expect(issueOperatorTitle(issue)).not.toBe(issue.code);
    });
});
