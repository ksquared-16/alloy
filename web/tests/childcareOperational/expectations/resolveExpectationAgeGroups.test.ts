import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";

type Result = { data: unknown; error: { message: string } | null };

/** Minimal chainable Supabase query-builder mock keyed by table. */
function makeSupabase(resultsByTable: Record<string, Result>): SupabaseClient {
    const builder = (result: Result) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "contains", "order"]) {
            b[m] = () => b;
        }
        b.maybeSingle = () => Promise.resolve(result);
        b.single = () => Promise.resolve(result);
        b.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        return b;
    };
    return {
        from: (table: string) => builder(resultsByTable[table] ?? { data: [], error: null }),
    } as unknown as SupabaseClient;
}

describe("loadExpectationAgeGroups", () => {
    it("resolves program category id -> stable key (child placement-derived)", async () => {
        const supabase = makeSupabase({
            location_program_categories: {
                data: [
                    { id: "prog-1", key: "infant" },
                    { id: "prog-2", key: "toddler" },
                ],
                error: null,
            },
        });
        const maps = await loadExpectationAgeGroups(supabase, "org-1", {
            programCategoryIds: ["prog-1", "prog-2"],
            roomLocationIds: [],
        });
        expect(maps.ageGroupByProgramCategoryId).toEqual({ "prog-1": "infant", "prog-2": "toddler" });
        expect(maps.ageGroupByRoomLocationId).toEqual({});
    });

    it("resolves room classroom band from location field_values", async () => {
        const supabase = makeSupabase({
            field_definitions: { data: [{ id: "def-1", field_key: "classroom_age_group" }], error: null },
            field_values: {
                data: [{ entity_id: "room-1", field_definition_id: "def-1", value_text: "preschool" }],
                error: null,
            },
        });
        const maps = await loadExpectationAgeGroups(supabase, "org-1", {
            programCategoryIds: [],
            roomLocationIds: ["room-1"],
        });
        expect(maps.ageGroupByRoomLocationId).toEqual({ "room-1": "preschool" });
    });

    it("prefers classroom_age_group over childcare_program_type for the same room", async () => {
        const supabase = makeSupabase({
            field_definitions: {
                data: [
                    { id: "def-cag", field_key: "classroom_age_group" },
                    { id: "def-cpt", field_key: "childcare_program_type" },
                ],
                error: null,
            },
            field_values: {
                data: [
                    { entity_id: "room-1", field_definition_id: "def-cpt", value_text: "toddler" },
                    { entity_id: "room-1", field_definition_id: "def-cag", value_text: "infant" },
                ],
                error: null,
            },
        });
        const maps = await loadExpectationAgeGroups(supabase, "org-1", {
            programCategoryIds: [],
            roomLocationIds: ["room-1"],
        });
        expect(maps.ageGroupByRoomLocationId).toEqual({ "room-1": "infant" });
    });

    it("returns empty maps without crashing when nothing is configured", async () => {
        const supabase = makeSupabase({});
        const maps = await loadExpectationAgeGroups(supabase, "org-1", {
            programCategoryIds: ["prog-x"],
            roomLocationIds: ["room-x"],
        });
        expect(maps.ageGroupByProgramCategoryId).toEqual({});
        expect(maps.ageGroupByRoomLocationId).toEqual({});
    });
});
