import { describe, expect, it } from "vitest";

import { configLayoutAssistProposalStatusCopy } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalCopy";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

function baseProposal(overrides: Partial<ConfigurationProposalV1> = {}): ConfigurationProposalV1 {
    return {
        version: 1,
        id: "p-1",
        category: "field",
        intent: "test",
        summary: "test",
        rationale: [],
        impacted_entities: ["opportunity"],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: [],
        proposed_operations: [],
        apply_mode: "single_operation",
        generated_by: "config_layout_assist",
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

describe("configLayoutAssistProposalStatusCopy", () => {
    it("uses pending review copy for mutating proposals", () => {
        const copy = configLayoutAssistProposalStatusCopy(
            baseProposal({
                proposed_operations: [
                    {
                        operation_id: "op-1",
                        kind: "create_field",
                        entity_type: "opportunity",
                        before: null,
                        after: { field_key: "x", field_type: "text" },
                        rationale: [],
                        required_permissions: ["fields.manage"],
                    },
                ],
            })
        );
        expect(copy).toContain("Pending review");
        expect(copy).not.toContain("Recommendation only");
    });

    it("uses recommendation copy for recommendation_only", () => {
        const copy = configLayoutAssistProposalStatusCopy(
            baseProposal({
                apply_mode: "recommendation_only",
                proposed_operations: [
                    {
                        operation_id: "op-1",
                        kind: "data_quality_recommendation",
                        entity_type: "opportunity",
                        before: null,
                        after: {},
                        rationale: [],
                        required_permissions: ["data_quality.view"],
                    },
                ],
            })
        );
        expect(copy).toContain("Recommendation only");
    });
});
