import { describe, expect, it } from "vitest";
import {
    buildPacketContextOperatorCopy,
    resolveFormPacketMemberships,
} from "@/lib/forms/formPacketMembershipPresentation";

describe("formPacketMembershipPresentation", () => {
    it("resolves memberships for a form in packet steps", () => {
        const memberships = resolveFormPacketMemberships({
            formId: "form-a",
            definitions: [
                { id: "pkt-1", name: "Enrollment packet", key: "enrollment", is_active: true },
                { id: "pkt-2", name: "Waitlist packet", key: "waitlist", is_active: false },
            ],
            itemsByDefinitionId: {
                "pkt-1": [
                    {
                        sequence_index: 0,
                        form_definition_id: "form-other",
                        form_definitions: { id: "form-other", name: "Lead", key: "lead" },
                    },
                    {
                        sequence_index: 1,
                        form_definition_id: "form-a",
                        form_definitions: { id: "form-a", name: "Medical", key: "medical" },
                    },
                ],
            },
        });

        expect(memberships).toHaveLength(1);
        expect(memberships[0]).toMatchObject({
            packetDefinitionId: "pkt-1",
            packetName: "Enrollment packet",
            stepNumber: 2,
            totalSteps: 2,
            stepFormName: "Medical",
        });
    });

    it("builds operator copy when form is not in any packet", () => {
        const copy = buildPacketContextOperatorCopy({
            formName: "Enrollment lead",
            memberships: [],
        });
        expect(copy.lead).toContain("multi-step enrollment packet");
        expect(copy.bullets.some((b) => b.includes("opportunity drawer"))).toBe(true);
    });

    it("builds operator copy when form is a packet step", () => {
        const copy = buildPacketContextOperatorCopy({
            formName: "Medical authorization",
            memberships: [
                {
                    packetDefinitionId: "pkt-1",
                    packetName: "Enrollment packet",
                    packetKey: "enrollment",
                    stepNumber: 2,
                    totalSteps: 3,
                    stepFormName: "Medical authorization",
                },
            ],
        });
        expect(copy.lead).toContain("step in an enrollment packet");
        expect(copy.bullets.some((b) => b.includes("active packet record"))).toBe(true);
    });
});
