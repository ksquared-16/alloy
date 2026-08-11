import { describe, expect, it } from "vitest";

import {
    WORK_VIEW_OWNED_KEYS_FOR_TEST,
    parseWorkViewRow,
} from "@/lib/lifecycle/workViewsConfigV1";
import { unknownFieldsOf } from "@/lib/config/preserveUnknownFields";

/**
 * A key the work-view parser READS but does not declare as owned is captured as
 * "residue" — and the residue carrier is an ENUMERABLE SYMBOL.
 *
 * That has a failure mode far out of proportion to the omission: a symbol property
 * makes the object unserializable across the React Server Component boundary, so
 * `/workspace/work-unit/:slug` rendered a BLANK surface on every client navigation
 * while a cold full-page load of the same URL rendered perfectly — only the client
 * transition re-serializes the props. `row_grain_v1` was the missing key, and every
 * work view in the reference tenant declares one.
 *
 * These tests derive the expectation from what the parser actually stores rather
 * than restating the list, so the next field added to the parser cannot reintroduce
 * it by being forgotten here.
 */

/** Every field the parser can store, with a value it will accept. */
const FULLY_POPULATED_WORK_VIEW = {
    id: "new_leads",
    label: "New Leads",
    mission: "Respond to every new family inquiry before it goes cold.",
    match: "any",
    filters_v1: [{ field_key: "status_key", operator: "in", values: ["open"] }],
    sort_v1: { field_key: "updated_at", direction: "desc" },
    sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
    visible_in_runtime: true,
    display_order: 1,
    row_grain_v1: "family",
    queue_layout_id: "queue-layout-1",
    focus_panel_layout_id: "focus-layout-1",
    compat_queue_key: "new_leads",
};

describe("work view owned keys are complete", () => {
    it("every key the parser stores is declared owned", () => {
        const parsed = parseWorkViewRow(FULLY_POPULATED_WORK_VIEW);
        expect(parsed).toBeTruthy();

        const undeclared = Object.keys(parsed!).filter(
            (key) => !WORK_VIEW_OWNED_KEYS_FOR_TEST.includes(key)
        );
        expect(undeclared).toEqual([]);
    });

    it("a fully populated work view carries NO residue symbol", () => {
        const parsed = parseWorkViewRow(FULLY_POPULATED_WORK_VIEW);
        // The symbol is what breaks RSC serialization. Nothing the parser understands
        // may produce one.
        expect(unknownFieldsOf(parsed)).toBeUndefined();
        expect(Object.getOwnPropertySymbols(parsed!)).toEqual([]);
    });

    it("a declared row grain specifically produces no residue", () => {
        // The exact regression: `row_grain_v1` was parsed AND captured as residue, so
        // every grain-declaring view was unserializable.
        const parsed = parseWorkViewRow({
            id: "all_work",
            label: "All Work",
            row_grain_v1: "family",
        });
        expect(parsed!.row_grain_v1).toBe("family");
        expect(Object.getOwnPropertySymbols(parsed!)).toEqual([]);
    });

    it("an UNRECOGNISED row grain shape is still preserved as residue", () => {
        // The other half of the fix. A newer writer may author `row_grain_v1` in a shape
        // this parser does not understand; owning the key unconditionally would delete it
        // on the next read-modify-write — the exact way this field was wiped before.
        const parsed = parseWorkViewRow({
            id: "child_lens",
            label: "Children",
            row_grain_v1: { grain: "child", subject: "child" },
        });
        expect(parsed!.row_grain_v1).toBeUndefined();
        expect(unknownFieldsOf(parsed)).toEqual({ row_grain_v1: { grain: "child", subject: "child" } });
    });

    it("a genuinely unknown field IS still preserved as residue", () => {
        // The lossless-round-trip guarantee must survive the fix: this is what stops
        // an older writer destroying a newer writer's fields.
        const parsed = parseWorkViewRow({
            id: "all_work",
            label: "All Work",
            some_future_field_v2: { kept: true },
        });
        expect(unknownFieldsOf(parsed)).toEqual({ some_future_field_v2: { kept: true } });
    });
});
