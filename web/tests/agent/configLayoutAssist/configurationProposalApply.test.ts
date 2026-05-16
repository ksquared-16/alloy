import { describe, expect, it } from "vitest";

import { buildApplyVerificationResult } from "@/lib/agent/configLayoutAssist/apply/applyVerification";
import {
    assertProposalCanBeApplied,
    CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS,
} from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigurationOperationV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

const baseProposal = (): ConfigurationProposalV1 => ({
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
});

describe("configurationProposalApply", () => {
    it("assertProposalCanBeApplied rejects recommendation_only", () => {
        const proposal = {
            ...baseProposal(),
            apply_mode: "recommendation_only" as const,
            proposed_operations: [
                {
                    operation_id: "op-1",
                    kind: "data_quality_recommendation" as const,
                    entity_type: "opportunity",
                    before: null,
                    after: { issue_code: "x" },
                    rationale: [],
                    required_permissions: ["data_quality.view"],
                },
            ],
        };
        expect(assertProposalCanBeApplied(proposal, proposal.apply_mode).ok).toBe(false);
    });

    it("lists supported apply operation kinds", () => {
        expect(CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS).toContain("create_field");
        expect(CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS).not.toContain("data_quality_recommendation");
    });

    it("buildApplyVerificationResult marks failed operations", () => {
        const op: ConfigurationOperationV1 = {
            operation_id: "op-1",
            kind: "create_field",
            entity_type: "opportunity",
            before: null,
            after: { field_key: "x", field_type: "text" },
            rationale: [],
            required_permissions: ["fields.manage"],
            field_key: "x",
        };
        const verification = buildApplyVerificationResult({
            operations: [op],
            applyResults: [
                { operation_id: "op-1", kind: "create_field", ok: true, verified: false, error: "mismatch" },
            ],
        });
        expect(verification.success).toBe(false);
        expect(verification.failed_operations).toEqual(["op-1"]);
    });
});
