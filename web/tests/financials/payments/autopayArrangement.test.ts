/**
 * CONSENT — who authorized what, and what may change afterwards.
 *
 * The database owns the hard guarantees (one live arrangement per account, immutable terms,
 * revocation is terminal) and proves them in the migration's own self-test against real rows. What
 * this suite owns is the DECISIONS around them: who may be named as the payer, which instrument may
 * be authorized, and what each lifecycle act is allowed to do.
 *
 * The distinction that motivates the whole file: A SAVED PAYMENT METHOD IS NOT AUTOPAY CONSENT.
 */
import { describe, expect, it, vi } from "vitest";

import {
    enrollAutopay,
    firstWakeAt,
    failArrangementsForMethod,
    pauseAutopay,
    resumeAutopay,
    revokeAutopay,
} from "@/lib/financials/payments/autopayArrangement";

const ORG = "org-1";
const CUSTOMER = "cust-1";
const PAYER = "person-1";
const METHOD = "pm-1";

type Row = Record<string, unknown>;

const method = (over: Row = {}): Row => ({
    id: METHOD, org_id: ORG, customer_id: CUSTOMER, payer_entity_id: PAYER,
    usability_state: "usable", rail: "card", ...over,
});

const live = (over: Row = {}): Row => ({
    id: "aa-1", org_id: ORG, customer_id: CUSTOMER, payer_entity_type: "person", payer_entity_id: PAYER,
    payment_method_id: METHOD, status: "active", authorized_by: "u", authorized_at: "2026-09-01T00:00:00Z",
    authorization_ref: null, effective_from: "2026-09-01", effective_to: null, amount_policy: "amount_due",
    max_amount_cents: null, timing_policy: "on_due_date", timing_offset_days: 0, retry_policy: "standard_v1",
    failure_count: 0, last_attempt_at: null, last_failure_reason: null, revoked_at: null, metadata: {}, ...over,
});

function store(opts: { arrangements?: Row[]; methods?: Row[]; schedules?: Row[] } = {}) {
    const tables: Record<string, Row[]> = {
        payment_autopay_arrangements: (opts.arrangements ?? []).map((r) => ({ ...r })),
        payment_methods: (opts.methods ?? [method()]).map((r) => ({ ...r })),
        scheduled_work: (opts.schedules ?? []).map((r) => ({ ...r })),
    };
    const inserted: Array<{ table: string; row: Row }> = [];
    const updated: Array<{ table: string; patch: Row }> = [];

    const client = {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let kind: "select" | "insert" | "update" = "select";
            let payload: Row = {};
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.eq = (c: string, v: unknown) => {
                filters.push((r) => (c.includes("->>")
                    ? ((r.domain_ref as Row | undefined)?.[c.split("->>")[1]!] === v)
                    : r[c] === v));
                return self;
            };
            self.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return self; };
            self.insert = (v: Row) => { kind = "insert"; payload = v; return self; };
            self.update = (v: Row) => { kind = "update"; payload = v; return self; };

            /*
             * `single` decides the SHAPE, exactly as PostgREST does: a plain awaited select returns
             * an ARRAY and `.maybeSingle()` returns one row or null. The first version of this fake
             * returned a row either way, which made `failArrangementsForMethod` look broken when it
             * was correctly calling `.map` on what the real client would have handed it.
             */
            const settle = async (single: boolean) => {
                const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
                if (kind === "insert") {
                    const row = { id: `new-${(tables[table] ?? []).length + 1}`, ...payload };
                    (tables[table] ??= []).push(row);
                    inserted.push({ table, row });
                    return { data: single ? row : [row], error: null };
                }
                if (kind === "update") {
                    updated.push({ table, patch: payload });
                    for (const r of rows) Object.assign(r, payload);
                }
                return { data: single ? (rows[0] ?? null) : rows, error: null };
            };
            self.maybeSingle = () => settle(true);
            self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => settle(false).then(res, rej);
            return self;
        },
    };
    return { client: client as never, inserted, updated, tables };
}

const enrollInput = {
    orgId: ORG, customerId: CUSTOMER, payerEntityId: PAYER, paymentMethodId: METHOD,
    authorizedBy: "user-1", effectiveFrom: "2026-10-01",
};

describe("enrollment is an explicit authorization, not a side effect of storing a card", () => {
    it("records the consent and makes it wakeable in the same act", async () => {
        const s = store();
        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok).toBe(true);

        const arrangement = s.inserted.find((i) => i.table === "payment_autopay_arrangements");
        expect(arrangement?.row.status).toBe("active");
        expect(arrangement?.row.amount_policy, "V1 has one amount policy").toBe("amount_due");
        expect(arrangement?.row.authorized_by).toBe("user-1");

        /*
         * THE STEP WITHOUT WHICH AUTOPAY SILENTLY NEVER HAPPENS. A consent with no schedule sits
         * active forever and collects nothing, and the surface says Autopay is on.
         */
        const schedule = s.inserted.find((i) => i.table === "scheduled_work");
        expect(schedule, "enrolling must register the arrangement with the clock").toBeTruthy();
        expect(schedule?.row.handler_key).toBe("payments.autopay.evaluate");
        expect(schedule?.row.recurrence_kind).toBe("daily");
        expect((schedule?.row.domain_ref as Row).arrangement_id).toBe(arrangement?.row.id);
    });

    /*
     * A CONSENT THAT CANNOT BE SCHEDULED IS THE SILENT FAILURE W5 EXISTS TO PREVENT. The row would
     * read "Autopay on" and never collect. It is surfaced as needing attention rather than
     * swallowed, and the enrollment is NOT rolled back — the payer did authorize it, and a
     * revocation record would misdescribe what happened.
     */
    it("says so when the authorization cannot be scheduled", async () => {
        const s = store();
        /* Make only the schedule insert fail, leaving the arrangement insert intact. */
        const inner = s.client as unknown as { from: (t: string) => Record<string, unknown> };
        const original = inner.from.bind(inner);
        (s.client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
            const builder = original(table) as Record<string, unknown>;
            if (table === "scheduled_work") {
                builder.maybeSingle = async () => ({ data: null, error: { message: "no" } });
                builder.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "no" } }).then(res);
            }
            return builder;
        };

        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok).toBe(true);
        expect(out.ok && out.value.lastFailureReason).toMatch(/could not be scheduled/i);
    });

    it("refuses a second authorization while one is already live", async () => {
        const s = store({ arrangements: [live()] });
        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe("already_enrolled");
        expect(s.inserted).toHaveLength(0);
    });

    /* W3's rule, carried into consent: the instrument's owner IS the payer being authorized. */
    it("refuses a method that belongs to a different payer", async () => {
        const s = store({ methods: [method({ payer_entity_id: "person-OTHER" })] });
        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok === false && out.reason).toBe("method_payer_mismatch");
    });

    it("refuses a method belonging to another account", async () => {
        const s = store({ methods: [method({ customer_id: "cust-OTHER" })] });
        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok === false && out.reason).toBe("method_wrong_account");
    });

    it("refuses a method that cannot be charged", async () => {
        const s = store({ methods: [method({ usability_state: "expired" })] });
        const out = await enrollAutopay(s.client, enrollInput);
        expect(out.ok === false && out.reason).toBe("method_not_usable");
    });

    it("refuses a nonsensical ceiling or window before writing anything", async () => {
        const s = store();
        expect((await enrollAutopay(s.client, { ...enrollInput, maxAmountCents: 0 })).ok).toBe(false);
        expect((await enrollAutopay(s.client, { ...enrollInput, maxAmountCents: -1 })).ok).toBe(false);
        expect((await enrollAutopay(s.client, { ...enrollInput, timingOffsetDays: 99 })).ok).toBe(false);
        expect((await enrollAutopay(s.client, { ...enrollInput, effectiveTo: "2026-09-01" })).ok).toBe(false);
        expect(s.inserted, "nothing is written when the terms are rejected").toHaveLength(0);
    });
});

describe("the schedule never starts in the past", () => {
    /*
     * A daily recurrence advances one day per wake. Starting at a backdated `effective_from` makes
     * the schedule walk forward one historical day per wake — twenty-one meaningless occurrences for
     * a start date three weeks ago. Live execution against a real runtime is what surfaced this:
     * two wakes in the same second each dispatched, because each materialised a different past day.
     */
    const NOW = new Date("2026-10-15T09:00:00.000Z");

    it("wakes today when the authorization was backdated", () => {
        expect(firstWakeAt("2026-09-24", NOW)).toBe("2026-10-15T00:00:00.000Z");
    });

    it("wakes today when the authorization starts today", () => {
        expect(firstWakeAt("2026-10-15", NOW)).toBe("2026-10-15T00:00:00.000Z");
    });

    /* A future start is honoured exactly: Autopay begins when the payer said it would. */
    it("waits when the authorization starts later", () => {
        expect(firstWakeAt("2026-11-01", NOW)).toBe("2026-11-01T00:00:00.000Z");
    });
});

describe("pause, resume and revoke each mean one thing", () => {
    it("pauses an active arrangement", async () => {
        const s = store({ arrangements: [live()] });
        const out = await pauseAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok).toBe(true);
        expect(s.updated.some((u) => u.patch.status === "paused")).toBe(true);
    });

    it("refuses to pause something that is not active", async () => {
        const s = store({ arrangements: [live({ status: "paused" })] });
        const out = await pauseAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok === false && out.reason).toBe("not_live");
    });

    /* Resuming onto a dead instrument would produce a failure at the next wake instead of now. */
    it("rechecks the method before resuming, and refuses a dead one", async () => {
        const s = store({
            arrangements: [live({ status: "paused" })],
            methods: [method({ usability_state: "revoked" })],
        });
        const out = await resumeAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok === false && out.reason).toBe("method_not_usable");
        expect(s.updated.some((u) => u.patch.status === "active")).toBe(false);
    });

    it("resumes a paused arrangement whose method is still good", async () => {
        const s = store({ arrangements: [live({ status: "paused" })] });
        const out = await resumeAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok).toBe(true);
        expect(s.updated.some((u) => u.patch.status === "active")).toBe(true);
    });

    it("never resumes a failed arrangement — that needs a new authorization", async () => {
        const s = store({ arrangements: [live({ status: "failed" })] });
        const out = await resumeAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok === false && out.reason).toBe("cannot_resume_failed");
    });

    it("revokes, stamps the time, and stops the clock immediately", async () => {
        const s = store({
            arrangements: [live()],
            schedules: [{ id: "sw-1", org_id: ORG, handler_key: "payments.autopay.evaluate", domain_ref: { arrangement_id: "aa-1" }, is_active: true }],
        });
        const out = await revokeAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok).toBe(true);
        expect(s.updated.some((u) => u.table === "payment_autopay_arrangements" && u.patch.status === "revoked")).toBe(true);
        expect(s.updated.some((u) => u.patch.revoked_at != null)).toBe(true);
        /* The handler would wind it down on its next wake; this makes it immediate. */
        expect(s.updated.some((u) => u.table === "scheduled_work" && u.patch.is_active === false)).toBe(true);
    });

    it("refuses to revoke twice", async () => {
        const s = store({ arrangements: [live({ status: "revoked", revoked_at: "2026-09-20T00:00:00Z" })] });
        const out = await revokeAutopay(s.client, { orgId: ORG, arrangementId: "aa-1" });
        expect(out.ok === false && out.reason).toBe("already_revoked");
    });
});

describe("a dead instrument ends the arrangements that stood on it", () => {
    /*
     * W3: an ACH return invalidates the mandate and the method stops being usable. This is the
     * convergence, not a second derivation of that rule — and there is deliberately no fallback to
     * another method on file, because the payer authorized one.
     */
    it("fails every live arrangement using the method, and leaves history alone", async () => {
        const s = store({
            arrangements: [
                live({ id: "aa-1", status: "active" }),
                live({ id: "aa-2", status: "paused", customer_id: "cust-2" }),
                live({ id: "aa-3", status: "revoked", revoked_at: "2026-01-01T00:00:00Z", customer_id: "cust-3" }),
            ],
        });
        const failed = await failArrangementsForMethod(s.client, {
            orgId: ORG, paymentMethodId: METHOD, reason: "The bank refused the mandate.",
        });
        expect(failed.sort(), "a revoked arrangement is history and is not re-touched").toEqual(["aa-1", "aa-2"]);
        expect(s.updated.filter((u) => u.patch.status === "failed")).toHaveLength(2);
    });

    it("does nothing when no arrangement depends on the method", async () => {
        const s = store({ arrangements: [] });
        expect(await failArrangementsForMethod(s.client, { orgId: ORG, paymentMethodId: METHOD, reason: "x" })).toEqual([]);
    });
});
