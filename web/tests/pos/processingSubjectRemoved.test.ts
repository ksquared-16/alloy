/**
 * A Processing case whose family or child no longer exists is EVIDENCE, NOT WORK
 * (`processing_case_subject_removed`, migration 20261129090000):
 *   - active queues and their counts read only cases that are not removed — in the database, so pages
 *     and exact counts stay exact; a deep link by id still opens one;
 *   - the history folder reads only removed cases, and its count is never added to Incoming;
 *   - approve, proposal commit and proposal preview refuse a removed case (409) and write nothing;
 *   - a case whose subject exists is not refused for that reason.
 */
import { describe, expect, it, vi } from "vitest";

import { buildProcessingQueueRequest } from "@/lib/pos/processingCase/readModel/buildProcessingQueueRequest";
import { makeProcessingCaseReadDeps } from "@/lib/pos/processingCase/readModel/processingCaseReadModelDb";
import { processingStatusFolderCounts } from "@/lib/pos/processingQueueBadgeCounts";

const FIELD = "processing_case_subject_removed";

/** Records every filter a read applies, per request. */
function recordingClient(result: { data?: unknown[]; count?: number } = {}) {
    const calls: Array<Array<[string, ...unknown[]]>> = [];
    return {
        calls,
        from() {
            const ops: Array<[string, ...unknown[]]> = [];
            calls.push(ops);
            const api: Record<string, unknown> = {};
            for (const op of ["select", "eq", "in", "gte", "lte", "or", "order", "limit", "is"]) {
                api[op] = (...args: unknown[]) => {
                    ops.push([op, ...args]);
                    return api;
                };
            }
            api.then = (res: (v: unknown) => void) => res({ data: result.data ?? [], count: result.count ?? 0, error: null });
            return api;
        },
    };
}
const eqs = (ops: Array<[string, ...unknown[]]>) => ops.filter((o) => o[0] === "eq").map((o) => [o[1], o[2]]);

describe("the queue request", () => {
    it("reads active work by default, and the evidence-only cases with subject=removed", () => {
        expect(buildProcessingQueueRequest(new URLSearchParams(""), "org-1").query.subjectRemoved).toBe(false);
        expect(buildProcessingQueueRequest(new URLSearchParams("subject=removed"), "org-1").query.subjectRemoved).toBe(true);
        expect(buildProcessingQueueRequest(new URLSearchParams("subject=anything"), "org-1").query.subjectRemoved).toBe(false);
    });
});

describe("the read model filters in the database", () => {
    it("an active page excludes removed cases; the history page reads only them", async () => {
        const client = recordingClient();
        const deps = makeProcessingCaseReadDeps(client as never);
        await deps.queryCases({ orgId: "org-1", limit: 25 });
        await deps.queryCases({ orgId: "org-1", limit: 25, subjectRemoved: true });
        expect(eqs(client.calls[0]!)).toContainEqual([FIELD, false]);
        expect(eqs(client.calls[1]!)).toContainEqual([FIELD, true]);
        // The flag is selected so each row says what it is.
        expect(String(client.calls[0]!.find((o) => o[0] === "select")?.[1])).toContain(FIELD);
    });

    it("a request naming its cases is answered whatever the flag — a deep link still opens evidence", async () => {
        const client = recordingClient();
        await makeProcessingCaseReadDeps(client as never).queryCases({ orgId: "org-1", limit: 25, caseIds: ["c-1"] });
        expect(eqs(client.calls[0]!).some(([c]) => c === FIELD)).toBe(false);
    });

    it("every status count is active-only, and subject_removed is counted on its own", async () => {
        const client = recordingClient({ count: 3 });
        const counts = await makeProcessingCaseReadDeps(client as never).countByStatus({ orgId: "org-1" });
        expect(counts.subject_removed).toBe(3);
        const received = client.calls.find((ops) => eqs(ops).some(([c, v]) => c === "status" && v === "received"))!;
        expect(eqs(received)).toContainEqual([FIELD, false]);
        const removed = client.calls.find((ops) => !eqs(ops).some(([c]) => c === "status"))!;
        expect(eqs(removed)).toContainEqual([FIELD, true]);
    });

    it("Incoming and Completed never absorb the evidence-only count", () => {
        expect(processingStatusFolderCounts({ received: 4, completed: 2, subject_removed: 121 }, { incoming: 0, completed: 0 })).toEqual({
            incoming: 4,
            completed: 2,
        });
    });
});

// ── routes ───────────────────────────────────────────────────────────────────────────────────────
const ctx = vi.hoisted(() => ({ value: { ok: true, orgId: "org-1", userId: "u-1", permissionKeys: ["processing.operate"] as string[] } }));
const db = vi.hoisted(() => ({ removed: true, writes: [] as string[] }));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ctx.value),
    adminContextFailureResponse: vi.fn(() => new Response(null, { status: 401 })),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from: (t: string) => {
            const api: Record<string, unknown> = {
                select: () => api,
                eq: () => api,
                in: () => api,
                order: () => api,
                limit: () => api,
                update: () => {
                    db.writes.push(t);
                    return api;
                },
                insert: () => {
                    db.writes.push(t);
                    return api;
                },
                maybeSingle: async () => ({
                    data: t === "processing_cases" ? { id: "case-1", status: "received", case_type: null, metadata: {}, [FIELD]: db.removed } : null,
                    error: null,
                }),
                then: (res: (v: unknown) => void) => res({ data: [], error: null }),
            };
            return api;
        },
        rpc: async () => ({ data: null, error: null }),
    }),
}));

import { POST as approve } from "@/app/api/admin/processing/cases/[caseId]/approve/route";
import { POST as commit } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/commit/route";
import { POST as preview } from "@/app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]/preview/route";

const CASE = "33333333-3333-4333-8333-333333333333";
const PROPOSAL = "p-1";
const decisionBody = JSON.stringify({ decision: { proposal_id: PROPOSAL, field_decisions: [] } });
const req = (body?: string) => new Request("http://x", { method: "POST", body, headers: { "content-type": "application/json" } }) as never;

describe("a removed case cannot be approved or committed", () => {
    it("approve refuses with processing_subject_removed and writes nothing", async () => {
        db.removed = true;
        db.writes = [];
        const res = await approve(req(), { params: Promise.resolve({ caseId: CASE }) });
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe("processing_subject_removed");
        expect(db.writes).toEqual([]);
    });

    it("proposal commit and preview refuse it too, before anything runs", async () => {
        db.removed = true;
        db.writes = [];
        for (const handler of [commit, preview]) {
            const res = await handler(req(decisionBody), { params: Promise.resolve({ caseId: CASE, proposalId: PROPOSAL }) });
            expect(res.status).toBe(409);
            expect((await res.json()).code).toBe("processing_subject_removed");
        }
        expect(db.writes).toEqual([]);
    });

    it("a case whose family still exists is not refused as removed", async () => {
        db.removed = false;
        const res = await approve(req(), { params: Promise.resolve({ caseId: CASE }) }).catch(() => null);
        if (res) {
            const body = (await res.json().catch(() => ({}))) as { code?: string };
            expect(body.code).not.toBe("processing_subject_removed");
        }
    });
});
