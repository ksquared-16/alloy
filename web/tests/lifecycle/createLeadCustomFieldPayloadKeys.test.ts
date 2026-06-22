import { describe, expect, it } from "vitest";
import { createLeadPayloadKeyForRule } from "@/lib/lifecycle/createLeadIntakeFieldMap";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";

describe("createLead custom org field payload keys", () => {
    it("includes org-defined child fields in ActionIntakeSpec optional tier", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            org_field_definitions: {
                child: [
                    {
                        field_key: "preferred_start_month",
                        label: "Preferred Start Month",
                        entity_type: "inquiry_child",
                        field_type: "text",
                        is_system: false,
                        is_active: true,
                        config: {},
                    },
                ],
            },
        });

        const custom = spec.optional.find((field) => field.rule_id === customFieldRuleId("child", "preferred_start_month"));
        expect(custom?.payload_key).toBe("child_preferred_start_month");
        expect(custom?.field_label).toBe("Preferred Start Month");
    });

    it("maps custom person fields to direct payload keys", () => {
        expect(createLeadPayloadKeyForRule(customFieldRuleId("person", "preferred_language"))).toBe(
            "preferred_language",
        );
    });
});
