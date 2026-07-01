import { describe, expect, it } from "vitest";
import { CHILDCARE_VERTICAL_BOOTSTRAP_V1 } from "@/lib/admin/verticalBootstrap/childcareBootstrapV1";
import { parseVerticalBootstrapPayload } from "@/lib/admin/verticalBootstrap/parseVerticalBootstrapPayload";

describe("parseVerticalBootstrapPayload", () => {
    it("accepts childcare reference payload", () => {
        const r = parseVerticalBootstrapPayload(CHILDCARE_VERTICAL_BOOTSTRAP_V1);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.payload.departments).toHaveLength(1);
            expect(r.payload.status_definitions.length).toBeGreaterThan(0);
            expect(r.payload.work_units).toHaveLength(5);
            expect(r.payload.onboarding_context?.industry_key).toBe("childcare");
            expect(r.payload.onboarding_context?.starter_field_intake?.registration).toBe("deferred");
        }
    });

    it("rejects duplicate department keys", () => {
        const r = parseVerticalBootstrapPayload({
            schema_version: 1,
            departments: [
                { key: "a", name: "A" },
                { key: "a", name: "B" },
            ],
            status_definitions: [],
            work_units: [],
        });
        expect(r.ok).toBe(false);
    });

    it("rejects invalid starter_field_intake.registration", () => {
        const r = parseVerticalBootstrapPayload({
            schema_version: 1,
            departments: [],
            status_definitions: [],
            work_units: [],
            onboarding_context: {
                starter_field_intake: { registration: "live" },
            },
        });
        expect(r.ok).toBe(false);
    });

    it("rejects invalid lifecycle_stage", () => {
        const r = parseVerticalBootstrapPayload({
            schema_version: 1,
            departments: [],
            status_definitions: [
                {
                    entity_type: "opportunities",
                    status_key: "x",
                    status_label: "X",
                    metadata: { lifecycle_stage: "not_a_stage" },
                },
            ],
            work_units: [],
        });
        expect(r.ok).toBe(false);
    });
});
