import { describe, expect, it } from "vitest";

import { captureDrawerVmDomRenderSnapshot } from "@/lib/adminV2/viewModel/drawer/drawerVmDomRenderTrace";

describe("drawerVmDomRenderTrace", () => {
    it("returns missing status when drawer root is absent", () => {
        const snap = captureDrawerVmDomRenderSnapshot({
            opportunityId: "opp-1",
            drawerTransitionId: 2,
            drawerRuntimePhase: "swap_preparing",
        });
        expect(snap.opportunity_id).toBe("opp-1");
        expect(snap.drawer_transition_id).toBe(2);
        expect(snap.drawer_runtime_phase).toBe("swap_preparing");
        expect(snap.drawer_model_swap_generation).toBe(2);
        expect(snap.status_control).toBe("missing");
        expect(snap.operational_loading).toBe(false);
        expect(snap.task_preview_skeleton).toBe(false);
    });
});
