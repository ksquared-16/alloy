/**
 * MISSING-WEBHOOK RECONCILIATION — the sweep's rules, without a provider.
 *
 * The live suite proves the money path end to end against Stripe test mode. These pin the bounds:
 * which attempts are read, that each is recognised under its OWN org, that a recently-read attempt is
 * not re-read every wake, that a posting refusal is left where the operator queue shows it, and that
 * the scheduled handler reports "nothing to do" as completed and an unreadable store as retryable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

const recognize = vi.fn();
vi.mock("@/lib/financials/payments/collectionRecognition", () => ({
    recognizeCollectionAttempt: (...args: unknown[]) => recognize(...args),
}));

import {
    evaluateCollectionReconciliationOccurrence,
    reconcileUnrecognizedCollections,
} from "@/lib/financials/payments/collectionReconciliation";

type Row = Record<string, unknown>;
const NOW = new Date("2026-10-17T12:00:00Z");

function store(rows: Row[], opts: { failRead?: boolean } = {}) {
    const updates: Array<{ id: unknown; values: Row }> = [];
    const queries: Array<Record<string, unknown>> = [];
    const client = {
        from() {
            const filters: Array<(r: Row) => boolean> = [];
            const seen: Record<string, unknown> = {};
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.is = (c: string, v: unknown) => { seen[`is:${c}`] = v; filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return self; };
            self.not = (c: string, op: string, v: unknown) => { seen[`not:${c}`] = `${op}:${v}`; filters.push((r) => r[c] != null); return self; };
            self.in = (c: string, vs: unknown[]) => { seen[`in:${c}`] = vs; filters.push((r) => vs.includes(r[c])); return self; };
            self.lt = (c: string, v: string) => { seen[`lt:${c}`] = v; filters.push((r) => String(r[c]) < v); return self; };
            self.gt = (c: string, v: string) => { seen[`gt:${c}`] = v; filters.push((r) => String(r[c]) > v); return self; };
            self.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return self; };
            self.order = () => self;
            self.limit = (n: number) => { seen.limit = n; return self; };
            self.update = (v: Row) => { pending = v; return self; };
            const settle = () => {
                if (opts.failRead && !pending) return { data: null, error: { message: "boom" } };
                const hit = rows.filter((r) => filters.every((f) => f(r)));
                if (pending) {
                    hit.forEach((r) => { Object.assign(r, pending); updates.push({ id: r.id, values: { ...pending } }); });
                    return { data: hit, error: null };
                }
                queries.push(seen);
                return { data: hit.map((r) => ({ ...r })), error: null };
            };
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return { client: client as never, updates, queries };
}

const attempt = (over: Row = {}): Row => ({
    id: "att-1", org_id: "org-a", canonical_payment_id: null, provider_transaction_id: "pi_1",
    processor_state: "requires_payment_method", updated_at: "2026-10-17T11:00:00Z",
    created_at: "2026-10-16T11:00:00Z", last_provider_detail: {}, ...over,
});

describe("which attempts the sweep reads", () => {
    it("only unrecognised, provider-reached, quiet, recent attempts", async () => {
        recognize.mockReset().mockResolvedValue({ ok: false, reason: "not_settled", message: "x", attemptId: null });
        const rows = [
            attempt({ id: "quiet" }),
            attempt({ id: "posted", canonical_payment_id: "pay-1" }),
            attempt({ id: "never-reached", provider_transaction_id: null }),
            attempt({ id: "canceled", processor_state: "canceled" }),
            attempt({ id: "just-now", updated_at: "2026-10-17T11:58:00Z" }),
            attempt({ id: "ancient", created_at: "2026-09-01T00:00:00Z" }),
        ];
        const s = store(rows);
        const out = await reconcileUnrecognizedCollections(s.client, { now: NOW });
        expect(out.examined).toBe(1);
        expect(recognize).toHaveBeenCalledTimes(1);
        // Under the attempt's OWN org — nothing here chooses a tenant.
        expect(recognize.mock.calls[0][1]).toEqual({ orgId: "org-a", attemptId: "quiet" });
    });

    it("does not re-read an attempt it read within the recheck window, and stamps what it read", async () => {
        recognize.mockReset().mockResolvedValue({ ok: false, reason: "not_settled", message: "x", attemptId: null });
        const rows = [
            attempt({ id: "recent", last_provider_detail: { reconciled_at: "2026-10-17T11:50:00Z" } }),
            attempt({ id: "due", last_provider_detail: { reconciled_at: "2026-10-17T10:00:00Z", keep: "me" } }),
        ];
        const s = store(rows);
        const out = await reconcileUnrecognizedCollections(s.client, { now: NOW });
        expect(out.examined).toBe(1);
        expect(recognize.mock.calls[0][1].attemptId).toBe("due");
        const stamped = rows.find((r) => r.id === "due")!;
        expect(stamped.last_provider_detail).toMatchObject({ keep: "me", reconciled_reason: "not_settled", reconciled_at: NOW.toISOString() });
        // The stamp is evidence, never state.
        expect(stamped.processor_state).toBe("requires_payment_method");
    });

    it("counts a recognition, and leaves a posting refusal where the operator queue reads it", async () => {
        recognize.mockReset()
            .mockResolvedValueOnce({ ok: true, recognized: true, paymentId: "pay-9", attemptId: "a" })
            .mockResolvedValueOnce({ ok: false, reason: "posting_refused", message: "Amounts disagree.", attemptId: "b" });
        const rows = [attempt({ id: "a", updated_at: "2026-10-17T10:00:00Z" }), attempt({ id: "b", processor_state: "succeeded" })];
        const s = store(rows);
        const out = await reconcileUnrecognizedCollections(s.client, { now: NOW });
        expect(out).toMatchObject({ examined: 2, recognized: 1, refused: 1 });
        expect(rows.find((r) => r.id === "b")!.last_provider_detail).toMatchObject({ recognition_reason: "Amounts disagree." });
    });

    it("is bounded per wake, and can be narrowed so a shared database is never swept wholesale", async () => {
        recognize.mockReset().mockResolvedValue({ ok: false, reason: "not_settled", message: "x", attemptId: null });
        const rows = Array.from({ length: 30 }, (_, i) => attempt({ id: `a${i}` }));
        expect((await reconcileUnrecognizedCollections(store(rows).client, { now: NOW, limit: 5 })).examined).toBe(5);
        recognize.mockClear();
        // Fresh rows: the first sweep stamped (and so re-queued) the five it read.
        const fresh = Array.from({ length: 30 }, (_, i) => attempt({ id: `a${i}` }));
        const narrowed = await reconcileUnrecognizedCollections(store(fresh).client, { now: NOW, onlyAttemptIds: ["a3"] });
        expect(narrowed.examined).toBe(1);
        expect(recognize.mock.calls[0][1].attemptId).toBe("a3");
        expect((await reconcileUnrecognizedCollections(store(fresh).client, { now: NOW, onlyAttemptIds: [] })).examined).toBe(0);
    });
});

describe("the scheduled handler", () => {
    it("nothing to reconcile is a COMPLETED occurrence", async () => {
        recognize.mockReset();
        const out = await evaluateCollectionReconciliationOccurrence({} as never, { supabase: store([]).client });
        expect(out.kind).toBe("completed");
        expect(out.diagnostic).toMatchObject({ examined: 0 });
    });

    it("an unreadable store is retryable, not 'nothing to do'", async () => {
        const out = await evaluateCollectionReconciliationOccurrence({} as never, { supabase: store([], { failRead: true }).client });
        expect(out.kind).toBe("retryable_failure");
    });

    it("is registered on the clock, scheduled system-wide, and the wake itself stays domain-free", () => {
        const root = process.cwd();
        const consumers = readFileSync(join(root, "lib/scheduledWork/scheduledWorkConsumers.ts"), "utf8");
        expect(consumers).toMatch(/registerScheduledWorkHandler\(PAYMENT_RECONCILIATION_HANDLER_KEY/);
        const migration = readFileSync(
            join(root, "../supabase/migrations/20261123160000_payment_collection_reconciliation_schedule.sql"), "utf8");
        expect(migration).toMatch(/'payments\.collection\.reconcile'/);
        expect(migration).toMatch(/'interval',\s*900/);
        const wake = readFileSync(join(root, "app/api/scheduled-work/wake/route.ts"), "utf8");
        expect(wake).not.toMatch(/reconcile|collection/i);
    });
});
