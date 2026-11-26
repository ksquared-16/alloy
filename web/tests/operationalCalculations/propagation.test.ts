/**
 * Phase 4 — Configuration Event Propagation: pure-logic conformance.
 *
 * Covers the emit-side event builder, the affected-keys mapping, and the pure
 * invalidation predicate (scope containment + effective-window coverage). The
 * predicate computes nothing and performs no IO — these tests exercise the
 * propagation mechanism that a future cache/consumer layer would consult (in V1
 * capacity is live-computed and cached nowhere).
 */

import { describe, expect, it } from "vitest";
import {
    OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT,
    OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION,
    affectedCalculationKeysFor,
    buildCalculationConfigChangedEvent,
    calculationResultInvalidatedBy,
    changeScopeContains,
    effectiveWindowCoversAsOf,
    selectInvalidated,
    type CalculationConfigChange,
    type CalculationConfigChangeInput,
    type CalculationResultCoordinate,
} from "@/lib/operationalCalculations";

const SITE = "site-1";
const ROOM = "room-1";

describe("affectedCalculationKeysFor — derived from handler inputs", () => {
    it("ratio changes can invalidate all four keys (ratio feeds binding via ratio-limited)", () => {
        expect([...affectedCalculationKeysFor("ratio")].sort()).toEqual([
            "capacity.remaining",
            "capacity.room_binding",
            "resource.ratio",
            "resource.required_staff",
        ]);
    });
    it("capacity changes invalidate only the capacity keys", () => {
        expect([...affectedCalculationKeysFor("capacity")].sort()).toEqual([
            "capacity.remaining",
            "capacity.room_binding",
        ]);
    });
});

describe("buildCalculationConfigChangedEvent — canonical envelope, deterministic", () => {
    const input: CalculationConfigChangeInput = {
        orgId: "org-1",
        ruleType: "capacity",
        changeKind: "create",
        ruleId: "cap-1",
        scope: { siteLocationId: SITE, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null },
        effectiveStart: "2026-09-01",
        effectiveEnd: null,
        actorUserId: "user-1",
    };

    it("targets workflow_events with the canonical type + structured payload", () => {
        const ev = buildCalculationConfigChangedEvent(input);
        expect(ev.org_id).toBe("org-1");
        expect(ev.event_type).toBe(OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT);
        expect(ev.entity_type).toBe("childcare_capacity_rules");
        expect(ev.entity_id).toBe("cap-1");
        expect(ev.action_type).toBe("config_create");
        expect(ev.payload).toMatchObject({
            schema_version: OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION,
            rule_type: "capacity",
            change_kind: "create",
            rule_id: "cap-1",
            scope: { site_location_id: SITE, program_category_id: null, room_location_id: ROOM, age_group_key: null },
            effective_start: "2026-09-01",
            effective_end: null,
            affected_calculation_keys: ["capacity.room_binding", "capacity.remaining"],
            actor_user_id: "user-1",
        });
    });

    it("is deterministic (no clock, no randomness) — the event layer stamps occurred_at", () => {
        expect(buildCalculationConfigChangedEvent(input)).toEqual(buildCalculationConfigChangedEvent(input));
        expect(buildCalculationConfigChangedEvent(input).payload).not.toHaveProperty("occurred_at");
    });

    it("ratio rule maps to the ratio entity + all-four affected keys", () => {
        const ev = buildCalculationConfigChangedEvent({ ...input, ruleType: "ratio", ruleId: "r-1" });
        expect(ev.entity_type).toBe("childcare_ratio_rules");
        expect((ev.payload as { affected_calculation_keys: string[] }).affected_calculation_keys).toHaveLength(4);
    });
});

describe("changeScopeContains — structural ancestor-or-equal", () => {
    const coordRoom = { siteLocationId: SITE, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null };
    it("a room change matches the same room", () => {
        expect(changeScopeContains({ siteLocationId: null, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null }, coordRoom)).toBe(true);
    });
    it("a site change matches a room under that site (coordinate carries its site)", () => {
        expect(changeScopeContains({ siteLocationId: SITE, programCategoryId: null, roomLocationId: null, ageGroupKey: null }, coordRoom)).toBe(true);
    });
    it("an org-wide change (all null) matches everything", () => {
        expect(changeScopeContains({ siteLocationId: null, programCategoryId: null, roomLocationId: null, ageGroupKey: null }, coordRoom)).toBe(true);
    });
    it("a different room does not match", () => {
        expect(changeScopeContains({ siteLocationId: null, programCategoryId: null, roomLocationId: "room-2", ageGroupKey: null }, coordRoom)).toBe(false);
    });
    it("a room change does not invalidate a broader (room-null) result", () => {
        const coordSite = { siteLocationId: SITE, programCategoryId: null, roomLocationId: null, ageGroupKey: null };
        expect(changeScopeContains({ siteLocationId: null, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null }, coordSite)).toBe(false);
    });
});

describe("effectiveWindowCoversAsOf — window boundaries", () => {
    it("excludes resolutions before the change takes effect", () => {
        expect(effectiveWindowCoversAsOf("2026-09-01", null, "2026-08-31")).toBe(false);
    });
    it("includes on/after the start with an open end", () => {
        expect(effectiveWindowCoversAsOf("2026-09-01", null, "2026-09-01")).toBe(true);
        expect(effectiveWindowCoversAsOf("2026-09-01", null, "2027-01-01")).toBe(true);
    });
    it("excludes after a closed window", () => {
        expect(effectiveWindowCoversAsOf("2026-09-01", "2026-09-30", "2026-10-01")).toBe(false);
        expect(effectiveWindowCoversAsOf("2026-09-01", "2026-09-30", "2026-09-15")).toBe(true);
    });
});

describe("calculationResultInvalidatedBy — the composed predicate", () => {
    const change: CalculationConfigChange = {
        ruleType: "capacity",
        changeKind: "create",
        scope: { siteLocationId: SITE, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null },
        effectiveStart: "2026-09-01",
        effectiveEnd: null,
    };
    const coord = (over: Partial<CalculationResultCoordinate> = {}): CalculationResultCoordinate => ({
        calculationKey: "capacity.room_binding",
        scope: { siteLocationId: SITE, programCategoryId: null, roomLocationId: ROOM, ageGroupKey: null },
        asOf: "2026-09-15",
        ...over,
    });

    it("invalidates a matching key + scope + date", () => {
        expect(calculationResultInvalidatedBy(change, coord())).toBe(true);
    });
    it("does not invalidate a key the rule type does not feed", () => {
        // a capacity rule does not feed resource.required_staff
        expect(calculationResultInvalidatedBy(change, coord({ calculationKey: "resource.required_staff" }))).toBe(false);
    });
    it("does not invalidate a different room", () => {
        expect(calculationResultInvalidatedBy(change, coord({ scope: { siteLocationId: SITE, programCategoryId: null, roomLocationId: "room-2", ageGroupKey: null } }))).toBe(false);
    });
    it("does not invalidate a resolution dated before the change", () => {
        expect(calculationResultInvalidatedBy(change, coord({ asOf: "2026-08-01" }))).toBe(false);
    });
    it("a ratio change DOES invalidate a capacity result (ratio feeds binding)", () => {
        expect(calculationResultInvalidatedBy({ ...change, ruleType: "ratio" }, coord())).toBe(true);
    });

    it("selectInvalidated returns exactly the matching coordinates (no duplication, deterministic)", () => {
        const coords = [
            coord({ calculationKey: "capacity.room_binding" }),
            coord({ calculationKey: "capacity.remaining" }),
            coord({ calculationKey: "resource.required_staff" }), // not fed by capacity
            coord({ asOf: "2026-08-01" }), // before change
        ];
        const out = selectInvalidated(change, coords);
        expect(out.map((c) => c.calculationKey)).toEqual(["capacity.room_binding", "capacity.remaining"]);
    });
});
