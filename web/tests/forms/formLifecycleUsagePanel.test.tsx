import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormLifecycleUsagePanel } from "@/components/forms/admin/FormLifecycleUsagePanel";

const FORM_ID = "8432c527-8799-4a55-88c7-f860bd78e747";

describe("FormLifecycleUsagePanel", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ items: [] }),
            })) as unknown as typeof fetch
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders lifecycle usage shell without technical keys", () => {
        const html = renderToStaticMarkup(
            <FormLifecycleUsagePanel
                formId={FORM_ID}
                formMetadata={{
                    intake_intent: "enrollment_lead",
                }}
                canMutate
                hasSchema
            />
        );

        expect(html).toContain('data-testid="form-lifecycle-usage-panel"');
        expect(html).toContain("Business Process");
        expect(html).toContain('data-testid="lifecycle-usage-selectors"');
        expect(html).toContain("Checks whether this form captures");
        expect(html).not.toContain("effectiveFieldRulesForStage");
        expect(html).not.toContain("crm_mapping_key");
        expect(html).not.toContain("person:first_name");
    });

    it("prefills selectors from saved lifecycle usage metadata", () => {
        const html = renderToStaticMarkup(
            <FormLifecycleUsagePanel
                formId={FORM_ID}
                formMetadata={{
                    lifecycle_usage_v1: {
                        version: 1,
                        department_id: "dept-1",
                        stage_key: "lead",
                        intake_intent: "enrollment_lead",
                    },
                }}
                canMutate
                hasSchema
            />
        );

        expect(html).toContain('value="lead"');
        expect(html).toContain('value="enrollment_lead"');
        expect(html).toContain('selected=""');
        expect(html).not.toContain("guardian_first_name");
    });
});
