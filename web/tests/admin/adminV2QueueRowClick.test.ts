import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const pagePath = join(root, "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
const queueBlockPath = join(root, "../../app/adminV2/components/workspace/blocks/QueueBlock.tsx");
const deptPagePath = join(root, "../../app/adminV2/workspace/dept/[departmentId]/page.tsx");
const deptGridPath = join(root, "../../components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
const workspaceCssPath = join(root, "../../app/adminV2/components/workspace/workspace.css");

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
        const css = readFileSync(workspaceCssPath, "utf8");
        expect(css).toContain("adminv2-ws-wu-queue-card-interactive");
    });

    it("wires shared interactive affordance on operational click surfaces", () => {
        const css = readFileSync(workspaceCssPath, "utf8");
        expect(css).toContain(".adminv2-interactive-surface");
        expect(css).toContain("adminv2-ws-wu-queue-card-interactive.adminv2-interactive-surface:hover");
        expect(css).toContain("adminv2-ws-dept-oper-queue-link.adminv2-interactive-surface:hover");

        expect(readFileSync(queueBlockPath, "utf8")).toContain("adminv2-interactive-surface");
        expect(readFileSync(deptPagePath, "utf8")).toContain("adminv2-interactive-surface");
        expect(readFileSync(deptGridPath, "utf8")).toContain("adminv2-interactive-surface");
    });
});
