/**
 * The one space-use rule (V7-02a): structure first, then configured uses, with the legacy policy for
 * spaces never configured. Every consumer — Rooms configuration, pickers, the assignment writers —
 * imports these functions, so these cases are the contract.
 */
import { describe, expect, it } from "vitest";

import { validateSpaceUsesConfiguration } from "@/lib/location/validateSpaceUses";
import { assertSpaceEligibleForAssignment } from "@/lib/operationalAssignments/assertSpaceEligible";
import {
    invalidSpaceUsesForRole,
    readSpaceUses,
    readSpaceUsesState,
    schedulableForChildren,
    spaceEligibleForUse,
} from "@/lib/location/spaceUse";
import { roomProgramFit } from "@/lib/scheduling/options/generatePlacementOptions";

const BEFORE_CARE = "cat-before-care";
const ENRICHMENT = "cat-enrichment";
const STAFF = "cat-classroom-staff";
const child = (categoryId: string | null) => ({ categoryId, subjectType: "child" as const });
const staff = (categoryId: string | null) => ({ categoryId, subjectType: "staff" as const });

describe("readSpaceUses: never configured is not the same as configured with none", () => {
    it("absent key → null (legacy, unconfigured)", () => {
        expect(readSpaceUses({ supported_program_keys: ["toddler"] })).toBeNull();
        expect(readSpaceUses(null)).toBeNull();
    });
    it("an empty list is a deliberate configuration", () => {
        expect(readSpaceUses({ space_uses: [] })).toEqual([]);
    });
    it("dedupes and trims", () => {
        expect(readSpaceUses({ space_uses: [" a ", "a", "b"] })).toEqual(["a", "b"]);
    });
});

describe("spaceEligibleForUse — structure", () => {
    it("a physical container is never schedulable, whatever its configuration", () => {
        for (const spaceUses of [null, [BEFORE_CARE]]) {
            expect(spaceEligibleForUse({ unitRole: "physical_space", spaceUses }, child(BEFORE_CARE))).toMatchObject({
                ok: false,
                code: "physical_space_not_schedulable",
            });
        }
    });
    it("staff only in a classroom — a shared space configured for the staff use still refuses", () => {
        expect(spaceEligibleForUse({ unitRole: "shared_space", spaceUses: [STAFF] }, staff(STAFF))).toMatchObject({
            ok: false,
            code: "staff_room_must_be_classroom",
        });
        expect(spaceEligibleForUse({ unitRole: "operational_group", spaceUses: [STAFF] }, staff(STAFF)).ok).toBe(true);
    });
});

describe("spaceEligibleForUse — configured spaces", () => {
    const gym = { unitRole: "shared_space" as const, spaceUses: [ENRICHMENT] };
    it("allows a configured use", () => {
        expect(spaceEligibleForUse(gym, child(ENRICHMENT))).toEqual({ ok: true, legacy: false });
    });
    it("refuses a use the space is not configured for", () => {
        expect(spaceEligibleForUse(gym, child(BEFORE_CARE))).toMatchObject({ ok: false, code: "use_not_configured_for_space" });
    });
    it("a classroom configured with uses refuses others too", () => {
        const toddler2 = { unitRole: "operational_group" as const, spaceUses: [BEFORE_CARE] };
        expect(spaceEligibleForUse(toddler2, child(ENRICHMENT)).ok).toBe(false);
        expect(spaceEligibleForUse(toddler2, child(BEFORE_CARE)).ok).toBe(true);
    });
});

describe("spaceEligibleForUse — legacy (never configured) spaces", () => {
    it("an unconfigured classroom keeps its pre-V7 eligibility, flagged legacy", () => {
        expect(spaceEligibleForUse({ unitRole: "operational_group", spaceUses: null }, child(ENRICHMENT))).toEqual({ ok: true, legacy: true });
    });
    it("an unconfigured shared space is NOT silently allowed for a new schedule", () => {
        expect(spaceEligibleForUse({ unitRole: "shared_space", spaceUses: null }, child(ENRICHMENT))).toMatchObject({
            ok: false,
            code: "space_uses_not_configured",
        });
    });
});

describe("COMPAT-1 — the four stored states stay distinct", () => {
    const classroom = (metadata: Record<string, unknown>) => {
        const state = readSpaceUsesState(metadata);
        return { unitRole: "operational_group" as const, spaceUses: readSpaceUses(metadata), spaceUsesMalformed: state.kind === "malformed" };
    };
    const shared = (metadata: Record<string, unknown>) => ({ ...classroom(metadata), unitRole: "shared_space" as const });

    it("absent → unconfigured: a classroom keeps bounded legacy eligibility, a shared space refuses", () => {
        expect(readSpaceUsesState({})).toEqual({ kind: "unconfigured" });
        expect(spaceEligibleForUse(classroom({}), child(ENRICHMENT))).toEqual({ ok: true, legacy: true });
        expect(spaceEligibleForUse(shared({}), child(ENRICHMENT))).toMatchObject({ ok: false, code: "space_uses_not_configured" });
    });
    it("non-empty list → configured and authoritative", () => {
        expect(readSpaceUsesState({ space_uses: [ENRICHMENT] })).toEqual({ kind: "configured", uses: [ENRICHMENT] });
        expect(spaceEligibleForUse(classroom({ space_uses: [ENRICHMENT] }), child(ENRICHMENT))).toEqual({ ok: true, legacy: false });
        expect(spaceEligibleForUse(classroom({ space_uses: [ENRICHMENT] }), child(BEFORE_CARE))).toMatchObject({ code: "use_not_configured_for_space" });
    });
    it("empty list → configured with no uses: every category-based use refused", () => {
        expect(readSpaceUsesState({ space_uses: [] })).toEqual({ kind: "configured", uses: [] });
        expect(spaceEligibleForUse(classroom({ space_uses: [] }), child(ENRICHMENT))).toMatchObject({ ok: false, code: "use_not_configured_for_space" });
        expect(spaceEligibleForUse(shared({ space_uses: [] }), child(ENRICHMENT))).toMatchObject({ ok: false, code: "use_not_configured_for_space" });
    });
    for (const [label, value] of [["a string", ENRICHMENT], ["an object", { a: 1 }], ["a number", 7], ["a boolean", true], ["null", null]] as const) {
        it(`malformed (${label}) → its own state, fails closed with its own code — distinct from empty`, () => {
            expect(readSpaceUsesState({ space_uses: value })).toEqual({ kind: "malformed", reason: "not_a_list" });
            for (const use of [child(ENRICHMENT), child(null)]) {
                expect(spaceEligibleForUse(classroom({ space_uses: value }), use)).toMatchObject({ ok: false, code: "space_uses_malformed" });
            }
            expect(spaceEligibleForUse(shared({ space_uses: value }), child(ENRICHMENT))).toMatchObject({ ok: false, code: "space_uses_malformed" });
        });
    }
    for (const [label, value] of [["null member", [ENRICHMENT, null]], ["blank member", [ENRICHMENT, " "]], ["number member", [5]], ["object member", [{ id: ENRICHMENT }]]] as const) {
        it(`malformed list member (${label}) → malformed, never dropped or widened`, () => {
            expect(readSpaceUsesState({ space_uses: value })).toEqual({ kind: "malformed", reason: "invalid_member" });
            expect(spaceEligibleForUse(classroom({ space_uses: value }), child(ENRICHMENT))).toMatchObject({ ok: false, code: "space_uses_malformed" });
        });
    }
    it("a malformed space is never offered by a child picker", () => {
        expect(schedulableForChildren([{ id: "m", ...classroom({ space_uses: "x" }) }, { id: "ok", ...classroom({}) }]).map((s) => s.id)).toEqual(["ok"]);
    });
    it("structure is still enforced first: physical and staff-in-shared refusals are unchanged", () => {
        expect(spaceEligibleForUse({ unitRole: "physical_space", spaceUses: null, spaceUsesMalformed: true }, child(ENRICHMENT))).toMatchObject({ code: "physical_space_not_schedulable" });
        expect(spaceEligibleForUse({ ...shared({ space_uses: [STAFF] }) }, staff(STAFF))).toMatchObject({ code: "staff_room_must_be_classroom" });
    });
    it("the write path refuses both malformed forms, each with its own message, before any lookup", async () => {
        const write = (metadata: Record<string, unknown>) =>
            validateSpaceUsesConfiguration(null as never, "org", { locationType: "unit", unitRole: "operational_group", metadata });
        expect(await write({ space_uses: "not-a-list" })).toEqual({
            ok: false,
            message: "Uses must be a list of assignment categories.",
            code: "space_uses_malformed_not_a_list",
        });
        expect(await write({ space_uses: [ENRICHMENT, ""] })).toMatchObject({ ok: false, code: "space_uses_malformed_invalid_member" });
        expect(await write({})).toEqual({ ok: true });
        expect(await write({ space_uses: [] })).toEqual({ ok: true });
    });
});

describe("COMPAT-1 — the server writer reads stored malformed Uses and fails closed", () => {
    // A minimal client: one stored room and, optionally, the assignment being replaced.
    const client = (metadata: unknown, prior: { room_location_id: string; operational_assignment_type_id: string | null } | null = null) =>
        ({
            from: (table: string) => {
                const row = table === "locations" ? { location_type: "unit", unit_role: "operational_group", metadata } : prior;
                const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
                return chain;
            },
        }) as never;
    const args = { orgId: "org", roomLocationId: "room-1", categoryId: ENRICHMENT, subjectType: "child" as const };

    it("a NEW assignment into a stored malformed space is refused with the malformed code", async () => {
        for (const metadata of [{ space_uses: "not-a-list" }, { space_uses: [ENRICHMENT, null] }, { space_uses: null }]) {
            await expect(assertSpaceEligibleForAssignment(client(metadata), args)).rejects.toMatchObject({
                details: { field: "room_location_id", code: "space_uses_malformed" },
            });
        }
    });
    it("an EXISTING assignment kept in its room and use is preserved (grandfathered before the rule)", async () => {
        await expect(
            assertSpaceEligibleForAssignment(client({ space_uses: "not-a-list" }, { room_location_id: "room-1", operational_assignment_type_id: ENRICHMENT }), {
                ...args,
                supersedesAssignmentId: "prior-1",
            }),
        ).resolves.toBeUndefined();
    });
    it("explicit empty refuses with its OWN code, not the malformed one", async () => {
        await expect(assertSpaceEligibleForAssignment(client({ space_uses: [] }), args)).rejects.toMatchObject({
            details: { code: "use_not_configured_for_space" },
        });
        await expect(assertSpaceEligibleForAssignment(client({}), args)).resolves.toBeUndefined();
    });
});

describe("spaceEligibleForUse — the enrollment's own (uncategorized) schedule", () => {
    it("is allowed in any classroom, configured or not — configuring uses never blocks enrollment edits", () => {
        expect(spaceEligibleForUse({ unitRole: "operational_group", spaceUses: [BEFORE_CARE] }, child(null)).ok).toBe(true);
        expect(spaceEligibleForUse({ unitRole: "operational_group", spaceUses: null }, child(null)).ok).toBe(true);
    });
    it("is not allowed outside a classroom", () => {
        expect(spaceEligibleForUse({ unitRole: "shared_space", spaceUses: [ENRICHMENT] }, child(null))).toMatchObject({
            ok: false,
            code: "category_required_for_space",
        });
    });
});

describe("configuration validation uses the same structure", () => {
    const categories = [
        { id: BEFORE_CARE, subjectTypes: ["child"] as const },
        { id: STAFF, subjectTypes: ["staff"] as const },
    ];
    it("physical spaces take no uses", () => {
        expect(invalidSpaceUsesForRole("physical_space", [BEFORE_CARE], categories)).toEqual([
            { id: BEFORE_CARE, reason: "physical_space_has_no_uses" },
        ]);
    });
    it("shared spaces take child uses only", () => {
        expect(invalidSpaceUsesForRole("shared_space", [BEFORE_CARE, STAFF], categories)).toEqual([
            { id: STAFF, reason: "staff_use_needs_classroom" },
        ]);
    });
    it("unknown ids are refused, classrooms take both", () => {
        expect(invalidSpaceUsesForRole("operational_group", [BEFORE_CARE, STAFF, "nope"], categories)).toEqual([
            { id: "nope", reason: "unknown_category" },
        ]);
    });
});

describe("schedulableForChildren — what a child picker may offer before a use narrows it", () => {
    it("classrooms (any), shared spaces only when configured, never physical", () => {
        const spaces = [
            { id: "t1", unitRole: "operational_group" as const, spaceUses: null },
            { id: "gym", unitRole: "shared_space" as const, spaceUses: [ENRICHMENT] },
            { id: "yard", unitRole: "shared_space" as const, spaceUses: null },
            { id: "room1", unitRole: "physical_space" as const, spaceUses: [] },
        ];
        expect(schedulableForChildren(spaces).map((s) => s.id)).toEqual(["t1", "gym"]);
    });
});

describe("program fit reads every supported program, and an unconfigured room is unknown", () => {
    it("a multi-program room fits each of its programs", () => {
        for (const child of ["p-toddler", "p-preschool"]) {
            expect(
                roomProgramFit({ childProgramCategoryId: child, roomProgramCategoryIds: ["p-toddler", "p-preschool"], childAgeGroup: null, roomAgeGroup: null }),
            ).toEqual({ programKnown: true, programMatch: true });
        }
    });
    it("a room listing other programs excludes the child's", () => {
        expect(
            roomProgramFit({ childProgramCategoryId: "p-infant", roomProgramCategoryIds: ["p-toddler"], childAgeGroup: null, roomAgeGroup: null }),
        ).toEqual({ programKnown: true, programMatch: false });
    });
    it("no configured programs and no age signal is UNKNOWN — never a match", () => {
        expect(
            roomProgramFit({ childProgramCategoryId: "p-infant", roomProgramCategoryIds: null, childAgeGroup: null, roomAgeGroup: null }),
        ).toEqual({ programKnown: false, programMatch: false });
    });
});
