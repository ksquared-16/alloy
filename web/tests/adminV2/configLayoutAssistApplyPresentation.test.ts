import { describe, expect, it } from "vitest";

import {
    buildConfigAssistApplyOutcomeFromApi,
    buildConfigAssistApplyOutcomePresentation,
    proposalTouchesLayoutIntegrity,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ApplyOperationResult } from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";

const FORBIDDEN = [/AI selected/i, /Apply complete/i, /Mutation denied/i];

function expectOperationalCopy(text: string) {
    for (const pattern of FORBIDDEN) {
        expect(text).not.toMatch(pattern);
    }
}

function fixtureProposal(): ConfigurationProposalV1 {
    return {
        version: 1,
        id: "prop-1",
        category: "field",
        summary: "Add field",
        risk_level: "low",
        apply_mode: "apply_after_approval",
        requires_approval: true,
        permission_requirements: [],
        impacted_entities: ["opportunities"],
        proposed_operations: [
            {
                operation_id: "op-create",
                kind: "create_field",
                entity_type: "opportunities",
                field_key: "preferred_start",
                label: "Preferred Start",
                field_type: "date",
            },
            {
                operation_id: "op-rec",
                kind: "data_quality_recommendation",
                entity_type: "opportunities",
                message: "Normalize dates",
            },
        ],
        warnings: [],
        metadata: {},
    } as ConfigurationProposalV1;
}

describe("configLayoutAssistApplyPresentation", () => {
    it("maps apply results to applied/skipped/failed rows", () => {
        const proposal = fixtureProposal();
        const results: ApplyOperationResult[] = [
            {
                operation_id: "op-create",
                kind: "create_field",
                ok: true,
                verified: true,
                field_definition_id: "fd-1",
            },
            {
                operation_id: "op-update",
                kind: "update_field",
                ok: false,
                verified: false,
                error: "Field key conflict",
            },
        ];
        const presentation = buildConfigAssistApplyOutcomePresentation({
            proposal: {
                ...proposal,
                proposed_operations: [
                    ...proposal.proposed_operations,
                    {
                        operation_id: "op-update",
                        kind: "update_field",
                        entity_type: "opportunities",
                        field_key: "preferred_start",
                        after: { label: "Preferred Start Date" },
                    },
                ],
            },
            applyResults: results,
        });

        expect(presentation.headline).toBe("Partially applied");
        expect(presentation.rows.some((r) => r.status === "applied")).toBe(true);
        expect(presentation.rows.some((r) => r.status === "failed")).toBe(true);
        expect(presentation.rows.some((r) => r.status === "skipped" && r.operationId === "op-rec")).toBe(true);
        expectOperationalCopy(presentation.summary);
    });

    it("shows layout integrity link when layout-touching ops applied", () => {
        const proposal = fixtureProposal();
        const presentation = buildConfigAssistApplyOutcomePresentation({
            proposal,
            applyResults: [
                {
                    operation_id: "op-create",
                    kind: "create_field",
                    ok: true,
                    verified: true,
                },
            ],
        });
        expect(proposalTouchesLayoutIntegrity(proposal.proposed_operations)).toBe(true);
        expect(presentation.showLayoutIntegrityLink).toBe(true);
    });

    it("buildConfigAssistApplyOutcomeFromApi uses server payload", () => {
        const proposal = fixtureProposal();
        const outcome = buildConfigAssistApplyOutcomeFromApi(proposal, {
            ok: false,
            apply_results: [
                {
                    operation_id: "op-create",
                    kind: "create_field",
                    ok: false,
                    verified: false,
                    error: "Field key conflict",
                },
            ],
            message: "Verification failed",
        });
        expect(outcome.headline).toMatch(/Failed|Partially/);
        expectOperationalCopy(outcome.summary);
    });
});
