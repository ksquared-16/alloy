import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveVmDrawerDisplayRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import {
    INITIAL_DRAWER_RUNTIME_PHASE_STATE,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
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
    const prevOppKill = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
    const prevPersonKill = process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
    const prevChildKill = process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = prevOppKill;
        process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH = prevPersonKill;
        process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH = prevChildKill;
        vi.unstubAllEnvs();
    });

    it("routes /workspace opportunity to VM only when cutover is on", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        const drawer = { type: "opportunities" as const, id: "opp-1" };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("opportunity");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("routes /workspace person to VM only when cutover is on", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
        const drawer = {
            type: "persons" as const,
            id: "person-1",
            openSource: "opportunity_primary_contact",
        };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("person");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("routes /workspace child inquiry to VM only when cutover is on", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;
        const drawer = {
            type: "persons" as const,
            id: "child-1",
            openSource: "opportunity_inquiry_child",
        };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("child");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(true);
    });

    it("keeps legacy drawer for unmigrated entity types on /workspace", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        const drawer = { type: "jobs" as const, id: "job-1" };
        expect(resolveVmDrawerRuntimeRoute(drawer, WORKSPACE_WU)).toBe("legacy");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(false);
    });

    it("allows legacy opportunity drawer when kill switch is active (explicit rollback)", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        const drawer = { type: "opportunities" as const, id: "opp-1" };
        expect(resolveVmCutoverDrawerRoute(drawer, WORKSPACE_WU)).toBe("legacy");
        expect(legacyDrawerMustNotRenderVmBackedEntity(drawer, WORKSPACE_WU)).toBe(false);
    });

    it("AdminEntityDrawer router mounts VM runtimes and quarantines legacy for VM entities", () => {
        const router = read("components/admin/AdminEntityDrawer.tsx");
        expect(router).toContain("OpportunityDrawerVmRuntime");
        expect(router).toContain("PersonsDrawerVmRuntime");
        expect(router).toContain("legacyDrawerMustNotRenderVmBackedEntity");
        expect(router).toMatch(/if \(route === "opportunity"\)/);
        expect(router).toMatch(/if \(route === "person" \|\| route === "child"\)/);
        expect(router).toContain("dynamic(");
        expect(router).toContain("AdminEntityDrawerLegacy");
    });

    it("AdminEntityDrawerLegacy quarantines VM-backed entities on canonical surfaces", () => {
        const legacy = read("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(legacy).toContain("legacyDrawerMustNotRenderVmBackedEntity");
        expect(legacy).toContain("isCanonicalDrawerHostPath");
    });

    it("resolveVmDrawerDisplayRoute selects VM on /workspace landing", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        const route = resolveVmDrawerDisplayRoute(
            { type: "opportunities", id: "opp-1" },
            WORKSPACE_ROOT,
            INITIAL_DRAWER_RUNTIME_PHASE_STATE,
            null,
        );
        expect(route).toBe("opportunity");
    });
});
