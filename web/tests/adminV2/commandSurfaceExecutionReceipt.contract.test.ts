import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellPath = join(process.cwd(), "app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx");
const threadPath = join(process.cwd(), "app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx");

describe("command surface execution receipts (Card 16)", () => {
    it("shell appends execution_receipt turns", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain('kind: "execution_receipt"');
        expect(src).toContain("appendExecutionReceipt");
        expect(src).toContain("buildJobLayoutAppliedReceipt");
        expect(src).toContain("configApplyOutcomeToExecutionReceipt");
    });

    it("thread renders execution receipts and forwards callback", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain('case "execution_receipt"');
        expect(src).toContain("BosExecutionReceiptNotice");
        expect(src).toContain("onExecutionReceipt");
    });
});
