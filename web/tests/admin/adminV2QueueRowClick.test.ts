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
const workspaceProvidersPath = join(root, "../../app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");

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

    it("defers work-unit queue list overflow to workspace scroll surface", () => {
        const css = readFileSync(workspaceCssPath, "utf8");
        expect(css).not.toMatch(
            /--ws-dept-primary-queue-list-max-height:\s*min\(calc\(44vh/,
        );
        const wuListRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list\.adminv2-ws-queue-list\s*\{[^}]+\}/,
        )?.[0];
        expect(wuListRule).toBeDefined();
        expect(wuListRule).toContain("max-height: var(--ws-dept-primary-queue-list-max-height)");
        expect(wuListRule).toContain("overflow-y: visible");
        expect(wuListRule).not.toContain("overflow-y: auto");
        const providers = readFileSync(workspaceProvidersPath, "utf8");
        expect(providers).toContain("adminv2-workspace-scroll-surface");
        expect(providers).toContain("overflow-auto");
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
