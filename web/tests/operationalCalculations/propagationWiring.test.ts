/**
 * Phase 4 — Configuration Event Propagation: authoring-service wiring.
 *
 * Proves that a committed ratio/capacity config mutation emits the canonical
 * config-changed event EXACTLY ONCE via the existing `emitEvent` layer (no second
 * propagation path), with the correct typed payload — and that a failed write
 * emits nothing. `emitEvent` is spied so the test needs no real event layer.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EmitEventInput } from "@/lib/emitEvent";

const emitEventMock = vi.hoisted(() => vi.fn(async (input: EmitEventInput) => {
    void input;
    return "evt-1";
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: emitEventMock }));

import {
    createCapacityRule,
    createCapacityRuleVersion,
    retireCapacityRule,
    voidScheduledCapacityRule,
    createRatioRule,
    createRatioRuleVersion,
    retireRatioRule,
    voidScheduledRatioRule,
    createOperatingWindow,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";
import { OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT } from "@/lib/operationalCalculations";

const TODAY = "2026-06-29";
const ACTOR = "user-1";

function setup() {
    const store = createOperationalEnrollmentMockStore();
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

function lastPayload() {
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    const arg = emitEventMock.mock.calls[0][0];
    expect(arg.event_type).toBe(OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT);
    return arg.payload;
}

beforeEach(() => emitEventMock.mockClear());

describe("capacity authoring emits exactly one config-changed event per mutation", () => {
    it("create → change_kind=create, rule_type=capacity, capacity keys", async () => {
        const { supabase } = setup();
        await createCapacityRule(supabase, {
            orgId: ORG_ID,
            scopeType: "room",
            roomLocationId: "room-1",
            capacityKind: "physical",
            capacity: 20,
            effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
        });
        const p = lastPayload();
        expect(p).toMatchObject({ rule_type: "capacity", change_kind: "create" });
        expect(p.affected_calculation_keys).toEqual(["capacity.room_binding", "capacity.remaining"]);
        expect((p.scope as Record<string, unknown>).room_location_id).toBe("room-1");
    });

    it("version / retire / void each emit exactly once with the right change_kind", async () => {
        const { supabase } = setup();
        const rule = await createCapacityRule(supabase, {
            orgId: ORG_ID, scopeType: "room", roomLocationId: "room-1",
            capacityKind: "physical", capacity: 20, effectiveStart: "2026-01-01", actorUserId: ACTOR,
        });

        emitEventMock.mockClear();
        const versioned = await createCapacityRuleVersion(supabase, {
            orgId: ORG_ID, priorId: rule.id, effectiveStart: "2027-01-01", capacity: 24, actorUserId: ACTOR,
        });
        expect(lastPayload()).toMatchObject({ change_kind: "version" });

        emitEventMock.mockClear();
        await voidScheduledCapacityRule(supabase, { orgId: ORG_ID, id: versioned.row.id, todayYmd: TODAY, actorUserId: ACTOR });
        expect(lastPayload()).toMatchObject({ change_kind: "void", rule_type: "capacity" });

        emitEventMock.mockClear();
        await retireCapacityRule(supabase, { orgId: ORG_ID, id: rule.id, effectiveEnd: "2026-12-31", actorUserId: ACTOR });
        expect(lastPayload()).toMatchObject({ change_kind: "retire" });
    });
});

describe("ratio authoring emits exactly one config-changed event per mutation", () => {
    it("create → rule_type=ratio, all four affected keys", async () => {
        const { supabase } = setup();
        await createRatioRule(supabase, {
            orgId: ORG_ID, scopeType: "room", roomLocationId: "room-1",
            tiers: [{ maxChildren: 5, requiredStaff: 1 }, { maxChildren: 11, requiredStaff: 2 }],
            effectiveStart: "2026-01-01", actorUserId: ACTOR,
        });
        const p = lastPayload();
        expect(p).toMatchObject({ rule_type: "ratio", change_kind: "create" });
        expect(p.affected_calculation_keys).toHaveLength(4);
    });

    it("version / retire / void each emit exactly once", async () => {
        const { supabase } = setup();
        const { rule } = await createRatioRule(supabase, {
            orgId: ORG_ID, scopeType: "room", roomLocationId: "room-1",
            tiers: [{ maxChildren: 5, requiredStaff: 1 }], effectiveStart: "2026-01-01", actorUserId: ACTOR,
        });

        emitEventMock.mockClear();
        const versioned = await createRatioRuleVersion(supabase, {
            orgId: ORG_ID, priorId: rule.id, effectiveStart: "2027-01-01",
            tiers: [{ maxChildren: 6, requiredStaff: 1 }], actorUserId: ACTOR,
        });
        expect(lastPayload()).toMatchObject({ change_kind: "version", rule_type: "ratio" });

        emitEventMock.mockClear();
        await voidScheduledRatioRule(supabase, { orgId: ORG_ID, id: versioned.row.id, todayYmd: TODAY, actorUserId: ACTOR });
        expect(lastPayload()).toMatchObject({ change_kind: "void", rule_type: "ratio" });

        emitEventMock.mockClear();
        await retireRatioRule(supabase, { orgId: ORG_ID, id: rule.id, effectiveEnd: "2026-12-31", actorUserId: ACTOR });
        expect(lastPayload()).toMatchObject({ change_kind: "retire", rule_type: "ratio" });
    });
});

describe("propagation boundaries", () => {
    it("emits NOTHING when the write fails validation (invalid capacity kind)", async () => {
        const { supabase } = setup();
        await expect(
            createCapacityRule(supabase, {
                orgId: ORG_ID, scopeType: "room", roomLocationId: "room-1",
                capacityKind: "not_a_kind", capacity: 20, effectiveStart: "2026-01-01", actorUserId: ACTOR,
            }),
        ).rejects.toBeTruthy();
        expect(emitEventMock).not.toHaveBeenCalled();
    });

    it("does NOT emit for out-of-scope operating-window authoring (Scheduling family)", async () => {
        const { supabase } = setup();
        await createOperatingWindow(supabase, {
            orgId: ORG_ID, scopeType: "site", siteLocationId: "site-1",
            weekday: 1, openTime: "08:00", closeTime: "17:00", effectiveStart: "2026-01-01", actorUserId: ACTOR,
        });
        expect(emitEventMock).not.toHaveBeenCalled();
    });
});
