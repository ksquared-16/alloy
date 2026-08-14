// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlloySelect, resolveTypeaheadIndex } from "@/components/workspace/AlloySelect";

/**
 * ALLOYSELECT — typeahead.
 *
 * A native `<select>` lets an operator jump by typing. Replacing it with a custom listbox
 * removes that unless it is rebuilt, and on the long configured lists this primitive is
 * meant to serve — statuses, stages, work templates, locations — losing it would trade a
 * keyboard regression for a visual win.
 *
 * The resolver is exported and tested directly because the interesting behaviour is
 * arithmetic (wrap, advance, same-character cycling, skipping) and deserves to be asserted
 * without a DOM in the way. The component tests then prove it is actually wired.
 *
 * Deliberate deviation from native, documented in the component: typing while CLOSED opens
 * the list and highlights, rather than silently committing a new value. A control that
 * commits something the operator never saw is the accidental-mutation shape this runtime
 * is trying to remove.
 */

const OPTIONS = [
    { value: "ap", label: "Apple" },
    { value: "av", label: "Avocado" },
    { value: "ba", label: "Banana" },
    { value: "bl", label: "Blueberry" },
    { value: "ch", label: "Cherry" },
];

describe("typeahead resolver", () => {
    it("single character jumps to the first match", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "b", 0)).toBe(2);
    });

    it("a multi-character prefix narrows", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "bl", 0)).toBe(3);
        expect(resolveTypeaheadIndex(OPTIONS, "av", 0)).toBe(1);
    });

    it("repeating one character cycles matches instead of searching for that literal", () => {
        // "aa" is not a label prefix anywhere; native selects treat it as "next A".
        expect(resolveTypeaheadIndex(OPTIONS, "a", 0)).toBe(0);
        expect(resolveTypeaheadIndex(OPTIONS, "aa", 0)).toBe(1);
        expect(resolveTypeaheadIndex(OPTIONS, "aaa", 1)).toBe(0);
    });

    it("wraps around the end of the list", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "a", 4)).toBe(0);
        expect(resolveTypeaheadIndex(OPTIONS, "cc", 4)).toBe(4);
    });

    it("skips disabled options", () => {
        const withDisabled = [
            { value: "ap", label: "Apple", disabled: true },
            { value: "av", label: "Avocado" },
            { value: "ba", label: "Banana" },
        ];
        expect(resolveTypeaheadIndex(withDisabled, "a", 0)).toBe(1);
    });

    it("returns -1 when nothing matches, so the operator is not moved", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "z", 2)).toBe(-1);
        expect(resolveTypeaheadIndex(OPTIONS, "", 2)).toBe(-1);
    });

    it("is case-insensitive", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "CHE", 0)).toBe(4);
    });

    it("searches from the current position, so the same key walks forward", () => {
        expect(resolveTypeaheadIndex(OPTIONS, "b", 2)).toBe(2);
        expect(resolveTypeaheadIndex(OPTIONS, "bb", 2)).toBe(3);
    });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
});

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
});

function mount(props: Partial<React.ComponentProps<typeof AlloySelect>> = {}) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
        root!.render(
            <AlloySelect
                value=""
                onChange={props.onChange ?? (() => {})}
                options={props.options ?? OPTIONS}
                allowEmpty={false}
                aria-label="Fruit"
                {...props}
            />,
        ),
    );
    return host;
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Fruit"]')!;
const listbox = () => document.querySelector<HTMLElement>("[role=listbox]");
const options = () => Array.from(document.querySelectorAll<HTMLElement>("[role=option]"));
const activeIdx = () =>
    Number((listbox()?.getAttribute("aria-activedescendant") ?? "").split("-opt-").pop() ?? -1);

function typeOnActive(char: string) {
    act(() => {
        options()[activeIdx()]!.dispatchEvent(
            new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }),
        );
    });
}

describe("AlloySelect — typeahead wiring", () => {
    it("typing on the CLOSED trigger opens the list and highlights, it does not commit", () => {
        const seen: string[] = [];
        mount({ onChange: (v) => seen.push(v) });
        act(() => {
            trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true }));
        });
        expect(listbox()).not.toBeNull();
        expect(options()[activeIdx()]!.textContent).toBe("Cherry");
        expect(seen).toEqual([]);
    });

    it("composes a prefix while typing quickly", () => {
        mount();
        act(() => trigger().click());
        typeOnActive("b");
        expect(options()[activeIdx()]!.textContent).toBe("Banana");
        vi.advanceTimersByTime(100);
        typeOnActive("l");
        expect(options()[activeIdx()]!.textContent).toBe("Blueberry");
    });

    it("resets the buffer after the timeout, so a later key starts fresh", () => {
        mount();
        act(() => trigger().click());
        typeOnActive("b");
        expect(options()[activeIdx()]!.textContent).toBe("Banana");

        vi.advanceTimersByTime(600);
        typeOnActive("c");
        // A fresh "c", not the prefix "bc" — which would have matched nothing and not moved.
        expect(options()[activeIdx()]!.textContent).toBe("Cherry");
    });

    it("a non-match leaves the operator where they were", () => {
        mount();
        act(() => trigger().click());
        typeOnActive("c");
        const before = activeIdx();
        vi.advanceTimersByTime(600);
        typeOnActive("z");
        expect(activeIdx()).toBe(before);
    });

    it("Enter still commits the option typeahead landed on", () => {
        const seen: string[] = [];
        mount({ onChange: (v) => seen.push(v) });
        act(() => trigger().click());
        typeOnActive("b");
        vi.advanceTimersByTime(100);
        typeOnActive("l");
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
        });
        expect(seen).toEqual(["bl"]);
    });

    it("Escape still closes without committing after typing", () => {
        const seen: string[] = [];
        mount({ onChange: (v) => seen.push(v) });
        act(() => trigger().click());
        typeOnActive("b");
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
            );
        });
        expect(listbox()).toBeNull();
        expect(seen).toEqual([]);
    });

    it("space is not typeahead — it stays a selection key", () => {
        const seen: string[] = [];
        mount({ onChange: (v) => seen.push(v), value: "ba" });
        act(() => trigger().click());
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
            );
        });
        expect(seen).toEqual(["ba"]);
    });

    it("modified keys are ignored, so shortcuts still reach the page", () => {
        mount();
        act(() => trigger().click());
        const before = activeIdx();
        act(() => {
            options()[before]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }),
            );
        });
        expect(activeIdx()).toBe(before);
    });

    it("opens on the current selection, so typeahead starts where the operator is", () => {
        mount({ value: "ba" });
        act(() => trigger().click());
        expect(options()[activeIdx()]!.textContent).toBe("Banana");
    });

    it("stays responsive on a long configured list", () => {
        const many = Array.from({ length: 800 }, (_, i) => ({
            value: `v${i}`,
            label: `${String.fromCharCode(97 + (i % 26))}-option-${i}`,
        }));
        mount({ options: many });
        act(() => trigger().click());
        typeOnActive("z");
        // 800 entries resolve without special-casing; the scan is one pass, no network.
        expect(options()[activeIdx()]!.textContent).toContain("z-option-");
    });
});

describe("AlloySelect — disabled options", () => {
    const withDisabled = [
        { value: "ap", label: "Apple" },
        { value: "av", label: "Avocado", disabled: true },
        { value: "ba", label: "Banana" },
    ];

    it("marks them for assistive tech", () => {
        mount({ options: withDisabled });
        act(() => trigger().click());
        expect(options()[1]!.getAttribute("aria-disabled")).toBe("true");
        expect(options()[0]!.getAttribute("aria-disabled")).toBeNull();
    });

    it("cannot be committed by pointer", () => {
        const seen: string[] = [];
        mount({ options: withDisabled, onChange: (v) => seen.push(v) });
        act(() => trigger().click());
        act(() => options()[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(seen).toEqual([]);
    });

    it("arrows step over them", () => {
        mount({ options: withDisabled });
        act(() => trigger().click());
        expect(activeIdx()).toBe(0);
        typeOnActiveKey("ArrowDown");
        expect(options()[activeIdx()]!.textContent).toBe("Banana");
    });

    function typeOnActiveKey(key: string) {
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
            );
        });
    }
});
