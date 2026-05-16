import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const queueBlockPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/workspace/blocks/QueueBlock.tsx"
);

describe("work-unit queue row open contract", () => {
    it("handles open_record before registry execute branch", () => {
        const src = readFileSync(pagePath, "utf8");
        const openIdx = src.indexOf('action.actionId === "open_record"');
        const registryIdx = src.indexOf('source === "action_registry"');
        expect(openIdx).toBeGreaterThan(-1);
        expect(registryIdx).toBeGreaterThan(openIdx);
        expect(src).toContain("openWorkUnitQueueRecord");
        expect(src).toContain("applyRegistryResolvedActionClient");
    });

    it("maps registry open_drawer quick actions to open_record dispatch", () => {
        const src = readFileSync(queueBlockPath, "utf8");
        expect(src).toContain('payload?.actionType === "open_drawer"');
        expect(src).toContain("fireQueueRowOpenRecord");
    });

    it("keeps queue rows clickable during lane refresh", () => {
        const css = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../app/adminV2/components/workspace/workspace.css"),
            "utf8"
        );
        expect(css).toContain("adminv2-ws-wu-queue-card-interactive");
    });
});
