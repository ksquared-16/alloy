// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AlloySelect } from "@/components/workspace/AlloySelect";

/**
 * ALLOYSELECT — focus must come back to the trigger when the menu closes.
 *
 * The component moves DOM focus INTO the list while open, so screen readers and the browser's focus
 * ring follow the keyboard. Nothing gave it back: when the list unmounted the browser dropped focus
 * to `<body>`, so a keyboard operator lost their place and Tab restarted from the top of the page.
 *
 * Measured on the Focus Panel before the fix — after Escape closed a menu inside an inline field
 * editor, `document.activeElement` was BODY. That also defeated every enclosing layer's ability to
 * tell the operator was still inside the field, which is how ONE Escape came to collapse a menu,
 * a field editor and the whole expanded card together.
 *
 * Behavioural, through real DOM events, matching `alloySelectInteraction` — the markup was always
 * plausible; only the focus destination was wrong.
 */

const OPTIONS = [
    { value: "site-a", label: "Northwind — Riverside Campus" },
    { value: "site-b", label: "Northwind — Lakeside Campus" },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

function Harness({ initial = "site-a" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return <AlloySelect value={value} onChange={setValue} options={OPTIONS} aria-label="Site" />;
}

function mount(ui: React.ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(ui));
    return host;
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Site"]')!;
const listbox = () => document.querySelector<HTMLElement>("[role=listbox]");
const options = () => Array.from(document.querySelectorAll<HTMLElement>("[role=option]"));

function keyOnActiveOption(k: string) {
    const list = listbox()!;
    const idx = Number((list.getAttribute("aria-activedescendant") ?? "").split("-opt-").pop() ?? 0);
    act(() => {
        options()[idx]!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });
}

const openMenu = () => act(() => trigger().dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("closing the menu returns focus to the trigger", () => {
    it("moves focus into the list while open", () => {
        mount(<Harness />);
        openMenu();
        expect(listbox()).not.toBeNull();
        expect(document.activeElement?.getAttribute("role")).toBe("option");
    });

    it("restores focus to the trigger on Escape, not to body", () => {
        mount(<Harness />);
        openMenu();
        keyOnActiveOption("Escape");
        expect(listbox()).toBeNull();
        expect(document.activeElement).toBe(trigger());
    });

    it("restores focus to the trigger after picking an option", () => {
        mount(<Harness />);
        openMenu();
        keyOnActiveOption("Enter");
        expect(listbox()).toBeNull();
        expect(document.activeElement).toBe(trigger());
    });

    it("leaves focus alone when the operator closed it by focusing something else", () => {
        mount(<Harness />);
        const elsewhere = document.createElement("input");
        document.body.appendChild(elsewhere);
        openMenu();
        elsewhere.focus();
        // An outside pointerdown is what actually closes it in the browser.
        act(() => document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
        expect(listbox()).toBeNull();
        // Reclaiming focus here would yank the operator out of the control they just clicked into.
        expect(document.activeElement).toBe(elsewhere);
        elsewhere.remove();
    });

    it("does not grab focus on first render, only on a close", () => {
        const before = document.activeElement;
        mount(<Harness />);
        expect(document.activeElement).toBe(before);
    });
});
