import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveVmDrawerDisplayRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import { INITIAL_DRAWER_RUNTIME_PHASE_STATE } from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import {
    legacyDrawerMustNotRenderVmBackedEntity,
    resolveVmCutoverDrawerRoute,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/legacyDrawerVmEntityQuarantine";
import { resolveVmDrawerRuntimeRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const WORKSPACE_WU = "/workspace/work-unit/new-leads/opp-1";
const WORKSPACE_ROOT = "/workspace";

describe("platform simplification phase 3 — legacy drawer quarantine", () => {
    it("routes /workspace opportunity to VM runtime", () => {
        const drawer = { type: "opportunities" as const, id: "opp-1" };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("opportunity");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("routes /workspace person to VM runtime", () => {
        const drawer = {
            type: "persons" as const,
            id: "person-1",
            openSource: "opportunity_primary_contact",
        };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("person");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("routes /workspace child inquiry to VM runtime", () => {
        const drawer = {
            type: "persons" as const,
            id: "child-1",
            openSource: "opportunity_inquiry_child",
        };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("child");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("unsupported entity types no longer have a legacy drawer runtime", () => {
        const drawer = { type: "jobs" as const, id: "job-1" };
        expect(resolveVmDrawerRuntimeRoute(drawer, WORKSPACE_WU)).toBe("legacy");
        const router = read("components/admin/AdminEntityDrawer.tsx");
        expect(router).not.toContain("AdminEntityDrawerLegacy");
    });

    it("AdminEntityDrawer router mounts VM runtimes only", () => {
        const router = read("components/admin/AdminEntityDrawer.tsx");
        expect(router).toContain("EnrollmentSubjectSurfaceRuntime");
        expect(router).toContain("PersonSubjectSurfaceRuntime");
        expect(router).not.toContain("AdminEntityDrawerLegacy");
        expect(router).not.toContain("dynamic(");
    });

    it("resolveVmDrawerDisplayRoute selects VM on /workspace landing", () => {
        const route = resolveVmDrawerDisplayRoute(
            { type: "opportunities", id: "opp-1" },
            WORKSPACE_ROOT,
            INITIAL_DRAWER_RUNTIME_PHASE_STATE,
            null,
        );
        expect(route).toBe("opportunity");
    });
});
