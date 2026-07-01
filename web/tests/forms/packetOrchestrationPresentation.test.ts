import { describe, expect, it } from "vitest";
import {
    buildPacketStepDisplayRows,
    countSessionsByPacketDefinition,
    packetOrchestrationStatusLabel,
} from "@/lib/forms/packets/packetOrchestrationPresentation";

describe("packetOrchestrationPresentation OW-4", () => {
    it("packetOrchestrationStatusLabel reflects readiness", () => {
        expect(packetOrchestrationStatusLabel({ is_active: true, step_count: 2, all_steps_published: true })).toBe(
            "Ready to launch"
        );
        expect(packetOrchestrationStatusLabel({ is_active: true, step_count: 0, all_steps_published: false })).toBe(
            "Needs steps"
        );
    });

    it("countSessionsByPacketDefinition groups by definition id", () => {
        expect(
            countSessionsByPacketDefinition([
                { packet_definition_id: "a" },
                { packet_definition_id: "a" },
                { packet_definition_id: "b" },
            ])
        ).toEqual({ a: 2, b: 1 });
    });

    it("buildPacketStepDisplayRows orders steps with labels", () => {
        const rows = buildPacketStepDisplayRows([
            {
                sequence_index: 0,
                form_definition_id: "f1",
                metadata: { step_label: "Welcome" },
                step_has_published_version: true,
                form_definitions: { name: "Waitlist" },
            },
        ]);
        expect(rows[0]?.form_name).toBe("Waitlist");
        expect(rows[0]?.step_label).toBe("Welcome");
    });
});
