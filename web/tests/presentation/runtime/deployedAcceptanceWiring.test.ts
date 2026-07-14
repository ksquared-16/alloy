/**
 * Deployed-acceptance remediation guards. The staging trace proved built optimizations were not
 * active on the canonical path: queue_list instead of queue_reveal, a Work Unit route-prefetch
 * storm, and an unconditional /workspace comms/inbox boot storm. These lock the wiring in.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { queueRowsRouteForView } from "@/lib/presentation/runtime/useWorkViewTotals";

const web = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("queue_reveal is requested on the canonical path (§3)", () => {
    it("queueRowsRouteForView emits row_mode + caller_surface when asked, and omits them otherwise", () => {
        const reveal = queueRowsRouteForView({
            workUnitId: "wu-1",
            baseQueueKey: "lifecycle_lead",
            workViewId: "v1",
            limit: 20,
            selectedSiteId: null,
            rowMode: "reveal",
            callerSurface: "work_unit_runtime",
        });
        expect(reveal).toContain("row_mode=reveal");
        expect(reveal).toContain("caller_surface=work_unit_runtime");

        const countOnly = queueRowsRouteForView({
            workUnitId: "wu-1",
            baseQueueKey: "lifecycle_lead",
            workViewId: "v1",
            limit: 1,
            selectedSiteId: null,
        });
        expect(countOnly).not.toContain("row_mode=");
    });

    it("the runtime rows fetch AND the prewarm both request reveal (matching the bootstrap)", () => {
        const runtime = read("lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts");
        expect(runtime).toMatch(/rowMode:\s*"reveal"/);
        const warm = read("lib/presentation/runtime/warmWorkUnitSurfaceSession.ts");
        expect(warm).toMatch(/rowMode:\s*"reveal"/);
        // Bootstrap primary rows already use queue_reveal — the client now matches it.
        const bootstrap = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(bootstrap).toContain("queue_reveal");
    });

    it("the server logs requested_mode / resolved_mode / caller_surface (deployed instrumentation)", () => {
        const route = read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts");
        expect(route).toContain("requested_mode");
        expect(route).toContain("resolved_mode");
        expect(route).toContain("caller_surface");
    });
});

describe("no eager Work Unit route-prefetch storm (§7)", () => {
    it("the work-view rows link opts out of viewport prefetch and warms on intent", () => {
        const list = read("components/presentation/workspace/WorkViewList.tsx");
        expect(list).toContain("prefetch={false}");
        expect(list).toContain("warmWorkUnitSlugRoute");
    });

    it("the header KPI drill link opts out of viewport prefetch and warms on intent", () => {
        const header = read("components/presentation/workspace/WorkspaceHeader.tsx");
        expect(header).toContain("prefetch={false}");
        expect(header).toContain("warmWorkUnitSlugRoute");
    });

    it("the process CTA remains prefetch-suppressed", () => {
        const card = read("components/presentation/workspace/ProcessSummaryCard.tsx");
        expect(card).toContain("prefetch={false}");
    });
});

describe("/workspace boot no longer eagerly warms comms/inbox/processing (§6/§8/§10)", () => {
    const registry = read("lib/adminV2/coreSurfacePreloadRegistry.ts");

    it("the idle core preload does not schedule the comms, inbox, or processing warms", () => {
        expect(registry).not.toContain("scheduleCommunicationsWorkspaceWarm");
        expect(registry).not.toContain("scheduleInboxWarmLoad");
        expect(registry).not.toContain("scheduleProcessingQueueWarm");
    });
});

describe("the linked-drawer graph warm is bounded (§5/§9)", () => {
    it("warmRelatedDrawerGraph caps the eager full-VM composes", () => {
        const warm = read("lib/adminV2/viewModel/drawer/vmRuntime/warmRelatedDrawerGraph.ts");
        expect(warm).toMatch(/RELATED_DRAWER_WARM_TARGET_CAP\s*=\s*\d+/);
        expect(warm).toContain(".slice(0, RELATED_DRAWER_WARM_TARGET_CAP)");
    });
});
