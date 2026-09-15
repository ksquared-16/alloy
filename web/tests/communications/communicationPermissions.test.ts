import { describe, expect, it } from "vitest";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    hasCommunicationsSendPermission,
    LEGACY_MESSAGING_SEND_PERMISSION_ALIAS,
} from "@/lib/communications/communicationPermissions";

/**
 * THE TITLE CONFERS NOTHING. These four cases used to read the other way round: `["admin"], []`
 * was the first assertion in the file and it expected `true`. That was the behaviour, and it meant
 * the role editor lied in both directions — a custom role holding exactly the administrator's
 * package still could not send, and an `admin` role deliberately stripped of `communications.send`
 * still could.
 *
 * The signature no longer accepts a role list at all, so the inversion is enforced by the compiler
 * rather than only by these expectations.
 */
describe("hasCommunicationsSendPermission", () => {
    it("denies a principal holding no send capability, whatever its role is called", () => {
        expect(hasCommunicationsSendPermission([])).toBe(false);
    });

    it("denies a package that carries other capabilities but not send", () => {
        expect(hasCommunicationsSendPermission(["crm.read", "portal.access"])).toBe(false);
    });

    it("allows communications.send when present", () => {
        expect(hasCommunicationsSendPermission([COMMUNICATIONS_SEND_PERMISSION_KEY, "crm.read"])).toBe(true);
    });

    it("allows the legacy ops.messaging.write capability alias", () => {
        expect(hasCommunicationsSendPermission([LEGACY_MESSAGING_SEND_PERMISSION_ALIAS])).toBe(true);
    });

    it("decides identically for two principals with the same package", () => {
        // The whole point of configurable roles: the package answers, not the name it was given.
        const pkg = [COMMUNICATIONS_SEND_PERMISSION_KEY];
        expect(hasCommunicationsSendPermission(pkg)).toBe(hasCommunicationsSendPermission([...pkg]));
        expect(hasCommunicationsSendPermission(pkg)).toBe(true);
    });
});
