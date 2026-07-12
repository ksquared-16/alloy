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
        expect(section).not.toContain("loadCommandRailActionsExpanded");
        expect(section).not.toContain("persistCommandRailActionsExpanded");
    });

    it("uses external-store registry without unregister-on-update loops", () => {
        const ctx = read("contexts/WorkspaceCommandRailRegistryContext.tsx");
        expect(ctx).toContain("useSyncExternalStore");
        const registrar = read("app/adminV2/components/workspace/WorkspaceCommandRailRegistrar.tsx");
        expect(registrar).toContain("useLayoutEffect");
        expect(registrar).not.toContain("[actions, telemetry, ctx]");
    });

    it("keeps last registered rail content during route transition (unregister is no-op)", () => {
        const ctx = read("contexts/WorkspaceCommandRailRegistryContext.tsx");
        expect(ctx).toContain("intentional no-op");
        expect(ctx).toContain("avoid empty Actions/Telemetry flash during route transitions");
        const registrar = read("app/adminV2/components/workspace/WorkspaceCommandRailRegistrar.tsx");
        expect(registrar).not.toContain("unregister");
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
        const workspaceDoc = readFileSync(join(webRoot, "../docs/archive/2026-06-superseded-system/workspace-system.md"), "utf8");
        const wuDoc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(workspaceDoc).toContain("persistent command surface");
        expect(wuDoc).toContain("persistent command surface");
    });

    it("work unit actions rail registration is memoized against parent re-renders", () => {
        const wu = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(wu).toContain("commandRailActions");
        expect(wu).toContain("useMemo");
        expect(wu).toContain("WorkUnitAboveFoldActionsRail");
    });

    it("persistent command rail shares shell-level AdminDrawerProvider with registered actions", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        const scope = read("app/adminV2/components/AdminV2ShellDrawerScope.tsx");
        const workspaceProviders = read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(shell).toContain("AdminV2ShellDrawerScope");
        expect(shell).toContain("AdminV2PersistentCommandRail");
        expect(scope).toContain("AdminDrawerProvider");
        expect(scope).not.toMatch(/import AdminEntityDrawer|<AdminEntityDrawer/);
        expect(workspaceProviders).toContain("AdminEntityDrawer");
        expect(workspaceProviders).not.toContain("AdminDrawerProvider");
    });

    it("keeps persistent rail visible when BOS Action Workspace drawer is open", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).not.toContain('[data-adminv2-action-workspace-open="true"] [data-adminv2-persistent-command-rail="true"]');
    });
});
