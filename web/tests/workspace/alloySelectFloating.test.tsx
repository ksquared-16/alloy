// @vitest-environment jsdom
/**
 * AlloySelect `floating` — the menu a clipping container (the Catalog item dialog's scrolling body)
 * cut off. Fixed to the viewport beside its trigger: below by default, above near the bottom edge,
 * never past an edge, clamped at the sides, sized to the VISIBLE viewport (a phone's keyboard), and
 * still a DOM descendant of the control so focus, keyboard and outside-click are unchanged.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AlloySelect, placeFloatingMenu } from "@/components/workspace/AlloySelect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const desktop = { layoutWidth: 1280, layoutHeight: 800 };

describe("placeFloatingMenu", () => {
    it("opens below a trigger with room, as wide as the trigger, at most 320px tall", () => {
        expect(placeFloatingMenu({ top: 100, bottom: 136, left: 200, width: 360 }, desktop)).toEqual({
            top: 138, left: 200, width: 360, maxHeight: 320, above: false,
        });
    });

    it("near the bottom edge it opens above, sized to the space above, anchored by bottom", () => {
        const p = placeFloatingMenu({ top: 700, bottom: 736, left: 200, width: 360 }, desktop);
        expect(p.above).toBe(true);
        expect(p.bottom).toBe(800 - 700 + 2);
        expect(p.top).toBeUndefined();
        expect(p.maxHeight).toBe(320);
    });

    it("never runs past the edge it opens toward", () => {
        for (const top of [40, 150, 260, 300, 420, 500]) {
            const trigger = { top, bottom: top + 36, left: 0, width: 300 };
            const p = placeFloatingMenu(trigger, { layoutWidth: 1280, layoutHeight: 560 });
            if (p.above) expect(trigger.top - 2 - p.maxHeight).toBeGreaterThanOrEqual(8);
            else expect(p.top! + p.maxHeight).toBeLessThanOrEqual(560 - 8);
        }
    });

    it("clamps to the side edges on a narrow phone", () => {
        const p = placeFloatingMenu({ top: 100, bottom: 136, left: 300, width: 360 }, { layoutWidth: 375, layoutHeight: 667 });
        expect(p.width).toBe(375 - 16);
        expect(p.left).toBe(8);
        expect(p.left + p.width).toBeLessThanOrEqual(375 - 8);
    });

    it("measures room against the visible viewport, not the layout one (keyboard up)", () => {
        const p = placeFloatingMenu(
            { top: 300, bottom: 336, left: 8, width: 300 },
            { layoutWidth: 375, layoutHeight: 667, visibleTop: 0, visibleHeight: 380 },
        );
        expect(p.above).toBe(true);
        expect(p.bottom).toBe(667 - 300 + 2);
    });
});

describe("AlloySelect floating, mounted", () => {
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        host = document.createElement("div");
        /* The clipping container the dialog body is. */
        host.style.overflow = "hidden";
        host.style.height = "40px";
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it("renders the open list fixed, positioned inline, inside the control, with keyboard focus on the selection", () => {
        const options = Array.from({ length: 30 }, (_, i) => ({ value: `a${i}`, label: `40${String(i).padStart(2, "0")} · Account ${i}` }));
        act(() => root.render(<AlloySelect value="a3" onChange={() => {}} options={options} floating testId="gl" aria-label="GL Code" />));
        const trigger = host.querySelector<HTMLButtonElement>('[data-testid="gl"] button')!;
        act(() => trigger.click());
        const list = host.querySelector<HTMLUListElement>('[role="listbox"]')!;
        expect(list).not.toBeNull();
        expect(host.querySelector('[data-testid="gl"]')!.contains(list)).toBe(true);
        expect(list.classList.contains("alloy-select__list--floating")).toBe(true);
        expect(list.getAttribute("data-alloy-select-floating")).toBe("below");
        expect(list.style.visibility).not.toBe("hidden");
        expect(list.style.maxHeight).toMatch(/px$/);
        expect(list.style.left).toMatch(/px$/);
        expect(document.activeElement?.getAttribute("data-option-value")).toBe("a3");
        act(() => {
            document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(host.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it("without floating, the in-flow menu is unchanged", () => {
        act(() => root.render(<AlloySelect value="" onChange={() => {}} options={[{ value: "x", label: "X" }]} testId="plain" />));
        act(() => host.querySelector<HTMLButtonElement>('[data-testid="plain"] button')!.click());
        const list = host.querySelector<HTMLUListElement>('[role="listbox"]')!;
        expect(list.classList.contains("alloy-select__list--floating")).toBe(false);
        expect(list.getAttribute("style")).toBeNull();
    });
});
