import { describe, expect, it } from "vitest";

import {
    planRequirementDerivedPacket,
    referencedPacketDefinitionId,
} from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

/**
 * A STAGE THAT REQUIRES A PACKET LAUNCHES THAT PACKET.
 *
 * Deriving a mirror of a packet that already exists would give a family two packets for one
 * obligation, and the copy would drift from the definition an administrator edits in Studio. So the
 * referenced packet is asked for FIRST, and derivation stays the path for stages that still list
 * individual Forms. Both models remain supported — the stage's own configuration decides.
 */

const builderWith = (requirements: unknown[]): LifecycleBuilderV1 =>
    ({
        version: 1,
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [{ key: "enrolling", label: "Enrolling", requirements_v1: { version: 1, requirements } }],
            },
        ],
    }) as unknown as LifecycleBuilderV1;

const packetReq = {
    requirement_id: "enrollment_packet",
    ref: { kind: "packet", packet_definition_id: "pkt-1" },
    level: "required",
};
const formReq = (id: string) => ({
    requirement_id: `form_${id}`,
    ref: { kind: "form", form_definition_id: id },
    level: "required",
});

describe("a packet requirement resolves to its own packet", () => {
    it("returns the referenced packet", () => {
        expect(
            referencedPacketDefinitionId({ builder: builderWith([packetReq]), processKey: "enrollment", stageKey: "enrolling" }),
        ).toBe("pkt-1");
    });

    it("returns null when the stage requires only Forms, so derivation still runs", () => {
        expect(
            referencedPacketDefinitionId({
                builder: builderWith([formReq("f-1"), formReq("f-2")]),
                processKey: "enrollment",
                stageKey: "enrolling",
            }),
        ).toBeNull();
    });

    it("does NOT derive a second packet from a packet requirement", () => {
        /*
         * The dangerous shape: a derived packet whose steps mirror a real packet. The plan must stay
         * empty so nothing mints a duplicate definition beside the one the stage named.
         */
        const plan = planRequirementDerivedPacket({
            builder: builderWith([packetReq]),
            processKey: "enrollment",
            stageKey: "enrolling",
        });
        expect(plan.steps).toHaveLength(0);
    });
});

describe("form requirements keep working", () => {
    it("still projects ordered steps, in authored order", () => {
        const plan = planRequirementDerivedPacket({
            builder: builderWith([formReq("f-1"), formReq("f-2"), formReq("f-3")]),
            processKey: "enrollment",
            stageKey: "enrolling",
        });
        expect(plan.steps.map((s) => s.form_definition_id)).toEqual(["f-1", "f-2", "f-3"]);
    });

    it("a mixed stage prefers the packet but leaves Form projection intact", () => {
        // Enrollment V0.5 chooses packet-only by product design; the platform does not prohibit
        // mixed use elsewhere, so both readers must keep answering truthfully.
        const builder = builderWith([formReq("f-1"), packetReq]);
        expect(referencedPacketDefinitionId({ builder, processKey: "enrollment", stageKey: "enrolling" })).toBe("pkt-1");
        expect(
            planRequirementDerivedPacket({ builder, processKey: "enrollment", stageKey: "enrolling" }).steps.map(
                (s) => s.form_definition_id,
            ),
        ).toEqual(["f-1"]);
    });
});
