import { describe, expect, it } from "vitest";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    hasCommunicationsSendPermission,
    LEGACY_MESSAGING_SEND_PERMISSION_ALIAS,
} from "@/lib/communications/communicationPermissions";

describe("hasCommunicationsSendPermission", () => {
    it("allows admin role without explicit permission keys", () => {
        expect(hasCommunicationsSendPermission(["admin"], [])).toBe(true);
    });

    it("allows ops role without explicit permission keys", () => {
        expect(hasCommunicationsSendPermission(["ops"], [])).toBe(true);
    });

    it("denies custom role without send grants", () => {
        expect(hasCommunicationsSendPermission(["school_director"], ["crm.read"])).toBe(false);
    });

    it("allows communications.send when present", () => {
        expect(
            hasCommunicationsSendPermission(["coordinator"], [COMMUNICATIONS_SEND_PERMISSION_KEY, "crm.read"])
        ).toBe(true);
    });

    it("allows ops.messaging.write legacy alias", () => {
        expect(hasCommunicationsSendPermission(["coordinator"], [LEGACY_MESSAGING_SEND_PERMISSION_ALIAS])).toBe(
            true
        );
    });
});
