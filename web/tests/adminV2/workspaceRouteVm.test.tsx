import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    composeWorkspaceRouteVm,
    EMPTY_WORKSPACE_ROUTE_VM,
} from "@/lib/adminV2/runtime/surface/workspaceRouteVm";
import {
    WorkspaceRouteVmProvider,
    useWorkspaceRouteVm,
} from "@/lib/adminV2/runtime/surface/workspaceRouteVmContext";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const CARD: OperatorLifecycleLandingCard = {
    id: "lc-1",
    departmentId: "dept-1",
    processKey: "enrollment",
    label: "Enrollment",
    description: "Enrollment lifecycle",
    entryHref: "/workspace/work-unit/new-leads",
    workQueues: [],
    stageCount: 3,
    activeRecordCount: null,
    needsAttentionCount: null,
};

function Probe() {
    const vm = useWorkspaceRouteVm();
    return (
        <span data-surface={vm.surface} data-cards={vm.firstPaint.lifecycleCards.length}>
            {vm.firstPaint.lifecycleCards.map((c) => c.id).join(",")}
        </span>
    );
}

/**
 * Runtime Simplification M1 — the canonical server-composed workspace Route VM owns the first-paint
 * payload; it supersedes the transitional first-paint seed provider (now deleted).
 */
describe("workspace Route VM", () => {
    it("composeWorkspaceRouteVm assembles the canonical first-paint payload", () => {
        const vm = composeWorkspaceRouteVm({
            context: { orgId: "org-1", orgName: "Acme", accessScopeFingerprint: "scope-a" },
            lifecycleCards: [CARD],
        });
        expect(vm.surface).toBe("workspace");
        expect(vm.context.orgName).toBe("Acme");
        expect(vm.firstPaint.lifecycleCards[0]?.id).toBe("lc-1");
        // The retired Workspace Header metric strip is gone — the Route VM no longer carries
        // header calculations (the Workspace Process Surface owns the workspace body).
        expect("headerCalculations" in vm.firstPaint).toBe(false);
    });

    it("provider hands the Route VM to renderers (SSR)", () => {
        const vm = composeWorkspaceRouteVm({
            context: { orgId: "org-1", orgName: "Acme", accessScopeFingerprint: "scope-a" },
            lifecycleCards: [CARD],
        });
        const html = renderToStaticMarkup(
            <WorkspaceRouteVmProvider value={vm}>
                <Probe />
            </WorkspaceRouteVmProvider>,
        );
        expect(html).toContain('data-surface="workspace"');
        expect(html).toContain('data-cards="1"');
        expect(html).toContain("lc-1");
    });

    it("defaults to the empty VM when no provider (additive — prior behavior preserved)", () => {
        expect(EMPTY_WORKSPACE_ROUTE_VM.firstPaint.lifecycleCards).toHaveLength(0);
        expect("headerCalculations" in EMPTY_WORKSPACE_ROUTE_VM.firstPaint).toBe(false);
        const html = renderToStaticMarkup(<Probe />);
        expect(html).toContain('data-cards="0"');
    });

    it("layout composes the Route VM and passes it to the providers", () => {
        const layout = read("app/adminV2/workspace/layout.tsx");
        expect(layout).toContain("composeWorkspaceRouteVm(");
        expect(layout).toContain("workspaceRouteVm={workspaceRouteVm}");
        // The retired Workspace Header first-paint loader is gone from the layout bundle.
        expect(layout).not.toContain("loadWorkspaceHeaderFirstPaint(");
    });

    it("providers expose the Route VM via WorkspaceRouteVmProvider", () => {
        const providers = read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(providers).toContain("WorkspaceRouteVmProvider");
        expect(providers).toContain("value={workspaceRouteVm}");
    });

    it("the workspace runtime hook initializes first paint from the Route VM", () => {
        // PRV2: the landing page mounts the presentation tree; the runtime hook owns the
        // Route VM seed (lifecycle tiles). The retired header-calculations seed is gone.
        const hook = read("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        expect(hook).toContain("routeVm.firstPaint.lifecycleCards");
        expect(hook).not.toContain("routeVm.firstPaint.headerCalculations");
        // peek (warm module cache) still wins; the Route VM is the cold first-paint source.
        expect(hook).toContain("if (peeked?.length) return peeked;");
    });

    it("the transitional first-paint seed provider is deleted", () => {
        let exists = true;
        try {
            read("lib/adminV2/runtime/workspaceFirstPaintSeed.tsx");
        } catch {
            exists = false;
        }
        expect(exists).toBe(false);
    });
});
