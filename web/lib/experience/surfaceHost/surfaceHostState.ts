/**
 * Surface Host — the operational-context state model.
 *
 * Establishes the current / outgoing / incoming ownership the whole architecture grows on
 * (docs/platform/experience/surface-host-architecture.md §3, §7). Pure + reducer-based so the
 * lifecycle is testable without the DOM.
 *
 * PHASE 1 dispatches only `hydrate` (mirror the URL into `current`; parity behavior — the routes
 * still render the surfaces). `navigate` / `settle` / `cancel` are the Phase-2 exchange API; they
 * are defined and tested now so the transition loop has a natural home, but are NOT dispatched yet.
 */

import { isSameSurface, type SurfaceRef } from "@/lib/experience/surfaceHost/surfaceRef";

export type SurfaceHostPhase = "idle" | "transitioning";

export type SurfaceHostState = {
    /** The surface with focus. */
    current: SurfaceRef;
    /** The surface yielding focus (Phase 2 choreography). Null outside a transition. */
    outgoing: SurfaceRef | null;
    /** The surface establishing focus (Phase 2 choreography). Null outside a transition. */
    incoming: SurfaceRef | null;
    phase: SurfaceHostPhase;
};

export type SurfaceHostAction =
    /** URL is the source of truth — align `current` (cold load, route change, popstate). */
    | { type: "hydrate"; ref: SurfaceRef }
    /** Phase 2: begin an exchange — hold outgoing, prepare incoming. */
    | { type: "navigate"; ref: SurfaceRef }
    /** Phase 2: the incoming surface has established — it becomes current. */
    | { type: "settle" }
    /** Phase 2: supersession — abort the in-flight exchange, keep current. */
    | { type: "cancel" };

export function initialSurfaceHostState(current: SurfaceRef): SurfaceHostState {
    return { current, outgoing: null, incoming: null, phase: "idle" };
}

export function surfaceHostReducer(
    state: SurfaceHostState,
    action: SurfaceHostAction,
): SurfaceHostState {
    switch (action.type) {
        case "hydrate": {
            // Same surface (record may differ) → update current in place, drop any transition.
            // Different surface → adopt it as current (Phase 1: URL already changed the route).
            if (
                isSameSurface(state.current, action.ref) &&
                state.current.recordId === action.ref.recordId &&
                state.phase === "idle"
            ) {
                return state;
            }
            return initialSurfaceHostState(action.ref);
        }
        case "navigate": {
            if (isSameSurface(state.current, action.ref)) {
                // Same surface — record-level change only; no surface exchange.
                return { ...state, current: action.ref };
            }
            return {
                current: state.current,
                outgoing: state.current,
                incoming: action.ref,
                phase: "transitioning",
            };
        }
        case "settle": {
            if (state.phase !== "transitioning" || !state.incoming) return state;
            return initialSurfaceHostState(state.incoming);
        }
        case "cancel": {
            if (state.phase !== "transitioning") return state;
            return initialSurfaceHostState(state.current);
        }
        default:
            return state;
    }
}
