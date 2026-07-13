/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";

function mockRect(el: Element, rect: Partial<DOMRect>) {
    Object.defineProperty(el, "getBoundingClientRect", {
        configurable: true,
        value: () =>
            ({
                x: rect.left ?? 0,
                y: rect.top ?? 0,
                top: rect.top ?? 0,
                left: rect.left ?? 0,
                bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
                right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
                width: rect.width ?? 0,
                height: rect.height ?? 0,
                toJSON() {
                    return this;
                },
            }) as DOMRect,
    });
}

function BottomHarness() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
        <>
            <button ref={anchorRef} type="button" data-anchor="bottom">
                Add Field
            </button>
            <ComposerFloatingPopover open anchorRef={anchorRef} className="test-popover">
                <div style={{ height: 280 }} data-testid="picker-body">
                    Field list
                </div>
            </ComposerFloatingPopover>
        </>
    );
}

function TopHarness() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open] = useState(true);
    return (
        <>
            <button ref={anchorRef} type="button" data-anchor="top">
                Add Field
            </button>
            <ComposerFloatingPopover open={open} anchorRef={anchorRef}>
                <div style={{ height: 120 }}>Items</div>
            </ComposerFloatingPopover>
        </>
    );
}

describe("ComposerFloatingPopover collision", () => {
    const originalInnerHeight = window.innerHeight;
    const originalInnerWidth = window.innerWidth;
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        host.remove();
        Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
        Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    });

    it("portals outside clipping ancestors and flips above near the bottom edge", () => {
        act(() => {
            root.render(<BottomHarness />);
        });
        const anchor = host.querySelector("[data-anchor='bottom']")!;
        mockRect(anchor, { top: 700, left: 40, width: 120, height: 32, bottom: 732 });
        // Re-open by remounting so layout effect remeasures with mocked rect.
        act(() => {
            root.render(<BottomHarness />);
        });
        const anchor2 = host.querySelector("[data-anchor='bottom']")!;
        mockRect(anchor2, { top: 700, left: 40, width: 120, height: 32, bottom: 732 });
        act(() => {
            window.dispatchEvent(new Event("resize"));
        });

        expect(host.querySelector("[data-composer-floating-popover]")).toBeNull();
        const popover = document.querySelector("[data-composer-floating-popover]") as HTMLElement | null;
        expect(popover).toBeTruthy();
        expect(popover!.parentElement).toBe(document.body);
        expect(popover!.getAttribute("data-popover-placement")).toBe("above");
        expect(Number.parseFloat(popover!.style.maxHeight)).toBeGreaterThan(0);
        expect(popover!.style.overflowY).toBe("auto");
        expect(document.querySelector("[data-testid='picker-body']")).toBeTruthy();
    });

    it("places below when there is ample space under the anchor", () => {
        act(() => {
            root.render(<TopHarness />);
        });
        const anchor = host.querySelector("[data-anchor='top']")!;
        mockRect(anchor, { top: 40, left: 40, width: 120, height: 32, bottom: 72 });
        act(() => {
            window.dispatchEvent(new Event("resize"));
        });
        const popover = document.querySelector("[data-composer-floating-popover]") as HTMLElement | null;
        expect(popover?.getAttribute("data-popover-placement")).toBe("below");
    });
});
