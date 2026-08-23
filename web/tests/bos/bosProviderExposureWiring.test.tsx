/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { BosPresentationControllerProvider } from "@/contexts/BosPresentationControllerContext";
import { CommandRailBosMount, useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";
import { BOS_PRESENTATION_STATE_KEY } from "@/lib/bos/bosPresentationPreference";
import { BOS_FLOATING_GEOMETRY_KEY } from "@/lib/bos/bosFloatingGeometry";
import {
    beginWorkUnitPrimaryReveal,
    declareWorkUnitSurfaceMounted,
    endWorkUnitPrimaryReveal,
    releaseWorkUnitSurface,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

/**
 * R6 — the REAL provider composition, not a mirror of it.
 *
 * The exposure fixtures model how the controller composes lifecycle and placement. This suite runs
 * the actual `BosPresentationControllerProvider` and the actual `CommandRailBosMount`, and reads the
 * rendered overlay's own style. Nothing here re-derives `resolveFloatingExposure` or the epoch rule:
 * the test drives lifecycle transitions and lets the provider's own parking effect commit geometry.
 *
 * Only the rail's heavy CHILDREN are stubbed — they render UI this suite does not assert and would
 * otherwise drag in the whole command surface. The provider, the mount, the exposure rule and the
 * epoch composition are all the real ones.
 */

vi.mock("@/app/adminV2/components/AICommandBar", () => ({ default: () => <div data-stub="command-bar" /> }));
vi.mock("@/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell", () => ({
    default: () => <div data-stub="surface-shell" />,
}));
vi.mock("@/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation", () => ({
    BosFloatingResizeHandle: () => <div data-stub="resize-handle" />,
}));

/** Fires once on observe (as a real ResizeObserver does) and again whenever the test asks. */
const observerCallbacks = new Set<() => void>();
class TestObserver {
    constructor(private readonly cb: () => void) {}
    observe() { observerCallbacks.add(this.cb); this.cb(); }
    disconnect() { observerCallbacks.delete(this.cb); }
    unobserve() { observerCallbacks.delete(this.cb); }
    takeRecords() { return []; }
}
/** Stand in for a DOM change the provider's observer would see; it debounces by 150 ms. */
async function contentChanged() {
    await act(async () => {
        for (const cb of [...observerCallbacks]) cb();
        await new Promise((r) => setTimeout(r, 220));
    });
}

let root: Root;
let host: HTMLDivElement;

/**
 * The rail only mounts its body overlay once a host element inside the workspace command column has
 * registered — that is how the real shell wires it, so the harness does the same rather than
 * bypassing the condition.
 */
function RailHost() {
    const registerHost = useCommandRailBosHostRef();
    return <div data-adminv2-workspace-command-column="true"><div ref={registerHost} /></div>;
}

function Harness() {
    const ambientRef = useRef<HTMLDivElement | null>(null);
    return (
        <div ref={ambientRef} style={{ width: 1440 }}>
            <BosPresentationControllerProvider ambientRef={ambientRef}>
                <CommandRailBosMount><RailHost /></CommandRailBosMount>
            </BosPresentationControllerProvider>
        </div>
    );
}

const overlay = () => document.querySelector<HTMLElement>('[data-adminv2-bos-rail-overlay="true"]');
const styleOf = () => {
    const el = overlay();
    return el ? { visibility: el.style.visibility, pointerEvents: el.style.pointerEvents, left: el.style.left, top: el.style.top, width: el.style.width } : null;
};
/** Let the provider's rAF-scheduled park and its observers run. */
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(async () => {
    sessionStorage.clear();
    // Automatic floating: preferred is floating, and NO stored operator geometry.
    sessionStorage.setItem(BOS_PRESENTATION_STATE_KEY, "floating");
    sessionStorage.removeItem(BOS_FLOATING_GEOMETRY_KEY);
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    observerCallbacks.clear();
    vi.stubGlobal("ResizeObserver", TestObserver);
    vi.stubGlobal("MutationObserver", TestObserver);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    /*
     * jsdom performs no layout, so every rect is 0×0 and the provider would derive a `constrained`
     * canvas — the one canvas the gate is deliberately scoped out of. Substituting the MEASUREMENT
     * (not the rule) puts the provider on the expanded canvas where the defect was measured.
     */
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0, y: 0, width: 1440, height: 960, top: 0, left: 0, right: 1440, bottom: 960,
        toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, "innerHeight", { value: 960, configurable: true });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function mount() {
    await act(async () => { root.render(<Harness />); });
    await settle();
}

describe("real provider → mount exposure wiring", () => {
    it("1. the automatic floating rail renders hidden", async () => {
        const epoch = declareWorkUnitSurfaceMounted(true);
        await mount();
        expect(overlay()).not.toBeNull();
        expect(styleOf()?.visibility).toBe("hidden");
        releaseWorkUnitSurface(epoch);
    });

    it("2. it stays hidden while the Work Unit lifecycle is pending, then active", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        expect(styleOf()?.visibility).toBe("hidden");
        await act(async () => { beginWorkUnitPrimaryReveal(); });
        await settle();
        expect(styleOf()?.visibility).toBe("hidden");
    });

    it("3. a geometry commit while pending does not expose it", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();               // the provider's park already ran under pending
        await settle();
        expect(styleOf()?.visibility).toBe("hidden");
    });

    it("4/5. terminal lifecycle exposes only once the provider commits a placement for that epoch", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        expect(styleOf()?.visibility).toBe("hidden");
        await act(async () => { endWorkUnitPrimaryReveal(); });
        await settle();
        // The provider's observer re-parks on DOM change; nudge the document so it runs.
        await contentChanged();
        expect(styleOf()?.visibility).toBe("visible");
    });

    it("6. the exposed DOM carries the committed geometry, and revealing does not change it", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        const hidden = styleOf();
        await act(async () => { endWorkUnitPrimaryReveal(); });
        await settle();
        await contentChanged();
        const shown = styleOf();
        expect(shown?.visibility).toBe("visible");
        expect({ left: shown?.left, top: shown?.top, width: shown?.width }).toEqual({
            left: hidden?.left, top: hidden?.top, width: hidden?.width,
        });
    });

    it("7/8. a newer epoch revokes trust, and the prior epoch's commit cannot expose it", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        await act(async () => { endWorkUnitPrimaryReveal(); });
        await settle();
        await contentChanged();
        expect(styleOf()?.visibility).toBe("visible");
        await act(async () => { declareWorkUnitSurfaceMounted(true); });   // replacement navigation
        await settle();
        expect(styleOf()?.visibility).toBe("hidden");
    });

    it("9. empty / unavailable / error terminal states do not deadlock", async () => {
        for (const finish of [
            () => endWorkUnitPrimaryReveal("empty"),
            () => endWorkUnitPrimaryReveal("error"),
        ]) {
            declareWorkUnitSurfaceMounted(true);
            await mount();
            await act(async () => { finish(); });
            await settle();
            await contentChanged();
            expect(styleOf()?.visibility).toBe("visible");
            await act(async () => root.unmount());
            host.remove();
            host = document.createElement("div");
            document.body.appendChild(host);
            root = createRoot(host);
        }
        declareWorkUnitSurfaceMounted(false);   // unavailable at declaration
        await mount();
        await contentChanged();
        expect(styleOf()?.visibility).toBe("visible");
    });

    it("10. a non-Work-Unit surface exposes after its own first placement commit", async () => {
        const epoch = declareWorkUnitSurfaceMounted(true);
        releaseWorkUnitSurface(epoch);          // lifecycle terminal, as on /workspace
        await mount();
        await contentChanged();
        expect(styleOf()?.visibility).toBe("visible");
    });

    it("11. an operator-positioned window is never withheld", async () => {
        sessionStorage.setItem(BOS_FLOATING_GEOMETRY_KEY, JSON.stringify({ x: 100, y: 100, width: 400, height: 600 }));
        declareWorkUnitSurfaceMounted(true);    // pending — would otherwise hide
        await mount();
        expect(styleOf()?.visibility).toBe("visible");
    });

    it("hidden rail sets pointer-events none and exposes no focusable control", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        expect(styleOf()?.visibility).toBe("hidden");
        expect(styleOf()?.pointerEvents).toBe("none");
        // `visibility: hidden` removes descendants from the tab order; assert the property that does it.
        expect(overlay()?.style.visibility).toBe("hidden");
    });

    it("unmount tears the provider down without throwing", async () => {
        declareWorkUnitSurfaceMounted(true);
        await mount();
        await expect(act(async () => root.unmount())).resolves.not.toThrow();
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });
});
