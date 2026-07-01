import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellPath = join(process.cwd(), "app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx");

describe("AICommandSurfaceShell routing notices (Card 13)", () => {
    const src = readFileSync(shellPath, "utf8");

    it("appends routing notice after route resolution", () => {
        expect(src).toContain("appendCommandSurfaceRoutingNoticeTurn");
        expect(src).toContain('noticeRole: "routing"');
        expect(src).toContain("buildCommandSurfaceRoutingNotice");
        expect(src).toContain("COMMAND_SURFACE_SEARCHING_NOTICE");
        expect(src).toContain('noticeRole: "searching"');
    });

    it("uses policy denial instead of generic task assist error", () => {
        expect(src).toContain('kind: "policy_denial"');
        expect(src).toContain('resolveBosPolicyDenial("task_assist_unavailable")');
        expect(src).not.toContain("Task Assist is not enabled for this workspace");
    });

    it("does not expose debug routing language", () => {
        expect(src).not.toMatch(/AI selected/i);
        expect(src).not.toMatch(/Matched capability/i);
    });
});
