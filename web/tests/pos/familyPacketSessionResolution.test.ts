import { describe, it, expect } from "vitest";
import {
    pickPacketInstanceId,
    decideSessionResolution,
    pickLaunchContextForPacketSession,
} from "@/lib/forms/packets/formPacketService";

describe("pickPacketInstanceId", () => {
    it("reads packet_instance_id or share_group_id", () => {
        expect(pickPacketInstanceId({ packet_instance_id: "inst-1" })).toBe("inst-1");
        expect(pickPacketInstanceId({ share_group_id: "grp-9" })).toBe("grp-9");
    });
    it("returns null when absent/blank (legacy links)", () => {
        expect(pickPacketInstanceId({})).toBeNull();
        expect(pickPacketInstanceId({ packet_instance_id: "   " })).toBeNull();
        expect(pickPacketInstanceId({ packet_instance_id: 5 as unknown as string })).toBeNull();
    });
});

describe("decideSessionResolution", () => {
    it("second recipient link of an instance reuses the SAME session (shared answers)", () => {
        // recipient A opened first → created the instance session; recipient B now resolves:
        expect(decideSessionResolution({ packetInstanceId: "inst-1", instanceSessionExists: true, linkSessionExists: false })).toBe("reuse_instance");
    });
    it("first link of an instance creates the session", () => {
        expect(decideSessionResolution({ packetInstanceId: "inst-1", instanceSessionExists: false, linkSessionExists: false })).toBe("create");
    });
    it("re-opening the same link reuses its session", () => {
        expect(decideSessionResolution({ packetInstanceId: "inst-1", instanceSessionExists: false, linkSessionExists: true })).toBe("reuse_link");
    });
    it("legacy link (no instance) keeps one-session-per-link behavior", () => {
        expect(decideSessionResolution({ packetInstanceId: null, instanceSessionExists: false, linkSessionExists: true })).toBe("reuse_link");
        expect(decideSessionResolution({ packetInstanceId: null, instanceSessionExists: false, linkSessionExists: false })).toBe("create");
    });
});

describe("pickLaunchContextForPacketSession — family context persists", () => {
    it("persists packet_instance_id, recipient identity, and selected children", () => {
        const meta = {
            form_context_mode: "packet",
            packet_definition_id: "def-1",
            packet_instance_id: "inst-1",
            recipient_person_id: "justin",
            selected_customer_member_ids: ["mck", "emy"],
            unrelated: "dropme",
        };
        const out = pickLaunchContextForPacketSession(meta);
        expect(out.packet_instance_id).toBe("inst-1");
        expect(out.recipient_person_id).toBe("justin");
        expect(out.selected_customer_member_ids).toEqual(["mck", "emy"]);
        expect("unrelated" in out).toBe(false);
    });
});
