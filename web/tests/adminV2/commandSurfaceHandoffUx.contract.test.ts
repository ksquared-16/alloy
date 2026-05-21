import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { operationalContextSwitchNoticeText } from "@/lib/adminV2/bos/operationalContextSwitchNotice";

const eventsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../lib/adminV2/aiCommandSurface/adminV2CommandBarEvents.ts"
);
const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);

describe("command surface handoff UX (Gate A)", () => {
    it("exports autoSubmitSeedCommand on focus detail (handoff-only)", () => {
        const src = readFileSync(eventsPath, "utf8");
        expect(src).toContain("autoSubmitSeedCommand?: boolean");
    });

    it("shell auto-submits seed only when autoSubmitSeedCommand is set", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("detail.autoSubmitSeedCommand && seed");
        expect(src).toContain("runSubmittedCommandRef.current(seed)");
        expect(src).toContain('setCommandText("")');
    });

    it("context switch notice copy is operator-facing", () => {
        expect(operationalContextSwitchNoticeText("Patel household")).toBe(
            "Switched active record to Patel household"
        );
    });

    it("thread renders context boundary styling", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("noticeRole === \"context_boundary\"");
        expect(src).toContain("data-command-surface-context-boundary");
    });
});
