/**
 * THE COMMANDS, AND THE ENVELOPE THEY HAND BACK.
 *
 * Slice 3 registered three commands whose results were cast through
 * `as unknown as ActionResult`. They typechecked, registered, passed the registry
 * gate and every unit test — and every execution on deployed staging committed its
 * write and then returned 500, because the runtime validates the result it is
 * handed. Retries duplicated durable rows.
 *
 * So the envelope is asserted here from the beginning, against the real exported
 * type, alongside the payload validation. No casts exist in the module under test.
 */
import { describe, expect, it } from "vitest";

import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";
import {
    AVAILABILITY_ADD_EXCEPTION_ACTION_KEY,
    AVAILABILITY_CANCEL_EXCEPTION_ACTION_KEY,
    AVAILABILITY_SET_ACTION_KEY,
    staffAvailabilityAddExceptionAction,
    staffAvailabilitySetRecurringAction,
} from "@/lib/adminV2/actions/definitions/staffAvailabilityActions";

const KEYS = [
    AVAILABILITY_SET_ACTION_KEY,
    AVAILABILITY_ADD_EXCEPTION_ACTION_KEY,
    AVAILABILITY_CANCEL_EXCEPTION_ACTION_KEY,
];

describe("the availability commands are registered and executable", () => {
    it.each(KEYS)("%s is registered with a real execute branch", (key) => {
        const action = getRegisteredAction(key);
        expect(action, `${key} should be in the registry`).toBeTruthy();
        // Registered is not executable: a definition without a handler is a command
        // an operator can see and never run.
        expect(hasRegisteredHandler(key)).toBe(true);
        expect(typeof action!.execute).toBe("function");
    });

    it("all three address the PERSON subject and require an entity", () => {
        for (const key of KEYS) {
            const a = getRegisteredAction(key)!;
            expect(a.supportedEntityTypes).toEqual(["person"]);
            // Subject-ful on purpose: availability belongs to an employment reached
            // through the person on screen, so these are not subjectless transport.
            expect(a.requiredContext.requiresEntityId).toBe(true);
        }
    });
});

describe("set_recurring payload validation", () => {
    const v = (p: Record<string, unknown>) => staffAvailabilitySetRecurringAction.validatePayload!(p);

    it("accepts a normal week", () => {
        expect(v({ effective_start: "2026-10-01", windows: [{ weekday: 1, start_time: "07:30", end_time: "16:30" }] }).ok).toBe(true);
    });

    it("refuses a date that matches the shape but is not a day", () => {
        const r = v({ effective_start: "2026-02-30", windows: [] });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.blockers[0]!.code).toBe("invalid_effective_start");
    });

    it("refuses an end before the start, a bad weekday and a reversed window", () => {
        expect(v({ effective_start: "2026-10-01", effective_end: "2026-09-01", windows: [] }).ok).toBe(false);
        expect(v({ effective_start: "2026-10-01", windows: [{ weekday: 9, start_time: "07:30", end_time: "16:30" }] }).ok).toBe(false);
        expect(v({ effective_start: "2026-10-01", windows: [{ weekday: 1, start_time: "16:30", end_time: "07:30" }] }).ok).toBe(false);
    });

    it("accepts an empty week — closing the pattern is a real intent", () => {
        expect(v({ effective_start: "2026-10-01", windows: [] }).ok).toBe(true);
    });
});

describe("add_exception payload validation", () => {
    const v = (p: Record<string, unknown>) => staffAvailabilityAddExceptionAction.validatePayload!(p);

    it("an unavailable exception carries no times, and is refused if it does", () => {
        expect(v({ exception_date: "2026-09-28", exception_kind: "unavailable" }).ok).toBe(true);
        // Times stored on an unavailable row would be ignored by the resolver — a
        // record saying something the system does not honour.
        expect(v({ exception_date: "2026-09-28", exception_kind: "unavailable", start_time: "09:00" }).ok).toBe(false);
    });

    it("an available exception needs a valid ordered window", () => {
        expect(v({ exception_date: "2026-09-28", exception_kind: "available", start_time: "12:00", end_time: "17:00" }).ok).toBe(true);
        expect(v({ exception_date: "2026-09-28", exception_kind: "available" }).ok).toBe(false);
        expect(v({ exception_date: "2026-09-28", exception_kind: "available", start_time: "17:00", end_time: "12:00" }).ok).toBe(false);
    });

    it("refuses an unknown kind", () => {
        expect(v({ exception_date: "2026-09-28", exception_kind: "maybe" }).ok).toBe(false);
    });
});

describe("the result envelope the runtime validates", () => {
    // Typed as a record so the refusal case can spread it; `as never` at the call
    // site is what satisfies the executor's own parameter type.
    const db: Record<string, unknown> = {
        from() { return this; }, select() { return this; }, eq() { return this; },
        is() { return this; }, lt() { return this; }, order() { return this; },
        update() { return this; }, insert() { return this; },
        maybeSingle: async () => ({ data: { id: "emp-1" }, error: null }),
        single: async () => ({ data: { id: "exc-1", org_id: "o1" }, error: null }),
        then: (res: (v: unknown) => void) => res({ data: [{ id: "w-1" }], error: null }),
    };
    const ctx = { orgId: "o1", userId: "u1" } as never;

    it("success is { ok, correlationId, result }, never a bare data bag", async () => {
        const res = await staffAvailabilityAddExceptionAction.execute!({
            supabase: db as never, ctx,
            payload: { employment_id: "emp-1", exception_date: "2026-09-28", exception_kind: "unavailable" },
        } as never);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.result.actionKey).toBe(AVAILABILITY_ADD_EXCEPTION_ACTION_KEY);
        expect(res.result.entityType).toBe("person");
        expect(res.result.affectedId).toBe("exc-1");
        expect(res.correlationId).toBeTruthy();
        // The Slice 3 shape, explicitly refused.
        expect(res).not.toHaveProperty("data");
        expect(res).not.toHaveProperty("actionKey");
    });

    it("a domain refusal carries a STRING error and an http status", async () => {
        const missing = { ...db, maybeSingle: async () => ({ data: null, error: null }) };
        const res = await staffAvailabilityAddExceptionAction.execute!({
            supabase: missing as never, ctx,
            payload: { employment_id: "foreign", exception_date: "2026-09-28", exception_kind: "unavailable" },
        } as never);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(typeof res.error).toBe("string");
        // An employment belonging to another organization is not found, not a 500.
        expect(res.status).toBe(404);
    });
});
