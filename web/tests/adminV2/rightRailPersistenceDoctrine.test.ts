import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Right rail persistence doctrine", () => {
    it("mounts persistent command rail at AdminV2 shell level", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AdminV2PersistentCommandRail");
        expect(shell).toContain("WorkspaceCommandRailRegistryProvider");
        expect(shell).not.toContain("AdminV2CommandRailBosHostFooter");
    });

    it("registers page rail content instead of rendering a local column", () => {
        const layout = read("components/admin/workspace/WorkspaceShellLayout.tsx");
        expect(layout).toContain("WorkspaceCommandRailRegistrar");
        expect(layout).toContain("usePersistentCommandRailEnabled");
    });

    it("avoids hydration mismatch for persisted Actions expand state", () => {
        const section = read("app/adminV2/components/workspace/CommandRailCollapsibleActionsSection.tsx");
        expect(section).toContain("useState(false)");
        expect(section).toMatch(/useEffect\(\(\) => \{\s*setExpanded\(loadCommandRailActionsExpanded\(\)\)/);
        expect(section).not.toContain("useState(() => loadCommandRailActionsExpanded())");
    });

    it("uses external-store registry without unregister-on-update loops", () => {
        const ctx = read("contexts/WorkspaceCommandRailRegistryContext.tsx");
        expect(ctx).toContain("useSyncExternalStore");
        const registrar = read("app/adminV2/components/workspace/WorkspaceCommandRailRegistrar.tsx");
        expect(registrar).toContain("useLayoutEffect");
        expect(registrar).not.toContain("[actions, telemetry, ctx]");
    });

    it("always renders Actions, Workflow Telemetry, and BOS slots in persistent rail", () => {
        const rail = read("app/adminV2/components/AdminV2PersistentCommandRail.tsx");
        expect(rail).toContain("CommandRailDefaultEmptyActions");
        expect(rail).toContain("CommandRailDefaultEmptyTelemetry");
        expect(rail).toContain("WorkspaceCommandRailShell");
    });

    it("does not hide workspace root actions when count is zero", () => {
        const rootRail = read("app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx");
        expect(rootRail).not.toContain("if (settled && (actionCount ?? 0) === 0) return null");
    });

    it("documents persistent command surface in workspace doctrine", () => {
        const workspaceDoc = readFileSync(join(webRoot, "../docs/system/workspace-system.md"), "utf8");
        const wuDoc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(workspaceDoc).toContain("persistent command surface");
        expect(wuDoc).toContain("persistent command surface");
    });

    it("suppresses persistent rail when BOS Action Workspace portal is open", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain('[data-adminv2-action-workspace-open="true"] [data-adminv2-persistent-command-rail="true"]');
    });
});
