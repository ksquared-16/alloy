// @vitest-environment jsdom
/**
 * `Action` HAS TO BE USABLE AS A RADIX `asChild` TRIGGER.
 *
 * It used to declare a closed prop list — children, primary, onClick, disabled, title — and render
 * a button from exactly those. Everything else was dropped with no type error and no warning.
 *
 * Radix `asChild` works by handing the child its ref, its pointer and keyboard handlers and its
 * ARIA/state attributes. A child that accepts none of them renders a control that LOOKS like a
 * menu trigger and cannot open. That is what the Tour control was, and the failure was recorded
 * for a while as a Playwright limitation — the harness had been right.
 *
 * These are contract tests for the primitive, not for Tour. They fail if the prop list closes again.
 */
import { createRef, type ComponentProps, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Action } from "@/components/cardLab/CardLabKit";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(node));
    return container;
}

afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
});

describe("CardLabKit Action — Radix trigger contract", () => {
    it("forwards a ref to the underlying button", () => {
        const ref = createRef<HTMLButtonElement>();
        mount(<Action ref={ref}>Send</Action>);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        expect(ref.current?.textContent).toBe("Send");
    });

    it("forwards arbitrary valid button props, including data and ARIA attributes", () => {
        const el = mount(
            <Action
                data-process-action="send_tour_invitation"
                aria-haspopup="menu"
                aria-expanded={false}
                data-state="closed"
                id="tour-trigger"
            >
                Tour
            </Action>,
        ).querySelector("button")!;
        expect(el.getAttribute("data-process-action")).toBe("send_tour_invitation");
        expect(el.getAttribute("aria-haspopup")).toBe("menu");
        expect(el.getAttribute("aria-expanded")).toBe("false");
        expect(el.getAttribute("data-state")).toBe("closed");
        expect(el.id).toBe("tour-trigger");
    });

    it("forwards event handlers other than onClick", () => {
        // Radix opens a dropdown on pointerdown and on keydown, not on click. A primitive that
        // accepts only onClick cannot be driven by it.
        const onPointerDown = vi.fn();
        const onKeyDown = vi.fn();
        const onClick = vi.fn();
        const el = mount(
            <Action onPointerDown={onPointerDown} onKeyDown={onKeyDown} onClick={onClick}>
                Tour
            </Action>,
        ).querySelector("button")!;

        act(() => {
            el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onPointerDown, "onPointerDown must reach the button").toHaveBeenCalledTimes(1);
        expect(onKeyDown, "onKeyDown must reach the button").toHaveBeenCalledTimes(1);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("still owns type and className, which callers must not be able to restyle", () => {
        /*
         * `ActionProps` omits both, so a TypeScript caller is refused at compile time — that is the
         * first line of this contract and it is enforced by the type, not by a test. The cast here
         * gets past it deliberately, to prove the SECOND line: even when the props arrive at
         * runtime (an untyped caller, a spread of unknown props), the primitive still wins. Opening
         * the prop list must not have opened the visual contract.
         */
        const hostile = { className: "caller-supplied", type: "submit" } as unknown as ComponentProps<
            typeof Action
        >;
        const el = mount(
            <Action primary {...hostile}>
                Go
            </Action>,
        ).querySelector("button")!;
        expect(el.type, "a command must never submit a form").toBe("button");
        expect(el.className).toBe("alloy-os-currentwork__primary-action");
        expect(el.className).not.toContain("caller-supplied");
    });

    it("keeps rendering the states it always owned", () => {
        const el = mount(
            <Action disabled title="Not available yet">
                Reschedule
            </Action>,
        ).querySelector("button")!;
        expect(el.disabled).toBe(true);
        expect(el.title).toBe("Not available yet");
        expect(el.className).toBe("alloy-os-currentwork__helpful-action");
    });
});
