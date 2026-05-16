import { describe, expect, it } from "vitest";

import { buildEntityResolveContext } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import { buildDeterministicConfigurationProposal } from "@/lib/agent/configLayoutAssist/configLayoutAssistPropose";

describe("buildDeterministicConfigurationProposal inquiry/create", () => {
    const entityResolve = buildEntityResolveContext(
        [{ entity_type: "opportunities", singular: "Inquiry", plural: "Inquiries" }],
        "opportunity"
    );

    it("create Preferred Start Date for inquiries returns create_field on opportunity", async () => {
        const { proposal, trace } = await buildDeterministicConfigurationProposal({
            command: "Create Preferred Start Date for inquiries",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        expect(trace.intent.kind).toBe("create_field");
        expect(trace.intent.entity_type).toBe("opportunity");
        expect(proposal.proposed_operations).toHaveLength(1);
        expect(proposal.proposed_operations[0]?.kind).toBe("create_field");
        expect(proposal.proposed_operations[0]?.field_key).toBe("preferred_start_date");
        expect(proposal.proposed_operations[0]?.after?.field_type).toBe("date");
        expect(proposal.summary).toContain("Inquiries");
    });

    it("make first name editable from the inquiry uses person write target", async () => {
        const { proposal } = await buildDeterministicConfigurationProposal({
            command: "Make first name editable from the inquiry",
            orgId: "org-1",
            userId: "user-1",
            entityResolve,
        });
        expect(proposal.proposed_operations).toHaveLength(1);
        const op = proposal.proposed_operations[0];
        expect(op?.kind).toBe("set_field_interaction");
        expect(op?.entity_type).toBe("opportunity");
        expect(op?.field_key).toBe("first_name");
        const policy = op?.after?.interaction_policy as { editability_mode?: string; ownership?: { write_target_entity?: string } };
        expect(policy?.editability_mode).toBe("editable_through_related_record");
        expect(policy?.ownership?.write_target_entity).toBe("person");
        expect(proposal.risk_level).toBe("medium");
        expect(proposal.rationale.some((r) => /Person/i.test(r))).toBe(true);
    });
});
