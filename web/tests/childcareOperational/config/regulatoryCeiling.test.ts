import { describe, expect, it } from "vitest";
import {
    resolveLicensedCeiling,
    validateLicensedOverrideNotWeaker,
} from "@/lib/childcareOperational/config/regulatoryCeiling";
import { resolveCapacity, resolveCapacityBreakdown } from "@/lib/childcareOperational/config/capacityRules";
import {
    resolveConfigRule,
    type ResolvableConfigRule,
} from "@/lib/childcareOperational/config/resolveConfigRule";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    createCapacityRule,
    createCapacityRuleVersion,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../mockOperationalEnrollmentSupabase";

const SITE = "site-1";
const ROOM = "room-1";

function capRule(partial: Partial<ChildcareCapacityRuleRow>): ChildcareCapacityRuleRow {
    return {
        id: partial.id ?? "cap-1",
        org_id: "org-1",
        scope_type: "org",
        site_location_id: null,
        program_category_id: null,
        room_location_id: null,
        age_group_key: null,
        capacity_kind: "licensed",
        capacity: 10,
        effective_start: "2026-01-01",
        effective_end: null,
        source_key: "licensing",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

const context = { siteLocationId: SITE, roomLocationId: ROOM, ageGroupKey: "infant" as string | null };

describe("resolveLicensedCeiling — regulatory clamp (min across scope)", () => {
    it("returns null when no licensed rule applies", () => {
        expect(resolveLicensedCeiling([], context, "2026-06-01").ceiling).toBeNull();
    });

    it("a more-specific HIGHER licensed rule cannot weaken (raise) the ceiling", () => {
        const orgLicensed = capRule({ id: "org", scope_type: "org", capacity: 12 });
        const roomLicensed = capRule({ id: "room", scope_type: "room", room_location_id: ROOM, capacity: 20 });
        const res = resolveLicensedCeiling([orgLicensed, roomLicensed], context, "2026-06-01");
        // min(12, 20) = 12 — the broader regulatory limit binds, not the weaker override.
        expect(res.ceiling).toBe(12);
        expect(res.boundByRuleId).toBe("org");
        expect(res.consideredRuleIds.sort()).toEqual(["org", "room"]);
    });

    it("a more-specific LOWER licensed rule tightens the ceiling", () => {
        const orgLicensed = capRule({ id: "org", scope_type: "org", capacity: 12 });
        const roomLicensed = capRule({ id: "room", scope_type: "room", room_location_id: ROOM, capacity: 8 });
        const res = resolveLicensedCeiling([orgLicensed, roomLicensed], context, "2026-06-01");
        expect(res.ceiling).toBe(8);
        expect(res.boundByRuleId).toBe("room");
    });

    it("resolveCapacity('licensed') uses the clamp; physical stays most-specific-wins", () => {
        const rules = [
            capRule({ id: "org-lic", scope_type: "org", capacity_kind: "licensed", capacity: 12 }),
            capRule({ id: "room-lic", scope_type: "room", room_location_id: ROOM, capacity_kind: "licensed", capacity: 20 }),
            capRule({ id: "org-phys", scope_type: "org", capacity_kind: "physical", capacity: 30 }),
            capRule({ id: "room-phys", scope_type: "room", room_location_id: ROOM, capacity_kind: "physical", capacity: 25 }),
        ];
        expect(resolveCapacity(rules, context, "2026-06-01", "licensed")).toBe(12); // clamped
        expect(resolveCapacity(rules, context, "2026-06-01", "physical")).toBe(25); // most-specific
        const bd = resolveCapacityBreakdown(rules, context, "2026-06-01");
        expect(bd.licensed).toBe(12);
        expect(bd.physical).toBe(25);
        expect(bd.binding).toBe(12);
        expect(bd.licensedBoundByRuleId).toBe("org-lic");
    });
});

describe("validateLicensedOverrideNotWeaker — author-time guard", () => {
    const existing = [capRule({ id: "org", scope_type: "org", capacity: 12 })];

    it("allows a non-licensed candidate", () => {
        expect(
            validateLicensedOverrideNotWeaker(
                { capacityKind: "operational", capacity: 99, context, effectiveStart: "2026-06-01" },
                existing,
            ).ok,
        ).toBe(true);
    });

    it("allows the first licensing rule (no existing ceiling)", () => {
        expect(
            validateLicensedOverrideNotWeaker(
                { capacityKind: "licensed", capacity: 100, context, effectiveStart: "2026-06-01" },
                [],
            ).ok,
        ).toBe(true);
    });

    it("allows a tightening (lower or equal) override", () => {
        expect(
            validateLicensedOverrideNotWeaker(
                { capacityKind: "licensed", capacity: 10, context, effectiveStart: "2026-06-01" },
                existing,
            ).ok,
        ).toBe(true);
    });

    it("rejects a weakening (higher) override", () => {
        const res = validateLicensedOverrideNotWeaker(
            { capacityKind: "licensed", capacity: 20, context, effectiveStart: "2026-06-01" },
            existing,
        );
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("licensing_override_weakens_ceiling");
            expect(res.boundCeiling).toBe(12);
        }
    });
});

describe("resolveConfigRule — deterministic final tiebreak", () => {
    type Rule = ResolvableConfigRule & { marker: string };
    function r(marker: string, partial: Partial<Rule>): Rule {
        return {
            marker,
            scope_type: "site",
            site_location_id: SITE,
            program_category_id: null,
            room_location_id: null,
            age_group_key: null,
            effective_start: "2026-01-01",
            effective_end: null,
            ...partial,
        };
    }
    const ctx = { siteLocationId: SITE };

    it("is deterministic for identical scope+age+effective_start regardless of input order", () => {
        const a = r("a", { id: "a", created_at: "2026-01-01T00:00:00Z" });
        const b = r("b", { id: "b", created_at: "2026-02-01T00:00:00Z" });
        // latest created_at wins, both orders
        expect(resolveConfigRule([a, b], ctx, "2026-06-01")?.marker).toBe("b");
        expect(resolveConfigRule([b, a], ctx, "2026-06-01")?.marker).toBe("b");
    });

    it("falls back to smallest id when created_at ties", () => {
        const a = r("a", { id: "a-id", created_at: "2026-01-01T00:00:00Z" });
        const b = r("b", { id: "b-id", created_at: "2026-01-01T00:00:00Z" });
        expect(resolveConfigRule([b, a], ctx, "2026-06-01")?.marker).toBe("a");
    });
});

describe("author-time licensing guard (wired into the authoring service)", () => {
    function seedOrgLicensed(capacity: number) {
        return createOperationalEnrollmentMockSupabase(
            createOperationalEnrollmentMockStore({
                childcare_capacity_rules: [
                    {
                        id: "org-lic",
                        org_id: ORG_ID,
                        scope_type: "org",
                        site_location_id: null,
                        program_category_id: null,
                        room_location_id: null,
                        age_group_key: null,
                        capacity_kind: "licensed",
                        capacity,
                        effective_start: "2026-01-01",
                        effective_end: null,
                        source_key: "licensing",
                        metadata: {},
                        created_at: "2026-01-01T00:00:00Z",
                        updated_at: "2026-01-01T00:00:00Z",
                    },
                ],
            }),
        );
    }

    it("rejects creating a room-scope licensed rule that weakens the org ceiling", async () => {
        const supabase = seedOrgLicensed(10);
        await expect(
            createCapacityRule(supabase, {
                orgId: ORG_ID,
                scopeType: "room",
                roomLocationId: ROOM,
                capacityKind: "licensed",
                capacity: 20,
                effectiveStart: "2026-06-01",
            }),
        ).rejects.toThrow(/licensing ceiling|only tighten/i);
    });

    it("allows a tightening (lower) room-scope licensed rule", async () => {
        const supabase = seedOrgLicensed(10);
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID,
            scopeType: "room",
            roomLocationId: ROOM,
            capacityKind: "licensed",
            capacity: 8,
            effectiveStart: "2026-06-01",
        });
        expect(rule.capacity).toBe(8);
    });

    it("does not gate a non-licensed (operational) rule", async () => {
        const supabase = seedOrgLicensed(10);
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID,
            scopeType: "site",
            siteLocationId: SITE,
            capacityKind: "operational",
            capacity: 99,
            effectiveStart: "2026-06-01",
        });
        expect(rule.capacity).toBe(99);
    });

    it("blocks a version that weakens the licensed ceiling (excludes its own prior)", async () => {
        const supabase = seedOrgLicensed(10);
        const seeded = await createCapacityRule(supabase, {
            orgId: ORG_ID,
            scopeType: "site",
            siteLocationId: SITE,
            capacityKind: "licensed",
            capacity: 9,
            effectiveStart: "2026-02-01",
        });
        await expect(
            createCapacityRuleVersion(supabase, {
                orgId: ORG_ID,
                priorId: seeded.id,
                capacity: 15,
                effectiveStart: "2026-07-01",
            }),
        ).rejects.toThrow(/licensing ceiling|only tighten/i);
    });
});
