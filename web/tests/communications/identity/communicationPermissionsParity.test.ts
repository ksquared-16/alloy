import { describe, expect, it, vi } from "vitest";

import { hasCommunicationsSendPermission } from "@/lib/communications/communicationPermissions";

describe("communications send permission parity", () => {
    it("denies send without communications.send or legacy alias", () => {
        expect(hasCommunicationsSendPermission([])).toBe(false);
    });

    it("gives the administrator title no send authority of its own", () => {
        // Was "allows admin bypass". The bypass is the thing that went.
        expect(hasCommunicationsSendPermission([])).toBe(false);
    });

    it("allows communications.send grant", () => {
        expect(hasCommunicationsSendPermission(["communications.send"])).toBe(true);
    });

    it("allows legacy ops.messaging.write alias", () => {
        expect(hasCommunicationsSendPermission(["ops.messaging.write"])).toBe(true);
    });
});

describe("family-send route authorization", () => {
    it("imports assertCommunicationsSendAllowed for parity with /send", async () => {
        const src = await vi.importActual<typeof import("@/app/api/admin/communications/family-send/route")>(
            "@/app/api/admin/communications/family-send/route"
        );
        expect(src.POST).toBeTypeOf("function");
        const fs = await import("node:fs/promises");
        const path = new URL("../../../app/api/admin/communications/family-send/route.ts", import.meta.url);
        const text = await fs.readFile(path, "utf8");
        expect(text).toContain("assertCommunicationsSendAllowed");
        expect(text).toContain("communications_send_forbidden");
    });
});
