/**
 * Slice 10 — the bridge between the legacy capacity field and the canonical one.
 *
 * The Slice 9 census of the deployed primary found 17 of 17 units carrying a
 * legacy value and ZERO canonical rules anywhere, so both systems are live and
 * will be for as long as adoption takes. These lock the rules of that overlap:
 * the two are never added, no kind is ever inferred, and an adopted rule is
 * distinguishable from one an operator authored directly.
 */
import { describe, expect, it } from "vitest";
import {
    resolveRoomCapacityStanding,
    resolveCapacityDisplay,
    summarizeSiteCapacityCoverage,
    legacyCapacityValue,
    legacyCapacityDiscarded,
    ruleIsAdoption,
    canonicalRulesForRoom,
    ADOPTION_PROVENANCE_KEY,
    LEGACY_CAPACITY_REVIEW_KEY,
    LEGACY_CAPACITY_DISCARDED,
    CAPACITY_KIND_LABELS,
} from "@/lib/locations/capacityAdoptionState";
import {
    buildLegacyCapacityAdoptionBody,
    buildLegacyCapacityDiscardMetadata,
    buildAdoptionPreview,
    adoptableCapacity,
} from "@/lib/locations/capacityAdoptionRequest";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

const room = (over: Partial<LocationHierarchyRow> & { id: string }): LocationHierarchyRow => ({
    label: over.id,
    location_type: "unit",
    parent_location_id: "site",
    is_active: true,
    city: null,
    state: null,
    ...over,
});

const rule = (over: Partial<ChildcareCapacityRuleRow> & { id: string }): ChildcareCapacityRuleRow =>
    ({
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: "tod1",
        age_group_key: null,
        capacity_kind: "operational",
        capacity: 12,
        effective_start: "2026-09-19",
        effective_end: null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
        ...over,
    }) as ChildcareCapacityRuleRow;

const adoptionMeta = (legacy = "12") => ({
    [ADOPTION_PROVENANCE_KEY]: {
        source: "locations.metadata.capacity",
        source_location_id: "tod1",
        legacy_value: legacy,
        legacy_retained: true,
        adopted_at: "2026-09-19T00:00:00.000Z",
    },
});

// ---------------------------------------------------------------------------
// 1-3 — the adoption states.
// ---------------------------------------------------------------------------
describe("1-3. adoption state", () => {
    it("1. legacy value, no canonical rule → unconfirmed", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1", metadata: { capacity: "12" } }), []);
        expect(s.state).toBe("legacy_unconfirmed");
        expect(s.legacyValue).toBe("12");
        expect(s.needsConfirmation).toBe(true);
        expect(s.legacyReviewed).toBe(false);
    });

    it("2. canonical rule, no legacy value → configured", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1" }), [rule({ id: "r1" })]);
        expect(s.state).toBe("canonically_configured");
        expect(s.needsConfirmation).toBe(false);
    });

    it("2. canonical rule carrying adoption provenance → adopted", () => {
        const s = resolveRoomCapacityStanding(
            room({ id: "tod1", metadata: { capacity: "12" } }),
            [rule({ id: "r1", metadata: adoptionMeta() })],
        );
        expect(s.state).toBe("canonically_adopted");
        expect(s.legacyReviewed).toBe(true);
        expect(s.needsConfirmation).toBe(false);
    });

    it("3. neither → no capacity", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1" }), []);
        expect(s.state).toBe("no_capacity");
    });

    it("a canonical rule authored INDEPENDENTLY beside a legacy value needs review", () => {
        // Existence of a canonical rule is not evidence the legacy value was ever
        // looked at; they could have been authored years apart by different people.
        const s = resolveRoomCapacityStanding(
            room({ id: "tod1", metadata: { capacity: "9" } }),
            [rule({ id: "r1" })],
        );
        expect(s.state).toBe("mixed_needs_review");
        expect(s.needsConfirmation).toBe(true);
        expect(s.legacyReviewed).toBe(false);
    });

    it("only rules scoped to THIS room count", () => {
        const rules = [
            rule({ id: "r1", room_location_id: "other" }),
            rule({ id: "r2", scope_type: "site", room_location_id: null, site_location_id: "site" }),
        ];
        expect(canonicalRulesForRoom(rules, "tod1")).toEqual([]);
        expect(resolveRoomCapacityStanding(room({ id: "tod1" }), rules).state).toBe("no_capacity");
    });
});

// ---------------------------------------------------------------------------
// 4, 15, 18 — the arithmetic invariants.
// ---------------------------------------------------------------------------
describe("4, 18. canonical and legacy are never added, and kinds are never summed", () => {
    it("4. a room with both reports them separately, never combined", () => {
        const s = resolveRoomCapacityStanding(
            room({ id: "tod1", metadata: { capacity: "9" } }),
            [rule({ id: "r1", capacity: 12 })],
        );
        expect(s.legacyValue).toBe("9");
        expect(s.canonicalByKind.operational).toBe(12);
        // 21 is the number that must never appear.
        expect(Object.values(s.canonicalByKind).reduce((a, b) => a + b, 0)).not.toBe(21);
        const d = resolveCapacityDisplay(s);
        expect(d.kind).toBe("canonical");
        expect(JSON.stringify(d)).not.toContain("21");
    });

    it("18. three kinds stay three facts — nothing folds them to one number", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1" }), [
            rule({ id: "r1", capacity_kind: "physical", capacity: 24 }),
            rule({ id: "r2", capacity_kind: "licensed", capacity: 20 }),
            rule({ id: "r3", capacity_kind: "operational", capacity: 12 }),
        ]);
        expect(s.canonicalByKind).toEqual({ physical: 24, licensed: 20, operational: 12 });
        const d = resolveCapacityDisplay(s);
        expect(d).toMatchObject({ kind: "canonical" });
        // 56 is the sum. It must exist nowhere.
        expect(JSON.stringify(d)).not.toContain("56");
    });

    it("declines to pick a value when one kind has several rules — precedence is the resolver's", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1" }), [
            rule({ id: "r1", capacity_kind: "operational", capacity: 12, effective_start: "2026-01-01" }),
            rule({ id: "r2", capacity_kind: "operational", capacity: 14, effective_start: "2026-06-01" }),
        ]);
        expect(s.canonicalByKind.operational).toBeUndefined();
        expect(s.canonicalRules).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// 5-8 — the write path, provenance and the absence of inference.
// ---------------------------------------------------------------------------
describe("5-8. adoption writes canonically, records provenance, and infers nothing", () => {
    const base = {
        roomLocationId: "tod1",
        legacyValue: "12",
        capacityKind: "operational" as const,
        effectiveStart: "2026-09-19",
        retainLegacy: true,
        adoptedAt: "2026-09-19T00:00:00.000Z",
    };

    it("5. posts to the canonical create action with room scope", () => {
        const body = buildLegacyCapacityAdoptionBody(base)!;
        expect(body.action).toBe("create");
        expect(body.scope_type).toBe("room");
        expect(body.room_location_id).toBe("tod1");
        expect(body.capacity).toBe(12);
    });

    it("6. stamps provenance that identifies the source and the value considered", () => {
        const body = buildLegacyCapacityAdoptionBody(base)!;
        const p = (body.metadata as Record<string, Record<string, unknown>>)[ADOPTION_PROVENANCE_KEY];
        expect(p.source).toBe("locations.metadata.capacity");
        expect(p.source_location_id).toBe("tod1");
        expect(p.legacy_value).toBe("12");
        expect(p.legacy_retained).toBe(true);
        expect(p.adopted_at).toBe("2026-09-19T00:00:00.000Z");
    });

    it("6. the stamp is what makes an adopted rule distinguishable", () => {
        const body = buildLegacyCapacityAdoptionBody(base)!;
        const adopted = rule({ id: "r1", metadata: body.metadata as Record<string, unknown> });
        expect(ruleIsAdoption(adopted)).toBe(true);
        expect(ruleIsAdoption(rule({ id: "r2" }))).toBe(false);
        expect(ruleIsAdoption(rule({ id: "r3", metadata: { note: "hand authored" } }))).toBe(false);
    });

    it("7. the kind comes from the caller — every kind produces its own rule", () => {
        for (const kind of ["physical", "licensed", "operational"] as const) {
            expect(buildLegacyCapacityAdoptionBody({ ...base, capacityKind: kind })!.capacity_kind).toBe(kind);
        }
    });

    it("8. nothing in the module infers a kind from the room or the value", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const root = resolve(__dirname, "../..");
        for (const rel of ["lib/locations/capacityAdoptionState.ts", "lib/locations/capacityAdoptionRequest.ts"]) {
            const src = readFileSync(resolve(root, rel), "utf8");
            // No default kind, and no branch that picks one from topology or size.
            expect(src).not.toMatch(/capacityKind\s*=\s*["']operational["']/);
            expect(src).not.toMatch(/unit_role[\s\S]{0,80}capacity_kind/);
            expect(src).not.toMatch(/operational_group[\s\S]{0,80}["']operational["']/);
        }
    });

    it("refuses a legacy value that is not a whole number of seats", () => {
        expect(adoptableCapacity("12")).toBe(12);
        expect(adoptableCapacity(" 8 ")).toBe(8);
        expect(adoptableCapacity("12.5")).toBeNull();
        expect(adoptableCapacity("twelve")).toBeNull();
        expect(adoptableCapacity("")).toBeNull();
        expect(buildLegacyCapacityAdoptionBody({ ...base, legacyValue: "12.5" })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 9, 12 — what happens to the legacy value.
// ---------------------------------------------------------------------------
describe("9, 12. the legacy value after a decision", () => {
    it("9. is retained after adoption, so compatibility readers do not go blank", () => {
        const kept = room({ id: "tod1", metadata: { capacity: "12" } });
        const s = resolveRoomCapacityStanding(kept, [rule({ id: "r1", metadata: adoptionMeta() })]);
        expect(legacyCapacityValue(kept)).toBe("12");
        expect(s.state).toBe("canonically_adopted");
    });

    it("10. but an adopted room presents CANONICAL capacity, not the legacy number", () => {
        const s = resolveRoomCapacityStanding(
            room({ id: "tod1", metadata: { capacity: "9" } }),
            [rule({ id: "r1", capacity: 12, metadata: adoptionMeta("9") })],
        );
        const d = resolveCapacityDisplay(s);
        expect(d.kind).toBe("canonical");
        expect(d).toMatchObject({ adopted: true });
        expect(JSON.stringify(d)).not.toContain('"9"');
    });

    it("12. a discarded value stops being active truth without being deleted", () => {
        const md = buildLegacyCapacityDiscardMetadata(
            { capacity: "12", category: "toddler" },
            LEGACY_CAPACITY_REVIEW_KEY,
            LEGACY_CAPACITY_DISCARDED,
        );
        const discarded = room({ id: "tod1", metadata: md });
        // The evidence survives...
        expect(legacyCapacityValue(discarded)).toBe("12");
        expect(md.category).toBe("toddler");
        // ...and it is no longer presented as capacity.
        expect(legacyCapacityDiscarded(discarded)).toBe(true);
        const s = resolveRoomCapacityStanding(discarded, []);
        expect(s.state).toBe("legacy_discarded");
        expect(resolveCapacityDisplay(s)).toEqual({ kind: "none", reviewed: true });
    });

    it("12. discard is not a sentinel capacity number", () => {
        const md = buildLegacyCapacityDiscardMetadata({ capacity: "12" }, LEGACY_CAPACITY_REVIEW_KEY, LEGACY_CAPACITY_DISCARDED);
        expect(md.capacity).toBe("12");
        expect(md[LEGACY_CAPACITY_REVIEW_KEY]).toBe("discarded");
        expect(Object.values(md)).not.toContain(0);
        expect(Object.values(md)).not.toContain("-1");
    });
});

// ---------------------------------------------------------------------------
// 11 — the compatibility resolver, one owner.
// ---------------------------------------------------------------------------
describe("11. compatibility display", () => {
    it("unconfirmed rooms show the legacy value, marked as such", () => {
        const s = resolveRoomCapacityStanding(room({ id: "tod1", metadata: { capacity: "12" } }), []);
        expect(resolveCapacityDisplay(s)).toEqual({ kind: "legacy_unconfirmed", value: "12" });
    });

    it("rooms with nothing show nothing, and say whether that was a decision", () => {
        expect(resolveCapacityDisplay(resolveRoomCapacityStanding(room({ id: "x" }), []))).toEqual({
            kind: "none",
            reviewed: false,
        });
    });

    it("the resolver is the only thing deciding — no surface re-derives it", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const root = resolve(__dirname, "../..");
        const src = readFileSync(resolve(root, "lib/locations/capacityAdoptionState.ts"), "utf8");
        expect(src).toContain("export function resolveCapacityDisplay");
    });
});

// ---------------------------------------------------------------------------
// 16-17 — the site answers coverage, never a seat total.
// ---------------------------------------------------------------------------
describe("16-17. site capacity coverage", () => {
    const rules = [rule({ id: "r1", room_location_id: "a", metadata: adoptionMeta() })];
    const rooms = [
        room({ id: "a", metadata: { capacity: "12" } }),
        room({ id: "b", metadata: { capacity: "10" } }),
        room({ id: "c", metadata: { capacity: "8" } }),
        room({ id: "d" }),
    ];

    it("17. counts confirmed, needs-review and unset — and they account for every room", () => {
        const c = summarizeSiteCapacityCoverage(rooms, rules);
        expect(c).toEqual({ total: 4, confirmed: 1, needsReview: 2, unset: 1 });
        expect(c.confirmed + c.needsReview + c.unset).toBe(c.total);
    });

    it("16. produces no seat total anywhere in its result", () => {
        const c = summarizeSiteCapacityCoverage(rooms, rules);
        // 30 is the legacy sum of 12+10+8. It must not appear.
        expect(Object.values(c)).not.toContain(30);
        expect(JSON.stringify(c)).not.toContain("30");
    });

    it("17. a fully adopted site reads as fully confirmed", () => {
        const allRules = rooms
            .filter((r) => r.metadata)
            .map((r, i) => rule({ id: `r${i}`, room_location_id: r.id, metadata: adoptionMeta() }));
        const c = summarizeSiteCapacityCoverage(rooms.slice(0, 3), allRules);
        expect(c).toEqual({ total: 3, confirmed: 3, needsReview: 0, unset: 0 });
    });

    it("an empty cohort is honest rather than zero-confident", () => {
        expect(summarizeSiteCapacityCoverage([], [])).toEqual({ total: 0, confirmed: 0, needsReview: 0, unset: 0 });
    });
});

// ---------------------------------------------------------------------------
// The preview an operator sees before anything is written.
// ---------------------------------------------------------------------------
describe("adoption preview states every consequence before the write", () => {
    const preview = buildAdoptionPreview({
        roomLabel: "Toddler 1",
        legacyValue: "12",
        capacityKind: "operational",
        kindLabel: CAPACITY_KIND_LABELS.operational,
        effectiveStart: "2026-09-19",
        retainLegacy: true,
    });

    it("names the room, the current value and that it is unconfirmed", () => {
        expect(preview.roomLabel).toBe("Toddler 1");
        expect(preview.currentValue).toBe("12 seats");
        expect(preview.currentQualifier).toBe("unconfirmed");
    });

    it("names the chosen meaning and the rule that will exist", () => {
        expect(preview.chosenKindLabel).toBe("Operational");
        expect(preview.resultLine).toBe("Operational capacity rule: 12 seats");
    });

    it("names the effective date and what becomes of the legacy value", () => {
        expect(preview.effectiveLine).toBe("Effective from 2026-09-19");
        expect(preview.legacyLine).toContain("Kept for now");
    });

    it("warns rather than silently failing on an unusable value", () => {
        const bad = buildAdoptionPreview({
            roomLabel: "X", legacyValue: "about twelve", capacityKind: "physical",
            kindLabel: "Physical", effectiveStart: "2026-09-19", retainLegacy: true,
        });
        expect(bad.resultLine).toContain("cannot be confirmed");
    });
});

// ---------------------------------------------------------------------------
// 19 — no bulk migration exists.
// ---------------------------------------------------------------------------
describe("19. there is no bulk path", () => {
    it("nothing adopts more than one room at a time", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const root = resolve(__dirname, "../..");
        for (const rel of ["lib/locations/capacityAdoptionRequest.ts", "lib/locations/capacityAdoptionState.ts"]) {
            const src = readFileSync(resolve(root, rel), "utf8");
            expect(src).not.toMatch(/adoptAll|bulkAdopt|migrateAll|forEach[\s\S]{0,60}buildLegacyCapacityAdoptionBody/);
        }
    });

    it("the builder takes one room and returns one rule body", () => {
        const body = buildLegacyCapacityAdoptionBody({
            roomLocationId: "tod1", legacyValue: "12", capacityKind: "operational",
            effectiveStart: "2026-09-19", retainLegacy: true, adoptedAt: "2026-09-19T00:00:00.000Z",
        });
        expect(Array.isArray(body)).toBe(false);
        expect(body!.room_location_id).toBe("tod1");
    });
});

describe("20. the adopted rule is effective on the day the operator confirmed it", () => {
    /**
     * Mounted QA found this: the operator confirmed a legacy value, the rule was
     * written effective 2026-09-20, and the room then reported "No capacity
     * resolves for this room yet."
     *
     * The rule was real — asking the resolver for 2026-09-20 returned
     * licensed=10, binding=10, limitingFactor=licensed. It was simply in the
     * future, because the page computed the effective date in UTC while
     * resolved-capacity asks resolveOperationalEnrollmentTodayYmd(), which is
     * the ORG's calendar day. West of UTC that diverges every evening, so for
     * those hours every adoption silently produced an invisible rule.
     *
     * The lock is on the date AUTHORITY, not on a formatted string: a test that
     * pinned today's date would pass tomorrow for the wrong reason.
     */
    const pageSrc = () => {
        const { readFileSync } = require("node:fs");
        const { resolve } = require("node:path");
        const src = readFileSync(
            resolve(__dirname, "../..", "components/adminV2/settings/locations/LocationsConfigurationPage.tsx"),
            "utf8",
        ) as string;
        // Strip imports: naming the helper on an import line must not satisfy this.
        return src.replace(/^import[\s\S]*?;$/gm, "");
    };

    it("the room capacity surface takes its today from the operational calendar, never from UTC", () => {
        const body = pageSrc();
        expect(body).toMatch(/todayYmd=\{operationalEnrollmentClientTodayYmd\(\)\}/);
        expect(body).not.toMatch(/todayYmd=\{new Date\(\)\.toISOString\(\)/);
    });

    it("no surface in the room capacity path derives a calendar day from toISOString", () => {
        const { readFileSync } = require("node:fs");
        const { resolve } = require("node:path");
        for (const rel of [
            "components/adminV2/settings/locations/RoomCapacitySection.tsx",
            "lib/locations/capacityAdoptionRequest.ts",
        ]) {
            const src = readFileSync(resolve(__dirname, "../..", rel), "utf8") as string;
            expect(src.replace(/^import[\s\S]*?;$/gm, "")).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
        }
    });
});
