import { afterEach, describe, expect, it, vi } from "vitest";

import {
    drawerStackItemToAdminDrawerState,
    resolveDrawerVmRenderDrawer,
    resolveVmDrawerDisplayRoute,
    shouldShowVmDrawerColdShell,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import {
    drawerRuntimePhaseForApplyingVm,
    drawerRuntimePhaseForSwapStart,
    INITIAL_DRAWER_RUNTIME_PHASE_STATE,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

const adminV2Path = "/adminV2/workspace/dept/d1/work-unit/w1";

describe("vmDrawerTransitionCoordinator", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });
    it("keeps source drawer state visible during swap_preparing until atomic commit", () => {
        const source = {
            type: "opportunities" as const,
            id: "opp-1",
            opportunityWorkspaceContext: { department_id: "d1", work_unit_id: "w1" },
        };
        const phase = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "person-2",
        });
        const render = resolveDrawerVmRenderDrawer(source, phase);
        expect(render.type).toBe("opportunities");
        expect(render.id).toBe("opp-1");
    });

    it("keeps source drawer visible during applying_vm body hold", () => {
        const source = {
            type: "opportunities" as const,
            id: "opp-1",
            opportunityWorkspaceContext: { department_id: "d1", work_unit_id: "w1" },
        };
        const preparing = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "person-2",
        });
        const applying = drawerRuntimePhaseForApplyingVm(preparing);
        const render = resolveDrawerVmRenderDrawer(source, applying);
        expect(render.type).toBe("opportunities");
        expect(render.id).toBe("opp-1");
    });

    it("routes display to source runtime during swap_preparing only", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM", "true");
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM", "true");
        const source = {
            type: "opportunities" as const,
            id: "opp-1",
            opportunityWorkspaceContext: { department_id: "d1", work_unit_id: "w1" },
        };
        const preparing = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "person-2",
        });
        expect(resolveVmDrawerDisplayRoute(source, adminV2Path, preparing, null)).toBe("opportunity");
    });

    it("suppresses cold shell when render drawer differs from target during transition", () => {
        expect(
            shouldShowVmDrawerColdShell({
                coldLoading: true,
                hasDisplayVm: false,
                suppressFullDrawerLoading: false,
                renderDrawer: { type: "opportunities", id: "opp-1" },
                targetDrawer: { type: "persons", id: "person-2" },
            })
        ).toBe(false);
    });

    it("allows cold shell only when render and target match on cold open", () => {
        expect(
            shouldShowVmDrawerColdShell({
                coldLoading: true,
                hasDisplayVm: false,
                suppressFullDrawerLoading: false,
                renderDrawer: { type: "persons", id: "person-1" },
                targetDrawer: { type: "persons", id: "person-1" },
            })
        ).toBe(true);
    });

    it("restores openSource on stack items for render reconstruction", () => {
        const state = drawerStackItemToAdminDrawerState({
            type: "persons",
            id: "child-1",
            openSource: "opportunity_inquiry_child",
            personDrawerOpenSeed: { personId: "child-1", presentation_emphasis: "child_lifecycle" },
        });
        expect(state.openSource).toBe("opportunity_inquiry_child");
        expect(state.personDrawerOpenSeed?.presentation_emphasis).toBe("child_lifecycle");
    });
});
