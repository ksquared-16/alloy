import { describe, expect, it } from "vitest";
import {
    findOrphanOfferingProgramKeys,
    resolveProgramByKey,
    resolveProgramsForLocation,
    resolveProgramsForOrganization,
} from "@/lib/programs/canonicalProgramProvider";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const OTHER_ORG = "org-other";

function setup(seed: Partial<OperationalEnrollmentMockStore>) {
    const store = createOperationalEnrollmentMockStore(seed);
    return createOperationalEnrollmentMockSupabase(store);
}

function vocabulary() {
    return {
        option_sets: [
            { id: "set-canon", org_id: ORG_ID, set_key: "childcare_program_type", label: "Program type" },
            { id: "set-other", org_id: OTHER_ORG, set_key: "childcare_program_type", label: "Program type" },
        ],
        option_set_items: [
            { id: "i-toddler", option_set_id: "set-canon", item_key: "toddler", label: "Toddler", sort_order: 2 },
            { id: "i-infant", option_set_id: "set-canon", item_key: "infant", label: "Infant", sort_order: 1 },
            { id: "i-other", option_set_id: "set-other", item_key: "preschool", label: "Preschool", sort_order: 1 },
        ],
    };
}

describe("resolveProgramsForOrganization — identity vocabulary", () => {
    it("returns canonical vocabulary ordered by sort_order, active", async () => {
        const supabase = setup(vocabulary());
        const programs = await resolveProgramsForOrganization(supabase, ORG_ID);
        expect(programs.map((p) => p.key)).toEqual(["infant", "toddler"]);
        expect(programs.every((p) => p.status === "active" && p.source === "vocabulary")).toBe(true);
    });

    it("does not leak another org's vocabulary", async () => {
        const supabase = setup(vocabulary());
        const programs = await resolveProgramsForOrganization(supabase, ORG_ID);
        expect(programs.some((p) => p.key === "preschool")).toBe(false);
    });

    it("falls back to legacy classroom_age_group when canonical set is empty", async () => {
        const supabase = setup({
            option_sets: [{ id: "set-legacy", org_id: ORG_ID, set_key: "classroom_age_group", label: "Classroom age" }],
            option_set_items: [
                { id: "l-1", option_set_id: "set-legacy", item_key: "infant", label: "Infant (legacy)", sort_order: 1 },
            ],
        });
        const programs = await resolveProgramsForOrganization(supabase, ORG_ID);
        expect(programs.map((p) => p.key)).toEqual(["infant"]);
        expect(programs[0].source).toBe("legacy_classroom_age_group");
    });

    it("legacy fallback can be disabled", async () => {
        const supabase = setup({
            option_sets: [{ id: "set-legacy", org_id: ORG_ID, set_key: "classroom_age_group", label: "Classroom age" }],
            option_set_items: [{ id: "l-1", option_set_id: "set-legacy", item_key: "infant", label: "Infant", sort_order: 1 }],
        });
        expect(await resolveProgramsForOrganization(supabase, ORG_ID, { allowLegacyFallback: false })).toEqual([]);
    });
});

describe("resolveProgramByKey", () => {
    it("resolves a known key and returns null for unknown/empty", async () => {
        const supabase = setup(vocabulary());
        expect((await resolveProgramByKey(supabase, ORG_ID, "toddler"))?.label).toBe("Toddler");
        expect(await resolveProgramByKey(supabase, ORG_ID, "nope")).toBeNull();
        expect(await resolveProgramByKey(supabase, ORG_ID, "  ")).toBeNull();
    });
});

describe("resolveProgramsForLocation — availability", () => {
    const seed = {
        ...vocabulary(),
        location_program_categories: [
            { id: "cat-1", org_id: ORG_ID, location_id: "site-a", key: "infant", label: "Infant", sort_order: 2, is_active: true },
            { id: "cat-2", org_id: ORG_ID, location_id: "site-a", key: "toddler", label: "Toddler", sort_order: 1, is_active: true },
            { id: "cat-3", org_id: ORG_ID, location_id: "site-a", key: "preschool", label: "Preschool", sort_order: 3, is_active: false },
            { id: "cat-4", org_id: ORG_ID, location_id: "site-b", key: "infant", label: "Infant", sort_order: 1, is_active: true },
        ],
    };

    it("returns only the location's active programs, ordered", async () => {
        const supabase = setup(seed);
        const programs = await resolveProgramsForLocation(supabase, ORG_ID, "site-a");
        expect(programs.map((p) => p.key)).toEqual(["toddler", "infant"]);
        expect(programs.every((p) => p.locationId === "site-a" && p.source === "location_availability")).toBe(true);
    });

    it("never returns a program available at a different location", async () => {
        const supabase = setup(seed);
        const programs = await resolveProgramsForLocation(supabase, ORG_ID, "site-a");
        expect(programs.every((p) => p.locationId === "site-a")).toBe(true);
    });

    it("includeInactive surfaces inactive availability", async () => {
        const supabase = setup(seed);
        const programs = await resolveProgramsForLocation(supabase, ORG_ID, "site-a", { includeInactive: true });
        expect(programs.some((p) => p.key === "preschool" && p.status === "inactive")).toBe(true);
    });

    it("empty location id returns nothing", async () => {
        const supabase = setup(seed);
        expect(await resolveProgramsForLocation(supabase, ORG_ID, "")).toEqual([]);
    });
});

describe("findOrphanOfferingProgramKeys — read-only diagnostic", () => {
    it("identifies offering program_keys not in the vocabulary", async () => {
        const supabase = setup({
            ...vocabulary(),
            program_offerings: [
                { id: "o-1", org_id: ORG_ID, program_key: "infant", label: "Full Day", attendance_type: "full_time" },
                { id: "o-2", org_id: ORG_ID, program_key: "ghost_program", label: "Orphan", attendance_type: "full_time" },
            ],
        });
        expect(await findOrphanOfferingProgramKeys(supabase, ORG_ID)).toEqual(["ghost_program"]);
    });
});
