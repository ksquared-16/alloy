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
        expect(src).toContain("drawerSubjectContext");
        expect(src).toContain("opportunityDrawerSubjectContextFromQueueItem");
    });

    it("maps registry open_drawer quick actions to open_record dispatch", () => {
        const queueBlock = readFileSync(queueBlockPath, "utf8");
        const quickActionHelpers = readFileSync(
            join(root, "../../lib/ui-v2/queueRowQuickActionHelpers.ts"),
            "utf8",
        );
        expect(quickActionHelpers).toContain('payload?.actionType === "open_drawer"');
        expect(queueBlock).toContain("fireQueueRowOpenRecord");
    });

    it("keeps queue rows clickable during lane refresh", () => {
        const css = readFileSync(workspaceCssPath, "utf8");
        expect(css).toContain("adminv2-ws-wu-queue-card-interactive");
    });

    it("keeps work-unit queue records in a bounded scroll shell above the command bar", () => {
        const css = readFileSync(workspaceCssPath, "utf8");
        const queueBlock = readFileSync(queueBlockPath, "utf8");
        expect(queueBlock).toContain("adminv2-ws-wu-queue-list-shell");
        expect(css).toContain("--ws-wu-queue-records-scroll-max-height");
        expect(css).toContain("--ws-wu-queue-visible-rows-target: 6");
        expect(css).toContain("--ws-wu-queue-intelligence-banner-reserve");
        expect(css).toContain("--ws-shell-bottom-safe");
        expect(css).toMatch(
            /--ws-wu-queue-records-scroll-max-height:[\s\S]*var\(--ws-shell-bottom-safe/,
        );
        const scrollShellRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-work-unit\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list-shell\s*\{[^}]+\}/,
        )?.[0];
        expect(scrollShellRule).toBeDefined();
        expect(scrollShellRule).toContain("overflow-y: auto");
        expect(scrollShellRule).toContain("min-height: 0");
        expect(scrollShellRule).toContain("padding-bottom:");
        const wuListRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list\.adminv2-ws-queue-list\s*\{[^}]+\}/,
        )?.[0];
        expect(wuListRule).toBeDefined();
        expect(wuListRule).toContain("overflow-y: visible");
        expect(wuListRule).not.toContain("overflow-y: auto");
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
