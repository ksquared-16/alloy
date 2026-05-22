import { describe, expect, it } from "vitest";

import {
    buildTaskAssistFailedReceipt,
    buildTaskAssistScheduledReceipt,
    buildTaskAssistSentReceipt,
    buildWorkflowAssistAppliedReceipt,
    configApplyOutcomeToExecutionReceipt,
    formatBosExecutionReceiptPlainText,
} from "@/lib/adminV2/bos/bosExecutionReceipt";
import { buildConfigAssistApplyOutcomePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

const FORBIDDEN = [/AI sent/i, /AI changed/i, /celebrat/i, /Mutation denied/i];

describe("bosExecutionReceipt", () => {
    it("task assist sent receipt is past-tense and operational", () => {
        const r = buildTaskAssistSentReceipt("Chen household");
        expect(r.headline).toBe("Sent");
        expect(r.detail).toMatch(/Communications/i);
        expect(formatBosExecutionReceiptPlainText(r)).not.toMatch(FORBIDDEN[0]);
    });

    it("failed receipt does not say sent", () => {
        const r = buildTaskAssistFailedReceipt("Chen household", "Recipient missing SMS");
        expect(r.headline).toBe("Failed");
        expect(r.detail).not.toMatch(/^Sent/i);
    });

    it("scheduled receipt uses Scheduled headline", () => {
        const r = buildTaskAssistScheduledReceipt("Patel household", "May 21, 9:00 AM");
        expect(r.headline).toBe("Scheduled");
    });

    it("workflow applied receipt links to automations", () => {
        const r = buildWorkflowAssistAppliedReceipt({ workflowId: "wf-1", draftOnly: false });
        expect(r.headline).toBe("Applied");
        expect(r.link?.href).toContain("workflow");
    });

    it("config partial outcome maps to execution receipt rows", () => {
        const proposal = {
            version: 1,
            proposed_operations: [
                {
                    operation_id: "a",
                    kind: "create_field",
                    entity_type: "opportunities",
                    field_key: "x",
                    label: "X",
                    field_type: "text",
                },
            ],
        } as ConfigurationProposalV1;
        const outcome = buildConfigAssistApplyOutcomePresentation({
            proposal,
            applyResults: [
                { operation_id: "a", kind: "create_field", ok: true, verified: true },
            ],
        });
        const receipt = configApplyOutcomeToExecutionReceipt(outcome);
        expect(receipt.operationRows?.length).toBe(1);
        expect(receipt.operationRows?.[0]?.statusLabel).toBe("Applied");
    });
});
