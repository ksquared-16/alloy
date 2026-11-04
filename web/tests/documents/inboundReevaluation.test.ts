/**
 * D10 N7 — inbound re-evaluation after a malware verdict. Synthetic: the client is a fake that records calls. The database
 * guard that backs the release is proven by certification/invariants/documents-d10-activation-gates.sql (cases 6–7).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    documentsMalwareScannerEnabled,
    evaluateInboundReevaluationOccurrence,
    reevaluateHeldInboundDocuments,
} from "@/lib/documents/malware/inboundReevaluation";
import type { ScheduledWorkContext } from "@/lib/scheduledWork/scheduledWorkTypes";

const ORG = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";

type Doc = { id: string; org_id: string; status: string; current_version_id: string | null; metadata: Record<string, unknown> };

function held(id: string, structural: "uploaded" | "quarantined", version: string | null = `v-${id}`): Doc {
    return {
        id,
        org_id: ORG,
        status: "quarantined",
        current_version_id: version,
        metadata: { screening: { malware_hold: "awaiting_verdict", structural_status: structural }, inbound_email: { communication_message_id: MSG, attachment_id: `att-${id}` } },
    };
}

function fakeDb(docs: Doc[], verdicts: Record<string, string | null>, opts: { updateError?: string; listError?: boolean } = {}) {
    const calls = { list: [] as Array<[string, unknown]>, updates: [] as Array<{ id: unknown; patch: unknown }>, rpc: [] as unknown[] };
    const db = {
        from(table: string) {
            if (table !== "documents") throw new Error(`unexpected table ${table}`);
            return {
                select() {
                    const q = {
                        eq(col: string, val: unknown) { calls.list.push([col, val]); return q; },
                        limit: async () => (opts.listError ? { data: null, error: { message: "boom" } } : { data: docs, error: null }),
                    };
                    return q;
                },
                update(patch: unknown) {
                    const filters: Record<string, unknown> = {};
                    const q = {
                        eq(col: string, val: unknown) {
                            filters[col] = val;
                            if (Object.keys(filters).length === 3) {
                                calls.updates.push({ id: filters.id, patch });
                                return Promise.resolve({ error: opts.updateError ? { message: opts.updateError } : null });
                            }
                            return q;
                        },
                    };
                    return q;
                },
            };
        },
        async rpc(name: string, args: { p_version_id: string }) {
            calls.rpc.push({ name, args });
            const v = verdicts[args.p_version_id];
            return { data: v ? [{ verdict: v, verdict_id: `verdict-${args.p_version_id}` }] : [], error: null };
        },
    };
    return { db: db as unknown as SupabaseClient, calls };
}

const okAudit = async () => ({ ok: true as const, eventId: "ev-1" });

describe("documents.inbound_attachment.reevaluate (N7)", () => {
    it("is off unless DOCUMENTS_MALWARE_SCANNER_ENABLED is explicitly set", () => {
        expect(documentsMalwareScannerEnabled({})).toBe(false);
        expect(documentsMalwareScannerEnabled({ DOCUMENTS_MALWARE_SCANNER_ENABLED: "false" })).toBe(false);
        expect(documentsMalwareScannerEnabled({ DOCUMENTS_MALWARE_SCANNER_ENABLED: "on" })).toBe(true);
    });

    it("disabled: the occurrence completes as a no-op and reads nothing", async () => {
        const { db, calls } = fakeDb([held("d1", "uploaded")], { "v-d1": "clean" });
        const ctx = { orgId: ORG } as ScheduledWorkContext;
        const out = await evaluateInboundReevaluationOccurrence(ctx, { supabase: db, enabled: false });
        expect(out.kind).toBe("completed");
        expect(calls.list).toHaveLength(0);
        expect(calls.rpc).toHaveLength(0);
    });

    it("clean + structurally clean: audit first, release, then re-file the message", async () => {
        const { db, calls } = fakeDb([held("d1", "uploaded")], { "v-d1": "clean" });
        const order: string[] = [];
        const refs: unknown[] = [];
        const res = await reevaluateHeldInboundDocuments(
            {
                supabase: db,
                enabled: true,
                audit: async (input) => { order.push(`audit:${input.event}`); expect(input.detail).toMatchObject({ reason: "malware_hold_cleared" }); return okAudit(); },
                refile: async (ref) => { order.push("refile"); refs.push(ref); return { status: "filed", outcomes: [] }; },
            },
            ORG,
        );
        expect(res).toEqual([{ documentId: "d1", outcome: "released_and_refiled" }]);
        expect(calls.updates).toEqual([{ id: "d1", patch: { status: "uploaded" } }]);
        expect(order).toEqual(["audit:document_released", "refile"]);
        expect(refs).toEqual([{ orgId: ORG, messageId: MSG }]);
        expect(calls.list).toContainEqual(["metadata->screening->>malware_hold", "awaiting_verdict"]);
        expect(calls.list).toContainEqual(["org_id", ORG]);
    });

    it("clean but structurally quarantined: stays quarantined (no release), the filing decision is re-run", async () => {
        const { db, calls } = fakeDb([held("d2", "quarantined")], { "v-d2": "clean" });
        let audited = 0;
        const res = await reevaluateHeldInboundDocuments(
            { supabase: db, enabled: true, audit: async () => { audited++; return okAudit(); }, refile: async () => ({ status: "filed", outcomes: [] }) },
            ORG,
        );
        expect(res).toEqual([{ documentId: "d2", outcome: "refiled_still_quarantined" }]);
        expect(calls.updates).toHaveLength(0);
        expect(audited).toBe(0);
    });

    it("pending, failed, infected: nothing is released or re-filed", async () => {
        const { db, calls } = fakeDb([held("p", "uploaded"), held("f", "uploaded"), held("i", "uploaded"), held("n", "uploaded", null)], { "v-f": "failed", "v-i": "infected" });
        let refiled = 0;
        const res = await reevaluateHeldInboundDocuments(
            { supabase: db, enabled: true, audit: okAudit, refile: async () => { refiled++; return { status: "filed", outcomes: [] }; } },
            ORG,
        );
        expect(res).toEqual([
            { documentId: "p", outcome: "held", reason: "pending" },
            { documentId: "f", outcome: "held", reason: "not_clean" },
            { documentId: "i", outcome: "held", reason: "not_clean" },
            { documentId: "n", outcome: "held", reason: "no_current_version" },
        ]);
        expect(calls.updates).toHaveLength(0);
        expect(refiled).toBe(0);
    });

    it("no audit, no release; a database guard refusal is reported and nothing is re-filed", async () => {
        const a = fakeDb([held("d1", "uploaded")], { "v-d1": "clean" });
        let refiled = 0;
        const noAudit = await reevaluateHeldInboundDocuments(
            { supabase: a.db, enabled: true, audit: async () => ({ ok: false as const, error: "audit_unavailable" }), refile: async () => { refiled++; return { status: "filed", outcomes: [] }; } },
            ORG,
        );
        expect(noAudit).toEqual([{ documentId: "d1", outcome: "failed", reason: "audit_unavailable" }]);
        expect(a.calls.updates).toHaveLength(0);

        const b = fakeDb([held("d1", "uploaded")], { "v-d1": "clean" }, { updateError: "document_malware_scan_pending" });
        const guarded = await reevaluateHeldInboundDocuments(
            { supabase: b.db, enabled: true, audit: okAudit, refile: async () => { refiled++; return { status: "filed", outcomes: [] }; } },
            ORG,
        );
        expect(guarded).toEqual([{ documentId: "d1", outcome: "failed", reason: "guard_refused" }]);
        expect(refiled).toBe(0);
    });

    it("a failed item makes the occurrence retryable; an unreadable list too", async () => {
        const a = fakeDb([held("d1", "uploaded")], { "v-d1": "clean" }, { updateError: "x" });
        const ctx = { orgId: ORG } as ScheduledWorkContext;
        const out = await evaluateInboundReevaluationOccurrence(ctx, { supabase: a.db, enabled: true, audit: okAudit, refile: async () => ({ status: "filed", outcomes: [] }) });
        expect(out.kind).toBe("retryable_failure");
        const b = fakeDb([], {}, { listError: true });
        expect((await evaluateInboundReevaluationOccurrence(ctx, { supabase: b.db, enabled: true })).kind).toBe("retryable_failure");
    });

    it("stays unregistered and unscheduled until activation; the production hook still has no scanner", () => {
        const consumers = readFileSync("lib/scheduledWork/scheduledWorkConsumers.ts", "utf8");
        expect(consumers).not.toMatch(/inboundReevaluation|inbound_attachment\.reevaluate/);
        const hook = readFileSync("lib/documents/inbound/inboundAttachmentHook.ts", "utf8");
        expect(hook).toMatch(/malware: UNAVAILABLE_MALWARE_SCAN/);
    });
});
