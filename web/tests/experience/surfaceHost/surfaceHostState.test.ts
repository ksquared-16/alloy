import { describe, expect, it } from "vitest";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";
import {
    initialSurfaceHostState,
    surfaceHostReducer,
    type SurfaceHostState,
} from "@/lib/experience/surfaceHost/surfaceHostState";

const workspace = surfaceRefFromPath("/workspace");
const wuA = surfaceRefFromPath("/workspace/work-unit/a");
const wuARecord = surfaceRefFromPath("/workspace/work-unit/a/rec-1");
const wuB = surfaceRefFromPath("/workspace/work-unit/b");

function state(current = workspace): SurfaceHostState {
    return initialSurfaceHostState(current);
}

describe("surfaceHostReducer — Phase 1 hydrate (URL is source of truth)", () => {
    it("initial state is idle with current, no outgoing/incoming", () => {
        const s = state(workspace);
        expect(s).toEqual({ current: workspace, outgoing: null, incoming: null, phase: "idle" });
    });

    it("hydrate to a different surface adopts it as current (parity — route already changed)", () => {
        const s = surfaceHostReducer(state(workspace), { type: "hydrate", ref: wuA });
        expect(s.current.key).toBe("work-unit:a");
        expect(s.phase).toBe("idle");
        expect(s.outgoing).toBeNull();
    });

    it("hydrate to same surface + same record is a no-op (no churn)", () => {
        const s0 = state(wuA);
        expect(surfaceHostReducer(s0, { type: "hydrate", ref: wuA })).toBe(s0);
    });

    it("hydrate same surface with a new record updates in place (Focus Panel is intra-surface)", () => {
        const s = surfaceHostReducer(state(wuA), { type: "hydrate", ref: wuARecord });
        expect(s.current.key).toBe("work-unit:a"); // same surface
        expect(s.current.recordId).toBe("rec-1");
        expect(s.phase).toBe("idle");
    });

    it("browser back/forward is just a hydrate to the popped URL", () => {
        let s = state(workspace);
        s = surfaceHostReducer(s, { type: "hydrate", ref: wuA }); // forward into WU
        s = surfaceHostReducer(s, { type: "hydrate", ref: workspace }); // back to workspace
        expect(s.current.key).toBe("workspace");
    });
});

describe("surfaceHostReducer — Phase 2 exchange API (defined now, unused in Phase 1)", () => {
    it("navigate to a different surface holds outgoing + prepares incoming", () => {
        const s = surfaceHostReducer(state(workspace), { type: "navigate", ref: wuA });
        expect(s.phase).toBe("transitioning");
        expect(s.current.key).toBe("workspace"); // still showing current until settle
        expect(s.outgoing?.key).toBe("workspace");
        expect(s.incoming?.key).toBe("work-unit:a");
    });

    it("settle promotes incoming to current and clears the transition", () => {
        let s = surfaceHostReducer(state(workspace), { type: "navigate", ref: wuA });
        s = surfaceHostReducer(s, { type: "settle" });
        expect(s.current.key).toBe("work-unit:a");
        expect(s.phase).toBe("idle");
        expect(s.outgoing).toBeNull();
        expect(s.incoming).toBeNull();
    });

    it("cancel (supersession) aborts the exchange and keeps current", () => {
        let s = surfaceHostReducer(state(wuB), { type: "navigate", ref: wuA });
        s = surfaceHostReducer(s, { type: "cancel" });
        expect(s.current.key).toBe("work-unit:b");
        expect(s.phase).toBe("idle");
    });

    it("navigate within the same surface is a record change, not an exchange", () => {
        const s = surfaceHostReducer(state(wuA), { type: "navigate", ref: wuARecord });
        expect(s.phase).toBe("idle");
        expect(s.current.recordId).toBe("rec-1");
        expect(s.outgoing).toBeNull();
    });
});
