/** @vitest-environment jsdom */

/**
 * BP V2 D9 — opening a record does not present an unrequested assistant over it.
 *
 * Hosted (`qar_08296c326232`): with no stored preference and no click, the BOS rail floated over the
 * Enrollment Focus Panel on first entry (32%), refresh (32%) and record switch (9%). The provider's
 * default and its auto-recommendation are both `floating`.
 *
 * REAL: `BosPresentationControllerProvider`, `CommandRailBosMount`, `BosPresentationControls` (the
 * "Open BOS" launcher), `BosRailHeader` (the rail's Close), `BosRecordSurfaceBridge` and
 * `AskBosHandoffListener`. STUBBED: the committed Focus the bridge reads (the runtime kernel is a
 * separate subsystem; this drives its output), and the rail's heavy children.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import React, { useRef, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const focusStore = vi.hoisted(() => {
    let state: { current: unknown; desired: unknown } = { current: null, desired: null };
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        set: (next: { current: unknown; desired: unknown }) => { state = next; listeners.forEach((l) => l()); },
        subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    };
});
vi.mock("@/lib/runtime/kernel/RuntimeKernelContext", () => ({
    useCommittedFocus: () => useSyncExternalStore(focusStore.subscribe, focusStore.get, focusStore.get),
}));
const handoffs = vi.hoisted(() => [] as unknown[]);
vi.mock("@/contexts/GlobalAssistantContext", () => ({ useGlobalAssistantOptional: () => ({}) }));
vi.mock("@/lib/adminV2/bos/bosDrawerAssistHandoff", () => ({
    ADMINV2_ASK_BOS_HANDOFF_EVENT: "test:ask-bos",
    triggerBosDrawerAssistHandoff: (a: unknown) => handoffs.push(a),
    queueBosHandoffPreviewFromOperationalRead: () => undefined,
}));
vi.mock("@/lib/adminV2/bos/bosAssistHandoffRouting", () => ({ buildOverviewDataForBosHandoff: () => ({}) }));
vi.mock("@/app/adminV2/components/AICommandBar", () => ({ default: () => <div data-stub="command-bar" /> }));
vi.mock("@/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell", async () => {
    const { BosRailHeader } = await vi.importActual<typeof import("@/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation")>(
        "@/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation",
    );
    return { default: () => <BosRailHeader contextDisplayLine={null} /> };
});

import { BosPresentationControllerProvider } from "@/contexts/BosPresentationControllerContext";
import { CommandRailBosMount, useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";
import { BosPresentationControls } from "@/components/presentation/BosPresentationControls";
import { BosRecordSurfaceBridge } from "@/components/adminV2/BosRecordSurfaceBridge";
import AskBosHandoffListener from "@/components/adminV2/AskBosHandoffListener";
import { BOS_PRESENTATION_STATE_KEY } from "@/lib/bos/bosPresentationPreference";
import { WORKSPACE_ATTENTION_TARGET } from "@/lib/runtime/kernel/attention";

function RailHost() {
    const registerHost = useCommandRailBosHostRef();
    return <div data-adminv2-workspace-command-column="true"><div ref={registerHost} /></div>;
}
function Harness() {
    const ambientRef = useRef<HTMLDivElement | null>(null);
    return (
        <div ref={ambientRef} style={{ width: 1440 }}>
            <BosPresentationControllerProvider ambientRef={ambientRef}>
                <CommandRailBosMount>
                    <AskBosHandoffListener />
                    <BosRecordSurfaceBridge />
                    <RailHost />
                    <BosPresentationControls />
                </CommandRailBosMount>
            </BosPresentationControllerProvider>
        </div>
    );
}

const workUnit = (subject: string) => ({ current: { ref: { target: "lifecycle_wu_enrollment", lens: "all", subject } }, desired: { target: "lifecycle_wu_enrollment", lens: "all", subject } });
const workspace = { current: { ref: { target: WORKSPACE_ATTENTION_TARGET, lens: null, subject: null } }, desired: { target: WORKSPACE_ATTENTION_TARGET } };

const overlay = () => document.querySelector<HTMLElement>('[data-adminv2-bos-rail-overlay="true"]');
const launcher = () => document.querySelector<HTMLButtonElement>("[data-bos-launcher]");
const stored = () => sessionStorage.getItem(BOS_PRESENTATION_STATE_KEY);
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    sessionStorage.clear();
    handoffs.length = 0;
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 960, configurable: true });
    // jsdom has no layout; give the ambient root the expanded-desktop width the defect was measured at.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0, y: 0, width: 1440, height: 960, top: 0, left: 0, right: 1440, bottom: 960, toJSON: () => ({}),
    } as DOMRect);
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
async function mount(focus: { current: unknown; desired: unknown }) {
    focusStore.set(focus);
    await act(async () => { root.render(<Harness />); });
    await settle();
}
async function remount() {
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => { root.render(<Harness />); });
    await settle();
}

describe("D9 — record entry is unobstructed; BOS opens when asked", () => {
    it("1. fresh tab, Enrollment record, no saved preference: no assistant over the record, launcher offered, nothing stored", async () => {
        await mount(workUnit("de17caff-d706-44e8-b9d1-07aa58caa44b"));
        expect(overlay()).toBeNull();
        expect(launcher()?.textContent).toContain("BOS");
        expect(stored()).toBeNull();
    });

    it("2. refresh: still none", async () => {
        await mount(workUnit("de17caff"));
        await remount();
        expect(overlay()).toBeNull();
        expect(launcher()).not.toBeNull();
    });

    it("3. switching records: still none", async () => {
        await mount(workUnit("de17caff"));
        for (const next of ["d9b1fbfb", "41ec45f8", "cf02f5d6"]) {
            await act(async () => { focusStore.set(workUnit(next)); });
            await settle();
            expect(overlay(), next).toBeNull();
        }
    });

    it("7/8. explicit open shows it; Close returns to the launcher; both are remembered for the tab", async () => {
        await mount(workUnit("de17caff"));
        await act(async () => { launcher()!.click(); });
        await settle();
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
        expect(stored()).toBe("floating");
        const close = document.querySelector<HTMLButtonElement>("[data-bos-close]");
        expect(close, "the rail's own Close").not.toBeNull();
        await act(async () => { close!.click(); });
        await settle();
        expect(overlay()).toBeNull();
        expect(launcher()).not.toBeNull();
        expect(stored()).toBe("closed");
    });

    it("an assistant the operator opened stays open across a record switch and a refresh (their choice)", async () => {
        await mount(workUnit("de17caff"));
        await act(async () => { launcher()!.click(); });
        await settle();
        await act(async () => { focusStore.set(workUnit("d9b1fbfb")); });
        await settle();
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
        await remount();
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
    });

    it("a pinned choice is honoured on a record", async () => {
        sessionStorage.setItem(BOS_PRESENTATION_STATE_KEY, "pinned");
        await mount(workUnit("de17caff"));
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("pinned");
    });

    it("11. the Workspace keeps its designed default: floating with no choice made", async () => {
        await mount(workspace);
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
        expect(stored()).toBeNull();
    });

    it("leaving the record for the Workspace restores the default; entering a record again does not", async () => {
        await mount(workUnit("de17caff"));
        expect(overlay()).toBeNull();
        await act(async () => { focusStore.set(workspace); });
        await settle();
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
        await act(async () => { focusStore.set(workUnit("d9b1fbfb")); });
        await settle();
        expect(overlay()).toBeNull();
    });

    it("11. Ask BOS (an explicit invocation) on a record lands in a visible assistant", async () => {
        await mount(workUnit("de17caff"));
        expect(overlay()).toBeNull();
        await act(async () => {
            window.dispatchEvent(new CustomEvent("test:ask-bos", { detail: { opportunity_id: "de17caff", display_name: "Readiness Family" } }));
        });
        await settle();
        expect(handoffs).toHaveLength(1);
        expect(overlay()?.getAttribute("data-bos-overlay-mode")).toBe("floating");
    });
});
