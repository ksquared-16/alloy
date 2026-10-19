/**
 * APPROVING A CASE REQUIRES PROCESSING AUTHORITY — for every case, not only lead intake.
 *
 * The check sat inside the form-submission branch, so a packet case (every Enrollment paperwork case)
 * could be completed by any admin session without `processing.operate`, which commit, preview and reject
 * all require. A session without it is now refused before the case is even read.
 */
import { describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ value: { ok: true, orgId: "org-1", userId: "u-1", permissionKeys: [] as string[] } }));
const reads = vi.hoisted(() => ({ tables: [] as string[] }));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ctx.value),
    adminContextFailureResponse: vi.fn(() => new Response(null, { status: 401 })),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from: (t: string) => {
            reads.tables.push(t);
            const api: Record<string, unknown> = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: { id: "case-1", status: "received", case_type: null, metadata: {} }, error: null }) };
            return api;
        },
    }),
}));

import { POST } from "@/app/api/admin/processing/cases/[caseId]/approve/route";

const CASE = "33333333-3333-4333-8333-333333333333";
describe("approve", () => {
    it("refuses an admin session without processing.operate, before reading the case", async () => {
        ctx.value = { ...ctx.value, permissionKeys: ["crm.read"] };
        reads.tables = [];
        const res = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ caseId: CASE }) });
        expect(res.status).toBe(403);
        expect(reads.tables).toEqual([]);
    });
});
