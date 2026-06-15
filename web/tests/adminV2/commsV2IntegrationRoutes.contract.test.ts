import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("PKG-18D dark routes + composer send", () => {
    it("templates routes are dark + authed + send-free", () => {
        const list = read("app", "api", "admin", "communications", "templates", "route.ts");
        const id = read("app", "api", "admin", "communications", "templates", "[id]", "route.ts");
        for (const src of [list, id]) {
            expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_templates["']\)/);
            expect(src).toMatch(/status:\s*404/);
            expect(src).toMatch(/requireAdminOrOps/);
            expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage/);
        }
    });
    it("announcement create route is dark, authed, draft-only (no auto-send)", () => {
        const src = read("app", "api", "admin", "communications", "announcements", "route.ts");
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_announcements["']\)/);
        expect(src).toMatch(/status:\s*404/);
        expect(src).toMatch(/status:\s*"draft"/);
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage/);
    });
    it("composer wires live send to the canonical endpoint on click only (no auto-send)", () => {
        const src = read("app", "adminV2", "communications", "composer", "ComposerV2.tsx");
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_composer["']\)/);
        expect(src).toMatch(/\/api\/admin\/communications\/send/);
        expect(src).toMatch(/onClick=\{handleSend\}/); // send is user-initiated
        expect(src).not.toMatch(/useEffect\([^)]*handleSend/); // never auto-sent in an effect
    });
});
