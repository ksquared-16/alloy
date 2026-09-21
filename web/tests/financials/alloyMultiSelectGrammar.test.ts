/**
 * The multi-select rule, locked where it is decided.
 *
 * `resolveMultiSelection` is pure and exported precisely so these can be asserted without mounting
 * a listbox — a test that had to render React to discover that Household cannot coexist with a
 * child would be testing React, not the rule. The rule is the thing that must not drift: it is
 * what stops the surface that commits money from billing an account and two of its children for
 * the same thing.
 */
import { describe, expect, it } from "vitest";

import {
    resolveMultiSelection,
    summariseMultiSelection,
    type AlloyMultiSelectOption,
} from "@/components/workspace/AlloySelect";

const HOUSEHOLD = "__household__";
const OPTIONS: AlloyMultiSelectOption[] = [
    { value: HOUSEHOLD, label: "Household", exclusive: true },
    { value: "child-a", label: "Certa Certhouse" },
    { value: "child-b", label: "Certb Certhouse" },
    { value: "child-c", label: "Certc Certhouse", disabled: true },
];

describe("exclusivity is a property of the option, not of the surface", () => {
    it("choosing Household replaces every child selection", () => {
        expect(resolveMultiSelection(OPTIONS, ["child-a", "child-b"], HOUSEHOLD)).toEqual([HOUSEHOLD]);
    });

    it("choosing a child evicts Household", () => {
        expect(resolveMultiSelection(OPTIONS, [HOUSEHOLD], "child-a")).toEqual(["child-a"]);
    });

    it("children accumulate", () => {
        expect(resolveMultiSelection(OPTIONS, ["child-a"], "child-b")).toEqual(["child-a", "child-b"]);
    });

    it("each child appears at most once however often it is toggled on", () => {
        let v = resolveMultiSelection(OPTIONS, [], "child-a");
        v = resolveMultiSelection(OPTIONS, v, "child-b");
        expect(v.filter((x) => x === "child-a")).toHaveLength(1);
        expect(new Set(v).size).toBe(v.length);
    });

    it("selection follows the options' own order, not the click order", () => {
        const clickedBackwards = resolveMultiSelection(OPTIONS, ["child-b"], "child-a");
        expect(clickedBackwards).toEqual(["child-a", "child-b"]);
    });
});

describe("an empty selection is empty — never everyone", () => {
    it("turning off the last child yields nothing, not Household", () => {
        expect(resolveMultiSelection(OPTIONS, ["child-a"], "child-a")).toEqual([]);
    });

    it("turning off Household yields nothing, not every child", () => {
        expect(resolveMultiSelection(OPTIONS, [HOUSEHOLD], HOUSEHOLD)).toEqual([]);
    });

    it("the empty summary is empty, so the trigger shows its placeholder", () => {
        expect(summariseMultiSelection(OPTIONS, [])).toBe("");
    });
});

describe("a disabled option is not a destination", () => {
    it("cannot be selected", () => {
        expect(resolveMultiSelection(OPTIONS, ["child-a"], "child-c")).toEqual(["child-a"]);
    });

    it("an unknown value changes nothing", () => {
        expect(resolveMultiSelection(OPTIONS, ["child-a"], "nobody")).toEqual(["child-a"]);
    });
});

describe("the trigger says WHO while it can", () => {
    it("names the selection at small counts", () => {
        expect(summariseMultiSelection(OPTIONS, ["child-a", "child-b"])).toBe(
            "Certa Certhouse, Certb Certhouse",
        );
    });

    it("falls back to a count only once names would be useless", () => {
        const many: AlloyMultiSelectOption[] = Array.from({ length: 6 }, (_, i) => ({
            value: `c${i}`,
            label: `Child ${i}`,
        }));
        expect(summariseMultiSelection(many, many.map((m) => m.value))).toBe("6 selected");
    });

    it("names Household explicitly rather than describing it as a count", () => {
        expect(summariseMultiSelection(OPTIONS, [HOUSEHOLD])).toBe("Household");
    });
});
