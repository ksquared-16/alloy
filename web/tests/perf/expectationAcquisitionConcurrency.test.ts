/**
 * P0-7.6 PART 7 — THE EXPECTATION READS THAT DO NOT DEPEND ON EACH OTHER MUST NOT BE SERIALISED.
 *
 * Measured on deployed 680e5765 with a pinned full-attendance specimen and 21 cold samples:
 * `attendance_fold` bound the provisioning frame in 21 of 21, and its `expectations` phase was a
 * six-deep serial chain of round trips. Two of those levels were independent reads awaited one
 * after the other.
 *
 * A wall-clock assertion is the only thing that catches this. `await a; await b` over promises
 * that were ALREADY created is still concurrent, so a source-shape guard would pass on the broken
 * arrangement as readily as the fixed one — which is why this measures instead.
 */
import { describe, expect, it } from "vitest";

import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";

const DELAY = 60;

type Call = { table: string; start: number; end: number };

/**
 * A chainable PostgREST double. Every filter returns `this`; awaiting it resolves after `DELAY`,
 * so overlapping reads finish in ~DELAY and serialised ones in ~n*DELAY.
 */
function fakeSupabase(rowsByTable: Record<string, Record<string, unknown>[]>, calls: Call[]) {
    const make = (table: string) => {
        const start = Date.now();
        const builder: Record<string, unknown> = {};
        for (const op of ["select", "eq", "in", "neq", "not", "order", "limit"]) {
            builder[op] = () => builder;
        }
        builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            new Promise((r) => setTimeout(r, DELAY))
                .then(() => {
                    calls.push({ table, start, end: Date.now() });
                    return { data: rowsByTable[table] ?? [], error: null };
                })
                .then(resolve, reject);
        return builder;
    };
    return { from: (table: string) => make(table) } as never;
}

describe("age-group resolution issues its independent reads concurrently", () => {
    const rows = {
        location_program_categories: [{ id: "prog-1", key: "toddler" }],
        field_definitions: [{ id: "def-1", field_key: "classroom_age_group" }],
        field_values: [{ entity_id: "room-1", field_definition_id: "def-1", value_text: "infant" }],
    };

    it("still returns the same answer", async () => {
        const calls: Call[] = [];
        const out = await loadExpectationAgeGroups(fakeSupabase(rows, calls), "org-1", {
            programCategoryIds: ["prog-1"],
            roomLocationIds: ["room-1"],
        });
        expect(out.ageGroupByProgramCategoryId).toEqual({ "prog-1": "toddler" });
        expect(out.ageGroupByRoomLocationId).toEqual({ "room-1": "infant" });
    });

    it("overlaps the program-category read with the room read", async () => {
        const calls: Call[] = [];
        const t0 = Date.now();
        await loadExpectationAgeGroups(fakeSupabase(rows, calls), "org-1", {
            programCategoryIds: ["prog-1"],
            roomLocationIds: ["room-1"],
        });
        const wall = Date.now() - t0;

        // field_values genuinely depends on field_definitions, so the floor is two levels deep.
        // Serialising the program-category read on top of that would make it three.
        expect(calls.map((c) => c.table).sort()).toEqual(
            ["field_definitions", "field_values", "location_program_categories"].sort(),
        );
        expect(wall, `expected ~2 levels (~${2 * DELAY}ms), got ${wall}ms — reads look serialised`)
            .toBeLessThan(3 * DELAY - 10);

        const pc = calls.find((c) => c.table === "location_program_categories")!;
        const defs = calls.find((c) => c.table === "field_definitions")!;
        const overlap = Math.min(pc.end, defs.end) - Math.max(pc.start, defs.start);
        expect(overlap, "the two independent reads must be in flight at the same time")
            .toBeGreaterThan(0);
    });

    it("a branch with nothing to ask does not cost a round trip", async () => {
        const calls: Call[] = [];
        const t0 = Date.now();
        const out = await loadExpectationAgeGroups(fakeSupabase(rows, calls), "org-1", {
            programCategoryIds: [],
            roomLocationIds: ["room-1"],
        });
        expect(Date.now() - t0).toBeLessThan(3 * DELAY - 10);
        expect(calls.some((c) => c.table === "location_program_categories")).toBe(false);
        expect(out.ageGroupByProgramCategoryId).toEqual({});
    });

    it("surfaces a read failure rather than swallowing it", async () => {
        const failing = {
            from: () => {
                const b: Record<string, unknown> = {};
                for (const op of ["select", "eq", "in"]) b[op] = () => b;
                b.then = (res: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
                return b;
            },
        } as never;
        await expect(
            loadExpectationAgeGroups(failing, "org-1", {
                programCategoryIds: ["prog-1"],
                roomLocationIds: ["room-1"],
            }),
        ).rejects.toThrow(/boom/);
    });
});
