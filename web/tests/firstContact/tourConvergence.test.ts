import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    associate: vi.fn(async () => ({ associated: true, task_id: "t1", outcome_key: "left_message" })),
    db: null as unknown as SupabaseClient,
}));
vi.mock("@/lib/lifecycle/associateOutboundCommunicationToContactAttempt", () => ({ associateOutboundCommunicationToContactAttempt: m.associate }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => m.db }));
vi.mock("@/lib/admin/getAdminAccessContext", () => ({ getAdminAccessContextCached: async () => ({ ok: true }) }));
vi.mock("@/lib/access/workflowAuthority", () => ({ requireWorkflowConfigurationCapability: () => null }));
vi.mock("@/lib/admin/getAdminContext", () => ({ getAdminContextCached: async () => ({ ok: true, orgId: "o" }), adminContextFailureResponse: () => null }));
vi.mock("@/lib/admin/assertRowOrg", () => ({ assertRowOrg: async () => ({ ok: true }) }));

import { reconcileContactAttemptOnProviderAcceptance } from "@/lib/communications/contactAttemptOnProviderAcceptance";
import { resolveChildProcessStageKey, resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";
import { PUT as putConditions } from "@/app/api/admin/workflows/[id]/conditions/route";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, opts: { insertError?: string } = {}) {
    const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
    const db = {
        writes,
        from(table: string) {
            const rows = (tables[table] ??= []);
            const filters: Array<(r: Row) => boolean> = [];
            let op: "select" | "update" | "insert" | "delete" = "select";
            let payload: Row | Row[] | null = null;
            const apply = () => {
                const hit = rows.filter((r) => filters.every((f) => f(r)));
                if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); writes.push({ table, op, payload }); return hit; }
                if (op === "delete") { for (const r of hit) rows.splice(rows.indexOf(r), 1); writes.push({ table, op }); return hit; }
                if (op === "insert") {
                    if (opts.insertError) return null;
                    const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
                    const ins = list.map((r, i) => ({ id: `new-${i}`, ...r }));
                    rows.push(...ins); writes.push({ table, op, payload: list }); return ins;
                }
                return hit;
            };
            const b = {
                select: () => b,
                update: (p: Row) => ((op = "update"), (payload = p), b),
                insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), b),
                delete: () => ((op = "delete"), b),
                eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
                in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
                is: (c: string, v: unknown) => (filters.push((r) => (c === "metadata->contact_attempt_association" ? ((r.metadata as Row) ?? {}).contact_attempt_association == null : r[c] === v)), b),
                maybeSingle: async () => ({ data: apply()?.[0] ?? null, error: null }),
                then: (res: (x: { data: unknown; error: unknown }) => unknown) => {
                    const data = apply();
                    return res(data === null ? { data: null, error: { message: opts.insertError } } : { data, error: null });
                },
            };
            return b;
        },
    };
    return db;
}

const msg = (status: string, extra: Row = {}) => ({
    id: "m1", org_id: "o", direction: "outbound", channel: "sms", status, provider_message_id: status === "sent" ? "SM123" : null,
    metadata: { work_consequence: "contact_family_work", opportunity_id: "l1", author_user_id: "u1" }, ...extra,
});

beforeEach(() => m.associate.mockClear());

describe("first contact = provider acceptance", () => {
    it("a message the provider accepted becomes the contact attempt — once", async () => {
        const db = fakeDb({ communication_messages: [msg("sent")] });
        const first = await reconcileContactAttemptOnProviderAcceptance({ supabase: db as unknown as SupabaseClient, messageId: "m1" });
        expect(first).toMatchObject({ state: "associated", task_id: "t1" });
        const again = await reconcileContactAttemptOnProviderAcceptance({ supabase: db as unknown as SupabaseClient, messageId: "m1" });
        expect(again.state).toBe("already_associated");
        expect(m.associate).toHaveBeenCalledTimes(1);
    });

    it("a provider REJECTION (Twilio 400) records nothing — the work stays open", async () => {
        const db = fakeDb({ communication_messages: [msg("failed")] });
        const r = await reconcileContactAttemptOnProviderAcceptance({ supabase: db as unknown as SupabaseClient, messageId: "m1" });
        expect(r).toEqual({ state: "not_accepted", status: "failed" });
        expect(m.associate).not.toHaveBeenCalled();
    });

    it("queued inside Alloy is not provider acceptance", async () => {
        const db = fakeDb({ communication_messages: [msg("queued")] });
        expect((await reconcileContactAttemptOnProviderAcceptance({ supabase: db as unknown as SupabaseClient, messageId: "m1" })).state).toBe("pending_provider_acceptance");
        expect(m.associate).not.toHaveBeenCalled();
    });

    it("a send that declared no contact work is never counted", async () => {
        const db = fakeDb({ communication_messages: [msg("sent", { metadata: { opportunity_id: "l1", author_user_id: "u1" } })] });
        expect((await reconcileContactAttemptOnProviderAcceptance({ supabase: db as unknown as SupabaseClient, messageId: "m1" })).state).toBe("not_applicable");
    });
});

describe("child presentation follows the configured grain", () => {
    it("before Decision a child rides the FAMILY stage — a Tour family's child reads Tour, not New Lead", () => {
        expect(resolveChildProcessStageKey({ dispositionKey: "new_inquiry", familyStageKey: "tour" })).toBe("tour");
        expect(resolveChildProcessStageLabel({ dispositionKey: "new_inquiry", familyStageKey: "tour" })).toBe("Tour");
    });
    it("a child-grain status still wins (Waitlist is the child's own)", () => {
        expect(resolveChildProcessStageKey({ dispositionKey: "waitlisted", familyStageKey: "tour" })).toBe("waitlist");
    });
    it("with no family stage known, an intake status still reads Lead", () => {
        expect(resolveChildProcessStageKey({ dispositionKey: "new_inquiry" })).toBe("lead");
    });
});

describe("workflow conditions persist in the columns the table has", () => {
    const put = (body: unknown) =>
        putConditions(new NextRequest("http://x/api", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "wf-1" }) });

    it("stores field / operator / text value — and replaces the previous set", async () => {
        const db = fakeDb({ workflow_conditions: [{ id: "old-1", workflow_id: "wf-1", field: "x", operator: "eq", value: "1" }] });
        m.db = db as unknown as SupabaseClient;
        const res = await put({ conditions: [{ field_path: "new_family", operator: "eq", value: true }] });
        expect(res.status).toBe(200);
        const insert = db.writes.find((w) => w.op === "insert");
        expect(insert?.payload).toEqual([{ workflow_id: "wf-1", org_id: "o", field: "new_family", operator: "eq", value: "true" }]);
        // The previous set is replaced only after the new one is stored.
        expect(db.writes.map((w) => w.op)).toEqual(["insert", "delete"]);
    });

    it("a failed insert is reported and leaves the existing conditions intact", async () => {
        const db = fakeDb({ workflow_conditions: [{ id: "old-1", workflow_id: "wf-1", field: "x", operator: "eq", value: "1" }] }, { insertError: "column does not exist" });
        m.db = db as unknown as SupabaseClient;
        const res = await put({ conditions: [{ field_path: "new_family", operator: "eq", value: true }] });
        expect(res.status).toBe(400);
        expect(db.writes.some((w) => w.op === "delete")).toBe(false);
    });
});
