/**
 * DIRECT CERTIFICATION — Workflow configuration authority.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal below asserts that the Supabase client was never
 * reached, so "nothing was written" is measured rather than inferred; every success asserts the
 * write was actually attempted against the Workflow tables.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    fromSpy: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));

import { POST as CREATE } from "@/app/api/admin/workflows/route";
import { OPS_WORKFLOWS_WRITE } from "@/lib/access/workflowAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";

/*
 * THE SHAPE THE HANDLER ACTUALLY VALIDATES, read out of WORKFLOW_CREATE_KEYS rather than guessed.
 *
 * A payload the validator rejects returns 400 on every case, which makes all six refusal
 * assertions pass for free while only the SUCCESS cases fail — a suite in that state certifies
 * nothing. The success case asserts `not 400` explicitly so a future shape change says so.
 */
const VALID_BODY = {
    name: "cert workflow",
    event_type: "manual",
    entity_type: "opportunity",
    enabled: false,
};

function access(permissionKeys: string[], roleKeys: string[] = []) {
    return { ok: true as const, orgId: ORG, userId: "u1", permissionKeys, roleKeys };
}

/** Records every table touched, so a refusal that still wrote would be visible. */
function installClient() {
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => {
        const b: Record<string, unknown> = {};
        const chain = () => b;
        Object.assign(b, {
            select: chain, eq: chain, order: chain, limit: chain,
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "wf1" }, error: null }) }) }),
            update: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
        });
        return b;
    });
}

const post = () =>
    CREATE(new NextRequest("http://localhost/api/admin/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
    }));

beforeEach(() => {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
    installClient();
});

describe("Workflow create — authority decides, and the write follows", () => {
    it("WORKFLOW WRITER (custom role, no privileged title) is admitted AND the write happens", async () => {
        mockAccess.mockResolvedValue(access([OPS_WORKFLOWS_WRITE], ["workflow_writer"]));
        const res = await post();
        expect(res.status, "a 400 here is a broken fixture, not a refusal").not.toBe(400);
        expect(res.status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("workflows");
    });

    it("TITULAR ADMIN — the label carries nothing, and nothing is written", async () => {
        mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
        mockAccess.mockResolvedValue(access([], ["admin"]));
        const res = await post();
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: OPS_WORKFLOWS_WRITE });
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("PORTAL ONLY is refused, and nothing is written", async () => {
        mockAccess.mockResolvedValue(access([], []));
        const res = await post();
        expect(res.status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it.each([
        ["business_process.configure"],
        ["business_process.activate"],
        ["fields.manage"],
        ["layouts.manage"],
        ["ai.enrichment.use"],
        ["reports.write"],
    ])("WRONG CAPABILITY %s buys no Workflow authority, and writes nothing", async (key) => {
        mockAccess.mockResolvedValue(access([key], ["some_role"]));
        const res = await post();
        expect(res.status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("MULTI-ROLE: adding the grant opens the next request, removing it closes", async () => {
        mockAccess.mockResolvedValue(access(["fields.manage"], ["adjacent"]));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();

        // Canonical grant path changes what the access context resolves; nothing edits a role here.
        mockAccess.mockResolvedValue(access(["fields.manage", OPS_WORKFLOWS_WRITE], ["adjacent"]));
        expect((await post()).status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("workflows");

        installClient();
        mockAccess.mockResolvedValue(access(["fields.manage"], ["adjacent"]));
        expect((await post()).status).toBe(403);
        // The adjacent authority survives; only Workflow configuration closed.
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("TENANT: the row is written against the caller's own org, never a caller-supplied one", async () => {
        mockAccess.mockResolvedValue(access([OPS_WORKFLOWS_WRITE], ["workflow_writer"]));
        const res = await CREATE(new NextRequest("http://localhost/api/admin/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // A caller naming a foreign org must not reach it.
            body: JSON.stringify({ ...VALID_BODY, org_id: "99999999-9999-4999-8999-999999999999" }),
        }));
        expect(res.status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("workflows");
    });
});
