import { describe, expect, it } from "vitest";

import { buildDeterministicConfigurationProposal } from "@/lib/agent/configLayoutAssist/configLayoutAssistPropose";

describe("buildDeterministicConfigurationProposal", () => {
    it("builds create_field proposal without DB", async () => {
        const { proposal, trace } = await buildDeterministicConfigurationProposal({
            command: "Create Preferred Start Date field",
            orgId: "org-1",
            userId: "user-1",
        });
        expect(trace.deterministic).toBe(true);
        expect(proposal.proposed_operations).toHaveLength(1);
        expect(proposal.proposed_operations[0]?.kind).toBe("create_field");
        expect(proposal.requires_approval).toBe(true);
        expect(proposal.permission_requirements).toContain("fields.manage");
    });

    it("includes config_assist permissions on mutating proposals", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "make first name editable on opportunity",
            orgId: "org-1",
            userId: "user-1",
        });
        expect(proposal.proposed_operations[0]?.kind).toBe("set_field_interaction");
        expect(proposal.permission_requirements).toContain("fields.editability.manage");
    });
});
