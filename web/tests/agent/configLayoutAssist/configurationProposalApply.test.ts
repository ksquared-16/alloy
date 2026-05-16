import { describe, expect, it } from "vitest";

import { buildApplyVerificationResult } from "@/lib/agent/configLayoutAssist/apply/applyVerification";
import { CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS } from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";
import type { ConfigurationOperationV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

describe("configurationProposalApply", () => {
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
