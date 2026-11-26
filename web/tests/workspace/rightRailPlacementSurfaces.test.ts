import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

// createAdminClient only hands a client to the (mocked) resolver and reads work_unit metadata in the
// right-rail bundle loader — a minimal chainable stub is enough.
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => {
        const chain = {
            from: () => chain,
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: { metadata: null }, error: null }),
        };
        return chain;
    },
}));

vi.mock("@/lib/admin/actions/resolveActionsForContext", () => ({
    resolveActionsForContext: vi.fn(),
}));

import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import { loadWorkspaceRootActionsServer } from "@/lib/workspace/loadWorkspaceRootActionsServer";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";

const resolveMock = vi.mocked(resolveActionsForContext);

function act(key: string, label: string): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type: "workflow",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

function payload(partial: Partial<ResolvedActionsBySlot>): ResolvedActionsBySlot {
    return { ...emptyResolvedActionsBySlot(), ...partial };
}

/** Configure the mocked resolver to answer per-surface. */
function respondBySurface(map: Record<string, ResolvedActionsBySlot>): void {
    resolveMock.mockImplementation(async (_supabase, query) => {
        return map[query.surface] ?? emptyResolvedActionsBySlot();
    });
}

function surfacesResolved(): string[] {
    return resolveMock.mock.calls.map((c) => (c[1] as { surface: string }).surface);
}

describe("right-rail placement surfaces include the operator-configurable right_rail surface", () => {
    beforeEach(() => {
        resolveMock.mockReset();
    });

    it("/workspace root resolves both workspace and right_rail surfaces", async () => {
        respondBySurface({
            workspace: payload({ primary: [act("ws_only", "Workspace Only")] }),
            right_rail: payload({ right_rail: [act("rr_configured", "Configured Rail Action")] }),
        });

        const out = await loadWorkspaceRootActionsServer({ orgId: "org-1" });

        expect(surfacesResolved()).toEqual(expect.arrayContaining(["workspace", "right_rail"]));
        const keys = out.map((a) => a.key);
        expect(keys).toContain("rr_configured");
        expect(keys).toContain("ws_only");
    });

    it("/work-unit rail (default surfaces) resolves work_unit and right_rail", async () => {
        respondBySurface({
            work_unit: payload({ primary: [act("wu_action", "Work Unit Action")] }),
            right_rail: payload({ right_rail: [act("rr_configured", "Configured Rail Action")] }),
        });

        // No placementSurfaces → default set, which must include right_rail so operator-configured
        // side-panel actions reach the Work Unit rail.
        const out = await loadRightRailActionsBundleServer({
            orgId: "org-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });

        expect(surfacesResolved()).toEqual(expect.arrayContaining(["work_unit", "right_rail"]));
        const keys = out.map((a) => a.key);
        expect(keys).toContain("rr_configured");
        expect(keys).toContain("wu_action");
    });

    it("de-dupes an action placed on both the primary surface and right_rail, keeping order stable", async () => {
        // `shared` is configured on both the workspace primary slot and the right_rail slot.
        respondBySurface({
            workspace: payload({ primary: [act("shared", "Shared"), act("ws_action", "Workspace Action")] }),
            right_rail: payload({ right_rail: [act("rr_only", "Rail Only")], primary: [act("shared", "Shared Dup")] }),
        });

        const out = await loadWorkspaceRootActionsServer({ orgId: "org-1" });

        const keys = out.map((a) => a.key);
        // right_rail slot flattens first, then primary — order is deterministic.
        expect(keys).toEqual(["rr_only", "shared", "ws_action"]);
        expect(keys.filter((k) => k === "shared")).toHaveLength(1);
    });

    it("does not resolve Focus Panel surfaces (record_header / record_section)", async () => {
        respondBySurface({
            workspace: payload({ primary: [act("ws_only", "Workspace Only")] }),
            right_rail: payload({}),
            work_unit: payload({}),
        });

        await loadWorkspaceRootActionsServer({ orgId: "org-1" });
        await loadRightRailActionsBundleServer({ orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" });

        const surfaces = surfacesResolved();
        expect(surfaces).not.toContain("record_header");
        expect(surfaces).not.toContain("record_section");
    });
});
