import { describe, expect, it } from "vitest";
import { hashConfigurationProposal } from "@/lib/agent/configLayoutAssist/configurationProposalHash";
import { normalizeConfigurationProposal } from "@/lib/agent/configLayoutAssist/configurationProposalNormalize";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { CONFIGURATION_PROPOSAL_VERSION } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

function sampleProposal(): ConfigurationProposalV1 {
    return normalizeConfigurationProposal({
        version: CONFIGURATION_PROPOSAL_VERSION,
        id: "prop-hash-test",
        category: "layout",
        intent: "expose",
        summary: "Expose field",
        rationale: ["test"],
        impacted_entities: ["opportunity"],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: [],
        proposed_operations: [
            {
                operation_id: "op-1",
                kind: "expose_field_on_layout",
                entity_type: "opportunity",
                field_key: "notes",
                before: null,
                after: { is_visible_in_drawer: true },
                rationale: [],
                required_permissions: [],
            },
        ],
        apply_mode: "single_operation",
        generated_by: "deterministic",
        created_at: "2026-05-16T12:00:00.000Z",
    });
}

describe("hashConfigurationProposal", () => {
    it("is deterministic for normalized proposal", () => {
        const p = sampleProposal();
        expect(hashConfigurationProposal(p)).toBe(hashConfigurationProposal(p));
        expect(hashConfigurationProposal(p)).toMatch(/^[a-f0-9]{64}$/);
    });
});
