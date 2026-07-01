import { describe, expect, it } from "vitest";
import {
    ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS,
    resolveEffectiveWorkDefinitionKeyFromTemplate,
    resolveWorkDefinitionKeyFromTemplate,
} from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";

describe("resolveWorkDefinitionKeyFromTemplate", () => {
    it("uses explicit work_definition_key when set", () => {
        const result = resolveWorkDefinitionKeyFromTemplate({
            template_key: "record_tour_outcome_work",
            label: "Record tour outcome",
            work_definition_key: "record_tour_outcome",
        } as never);
        expect(result).toEqual({
            ok: true,
            work_definition_key: "record_tour_outcome",
            source: "explicit",
        });
    });

    it("resolves catalog keys from template_key", () => {
        const result = resolveWorkDefinitionKeyFromTemplate({
            template_key: "contact_family",
            label: "Contact family",
        } as never);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.work_definition_key).toBe("contact_family");
    });

    it("binds enrollment default templates without explicit definition", () => {
        expect(ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS.confirm_tour_date).toBe("contact_family");
        const result = resolveWorkDefinitionKeyFromTemplate({
            template_key: "confirm_tour_date",
            label: "Confirm tour date",
        } as never);
        expect(result).toEqual({
            ok: true,
            work_definition_key: "contact_family",
            source: "default_binding",
        });
    });

    it("rejects unknown templates", () => {
        const result = resolveWorkDefinitionKeyFromTemplate({
            template_key: "unknown_template_xyz",
            label: "Unknown",
        } as never);
        expect(result).toEqual({ ok: false, reason: "unresolved_definition" });
    });

    it("rejects disabled platform definitions", () => {
        const result = resolveEffectiveWorkDefinitionKeyFromTemplate(
            {
                template_key: "resolve_outstanding_balance",
                label: "Resolve balance",
                work_definition_key: "resolve_outstanding_balance",
            } as never,
            { stageKey: "tour" },
        );
        expect(result).toEqual({ ok: false, reason: "definition_not_available" });
    });
});
