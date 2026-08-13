// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AlloySelect } from "@/components/workspace/AlloySelect";

/**
 * ALLOYSELECT — shared primitive regression.
 *
 * This branch rewrote the component into a real listbox (89 lines changed) because the previous one
 * could not be operated: the site picker it backs would not commit a selection, which is what made
 * Attendance open on "All sites" and render no rooms. It is a SHARED primitive, so a regression here
 * breaks surfaces far outside this sprint — and until now it had no test of its own.
 *
 * Driven through real DOM events rather than by reading the source, because the failure being
 * guarded against was behavioural: the markup was already plausible when the control did nothing.
 */

const OPTIONS = [
    { value: "site-a", label: "Northwind — Riverside Campus" },
    { value: "site-b", label: "Northwind — Lakeside Campus" },
    { value: "site-c", label: "Northwind — Hilltop Campus" },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

/** A controlled host, because "controlled value does not regress" is one of the claims. */
function Harness({ onChange, initial = "site-a" }: { onChange?: (v: string) => void; initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
        <AlloySelect
            value={value}
            onChange={(v) => {
                setValue(v);
                onChange?.(v);
            }}
            options={OPTIONS}
            aria-label="Site"
        />
    );
}

function mount(ui: React.ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(ui));
    return host;
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Site"]')!;
const options = () => Array.from(document.querySelectorAll<HTMLElement>("[role=option]"));
const listbox = () => document.querySelector<HTMLElement>("[role=listbox]");

/**
 * Keys are dispatched on the ACTIVE OPTION, not the listbox: the component binds its key handling
 * per-option (each `<li>` carries `onKeyDown`) and moves DOM focus with the active index. Firing at
 * the listbox bubbles nowhere useful and silently proves nothing.
 */
function key(k: string) {
    const list = listbox()!;
    const idx = Number((list.getAttribute("aria-activedescendant") ?? "").split("-opt-").pop() ?? 0);
    act(() => {
        options()[idx]!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });
}

/**
 * The list always leads with a PLACEHOLDER entry (value ""), so option 0 is not a real choice and
 * every supplied option sits at index+1. That is deliberate product behaviour — the control has to
 * be able to represent "nothing chosen" — and these tests assert it rather than working around it.
 */
const PLACEHOLDER_OFFSET = 1;

describe("AlloySelect — shared primitive", () => {
    it("exposes listbox semantics on the trigger", () => {
        mount(<Harness />);
        const t = trigger();
        expect(t.getAttribute("aria-haspopup")).toBe("listbox");
        expect(t.getAttribute("aria-expanded")).toBe("false");
        expect(t.getAttribute("aria-controls")).toBeTruthy();
        // Closed means genuinely absent, not merely hidden — nothing to tab into.
        expect(listbox()).toBeNull();
    });

    it("shows the SELECTED option's label, not its value", () => {
        mount(<Harness initial="site-b" />);
        expect(trigger().textContent).toContain("Northwind — Lakeside Campus");
    });

    it("commits a POINTER selection and reflects it on the trigger", () => {
        const seen: string[] = [];
        mount(<Harness onChange={(v) => seen.push(v)} />);

        act(() => trigger().click());
        expect(trigger().getAttribute("aria-expanded")).toBe("true");
        expect(options(), "placeholder + three supplied options").toHaveLength(4);

        act(() => options()[PLACEHOLDER_OFFSET + 1]!.click());

        // The regression that mattered: the click must COMMIT, not just close the menu.
        expect(seen).toEqual(["site-b"]);
        expect(trigger().textContent).toContain("Northwind — Lakeside Campus");
        expect(listbox()).toBeNull();
    });

    it("marks exactly the selected option aria-selected", () => {
        mount(<Harness initial="site-c" />);
        act(() => trigger().click());
        expect(options().map((o) => o.getAttribute("aria-selected"))).toEqual([
            "false", // placeholder
            "false",
            "false",
            "true",
        ]);
    });

    it("tracks the active option with aria-activedescendant as the operator arrows", () => {
        mount(<Harness />);
        act(() => trigger().click());

        const active = () => listbox()!.getAttribute("aria-activedescendant");
        const first = active();
        expect(first, "no active descendant on open — a keyboard operator has no cursor").toBeTruthy();

        key("ArrowDown");
        expect(active(), "ArrowDown did not move the active descendant").not.toBe(first);
    });

    it("opens on the CURRENT selection so arrowing starts where the operator is", () => {
        mount(<Harness initial="site-c" />);
        act(() => trigger().click());
        // site-c is entry 3 (placeholder + 2); opening at 0 would make ArrowDown skip the current value.
        expect(listbox()!.getAttribute("aria-activedescendant")).toMatch(/-opt-3$/);
    });

    it("commits a KEYBOARD selection with Enter", () => {
        const seen: string[] = [];
        mount(<Harness onChange={(v) => seen.push(v)} />);
        act(() => trigger().click());

        key("ArrowDown");
        key("Enter");

        expect(seen, "Enter did not commit the active option").toHaveLength(1);
        expect(seen[0]).not.toBe("site-a");
        expect(listbox()).toBeNull();
    });

    it("Escape closes WITHOUT committing", () => {
        const seen: string[] = [];
        mount(<Harness onChange={(v) => seen.push(v)} />);
        act(() => trigger().click());

        key("ArrowDown");
        key("Escape");

        expect(listbox()).toBeNull();
        expect(seen, "Escape committed a value the operator did not choose").toEqual([]);
        expect(trigger().textContent).toContain("Northwind — Riverside Campus");
    });

    it("stays CONTROLLED — it never moves off the value its owner gave it", () => {
        // Rendered uncontrolled-by-parent: onChange is a no-op, so the owner keeps saying "site-a".
        mount(<AlloySelect value="site-a" onChange={() => {}} options={OPTIONS} aria-label="Site" />);
        act(() => trigger().click());
        act(() => options()[PLACEHOLDER_OFFSET + 2]!.click());

        // A component holding private state would now display Hilltop. The owner is the authority.
        expect(trigger().textContent).toContain("Northwind — Riverside Campus");
    });
});
