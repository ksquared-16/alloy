import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    MINIMAL_PACKET_PROOF_CHILD_SCHEMA,
    MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA,
    MINIMAL_PACKET_PROOF_PACKET_KEY,
    MINIMAL_PACKET_PROOF_STEP_KEYS,
} from "@/lib/forms/seeds/minimalPacketProofDemo";
import { isPacketPublicLinkMetadata } from "@/lib/public/forms/resolvePublicFormEmbedContext";

describe("minimalPacketProofDemo seed shapes", () => {
    it("validates child and guardian schemas", () => {
        expect(() => validateFormSchema(MINIMAL_PACKET_PROOF_CHILD_SCHEMA)).not.toThrow();
        expect(() => validateFormSchema(MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA)).not.toThrow();
        const child = validateFormSchema(MINIMAL_PACKET_PROOF_CHILD_SCHEMA);
        expect(child.fields.map((f) => f.id)).toEqual([
            "child_first_name",
            "child_last_name",
            "child_date_of_birth",
            "desired_start_date",
        ]);
        const g = validateFormSchema(MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA);
        expect(g.fields.map((f) => f.id)).toEqual([
            "guardian_first_name",
            "guardian_last_name",
            "guardian_email",
            "guardian_phone",
        ]);
    });

    it("defines two ordered packet steps", () => {
        expect(MINIMAL_PACKET_PROOF_STEP_KEYS.length).toBe(2);
        expect(MINIMAL_PACKET_PROOF_STEP_KEYS[0]).toContain("child");
        expect(MINIMAL_PACKET_PROOF_STEP_KEYS[1]).toContain("guardian");
        expect(MINIMAL_PACKET_PROOF_PACKET_KEY).toContain("minimal_packet_proof");
    });

    it("recognizes packet public link metadata pattern", () => {
        expect(
            isPacketPublicLinkMetadata({
                form_context_mode: "packet",
                packet_definition_id: "66666666-6666-4666-8666-666666666666",
            })
        ).toBe(true);
        expect(isPacketPublicLinkMetadata({ form_context_mode: "lead_capture" })).toBe(false);
    });
});
