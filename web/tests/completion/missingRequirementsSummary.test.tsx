import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MissingRequirementsSummary from "@/components/admin/completion/MissingRequirementsSummary";
import {
    COMPLETION_FOUNDATION_PREVIEW_NOTE,
    COMPLETION_SUMMARY_DEFAULT_TITLE,
    COMPLETION_SUMMARY_EMPTY_PREVIEW,
} from "@/lib/completion/completionGuardrailsCopy";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

describe("MissingRequirementsSummary", () => {
    it("renders empty preview state with foundation note", () => {
        const result: RequirementValidationResult = {
            ok: true,
            blocking: [],
            warnings: [],
            recommendations: [],
        };
        const html = renderToStaticMarkup(<MissingRequirementsSummary result={result} compact />);
        expect(html).toContain(COMPLETION_SUMMARY_EMPTY_PREVIEW);
        expect(html).toContain(COMPLETION_FOUNDATION_PREVIEW_NOTE);
        expect(html).toContain('data-completion-requirements-empty="true"');
        expect(html).toContain('data-completion-foundation-note="true"');
    });

    it("renders blocking and warning sections with foundation disclaimer", () => {
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
        const html = renderToStaticMarkup(
            <MissingRequirementsSummary result={result} title={COMPLETION_SUMMARY_DEFAULT_TITLE} compact />
        );
        expect(html).toContain(COMPLETION_SUMMARY_DEFAULT_TITLE);
        expect(html).toContain("Last name");
        expect(html).toContain('data-completion-requirements-blocking="true"');
        expect(html).toContain('data-completion-requirements-warnings="true"');
        expect(html).toContain("Email or phone");
        expect(html).toContain(COMPLETION_FOUNDATION_PREVIEW_NOTE);
    });
});
