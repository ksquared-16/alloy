import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MissingRequirementsSummary from "@/components/admin/completion/MissingRequirementsSummary";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

describe("MissingRequirementsSummary", () => {
    it("renders empty state when no violations", () => {
        const result: RequirementValidationResult = {
            ok: true,
            blocking: [],
            warnings: [],
            recommendations: [],
        };
        const html = renderToStaticMarkup(<MissingRequirementsSummary result={result} />);
        expect(html).toContain("No missing requirements flagged");
        expect(html).toContain('data-completion-requirements-empty="true"');
    });

    it("renders blocking and warning sections", () => {
        const result: RequirementValidationResult = {
            ok: false,
            blocking: [
                {
                    entity_type: "person",
                    entity_id: "p1",
                    field_key: "last_name",
                    label: "Last name",
                    requirement_type: "always_required",
                    blocking_level: "hard_block",
                    missing_reason: "Last name is required.",
                    context: {},
                },
            ],
            warnings: [
                {
                    entity_type: "person",
                    entity_id: "p1",
                    field_key: "email",
                    label: "Email or phone",
                    requirement_type: "required_on_save",
                    blocking_level: "soft_warning",
                    missing_reason: "At least one contact method is required.",
                    context: {},
                },
            ],
            recommendations: [],
        };
        const html = renderToStaticMarkup(<MissingRequirementsSummary result={result} title="Missing before next step" />);
        expect(html).toContain("Missing before next step");
        expect(html).toContain("Last name");
        expect(html).toContain('data-completion-requirements-blocking="true"');
        expect(html).toContain('data-completion-requirements-warnings="true"');
        expect(html).toContain("Email or phone");
    });
});
