// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AlloySelect } from "@/components/workspace/AlloySelect";

/**
 * ALLOYSELECT — capabilities added so the primitive can serve the configuration plane.
 *
 * Wave 1 converted a Settings surface (Lifecycle stage outcome behaviour) off raw
 * `<select>`. Three of its ten controls are REQUIRED — a schedule mode, an offset unit,
 * an anchor — and had no empty `<option>` at all. The primitive always prepended a
 * placeholder entry, so a straight conversion would have handed operators a way to
 * select "nothing" on a field that must always hold a value. That is a behaviour change
 * smuggled in by a refactor, which is exactly what a shared primitive must not force.
 *
 * `allowEmpty={false}` is the fix, and it belongs to the primitive rather than to the
 * page — otherwise every required field in the remaining 427 call sites grows its own
 * local wrapper.
 *
 * `density="compact"` is the same argument for size: configuration forms set an 11px
 * scale, the primitive imposed 12px chrome, and a call site cannot restyle the trigger
 * because `className` lands on the root element.
 */

const OPTIONS = [
    { value: "immediate", label: "Immediately" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

function mount(ui: React.ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(ui));
    return host;
}

function Harness({
    allowEmpty,
    initial = "before",
    options = OPTIONS,
    onChange,
}: {
    allowEmpty?: boolean;
    initial?: string;
    options?: readonly { value: string; label: string }[];
    onChange?: (v: string) => void;
}) {
    const [value, setValue] = useState(initial);
    return (
        <AlloySelect
            value={value}
            onChange={(v) => {
                setValue(v);
                onChange?.(v);
            }}
            options={options}
            allowEmpty={allowEmpty}
            placeholder="Select timing…"
            aria-label="Timing"
        />
    );
}

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Timing"]')!;
const options = () => Array.from(document.querySelectorAll<HTMLElement>("[role=option]"));
const open = () => act(() => trigger().click());

describe("AlloySelect — required fields (allowEmpty)", () => {
    it("offers the empty choice by default, so existing adopters are unchanged", () => {
        mount(<Harness />);
        open();
        expect(options().map((o) => o.textContent)).toEqual([
            "Select timing…",
            "Immediately",
            "Before",
            "After",
        ]);
    });

    it("omits the empty choice when the field is required", () => {
        mount(<Harness allowEmpty={false} />);
        open();
        expect(options().map((o) => o.textContent)).toEqual(["Immediately", "Before", "After"]);
    });

    it("gives a required field no way to reach the empty value by keyboard", () => {
        // Home lands on the FIRST entry. With allowEmpty that is the placeholder; without
        // it, the first real option — so arrowing to the top can never clear a required field.
        mount(<Harness allowEmpty={false} initial="after" />);
        open();
        const list = document.querySelector<HTMLElement>("[role=listbox]")!;
        const activeIdx = () =>
            Number((list.getAttribute("aria-activedescendant") ?? "").split("-opt-").pop() ?? -1);
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
            );
        });
        act(() => {
            options()[activeIdx()]!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
        });
        expect(trigger().textContent).toContain("Immediately");
        expect(trigger().textContent).not.toContain("Select timing…");
    });

    it("still reads the placeholder while a required field has no value yet", () => {
        // Dependent options (e.g. closed statuses resolved by a parent) arrive late. The
        // trigger must say something meaningful in the meantime, not render blank.
        mount(<Harness allowEmpty={false} initial="" options={[]} />);
        expect(trigger().textContent).toContain("Select timing…");
    });

    it("commits a real option in a required field", () => {
        const seen: string[] = [];
        mount(<Harness allowEmpty={false} onChange={(v) => seen.push(v)} />);
        open();
        act(() => options()[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(seen).toEqual(["after"]);
        expect(trigger().textContent).toContain("After");
    });
});

describe("AlloySelect — density", () => {
    it("carries no density modifier by default", () => {
        mount(<Harness />);
        expect(host!.querySelector(".alloy-select")!.className).not.toContain("alloy-select--compact");
    });

    it("marks the compact variant so configuration forms keep their own scale", () => {
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        act(() =>
            root!.render(
                <AlloySelect
                    value="before"
                    onChange={() => {}}
                    options={OPTIONS}
                    density="compact"
                    aria-label="Timing"
                />,
            ),
        );
        expect(host.querySelector(".alloy-select")!.className).toContain("alloy-select--compact");
    });
});
