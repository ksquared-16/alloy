/**
 * DIRECT CERTIFICATION — the one Opportunity mutation that gained a truthful owner.
 *
 * `form-deliver` delivers a form to a household and deactivates the links it replaces. It answered
 * to `requireAdminOrOps()` — portal ADMISSION — while its sibling `form-send`, which mints the same
 * link for the same record, has required `forms.submissions` since the Forms slice.
 *
 * The sharpest case here is the LEGACY one: a principal holding `crm.opportunities.write` is
 * refused. That key is registered unenforced and this proves it confers nothing — which is the whole
 * claim of the product-status census, asserted against a running handler rather than a document.
 *
 * `crm.customers.write` is refused for a different reason worth keeping separate: it is a real,
 * live authority over CONTACTS, and it must not become a back door to Lead-adjacent operations.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy, mockPortal } = vi.hoisted(() => ({
    mockCtx: vi.fn(), mockAccess: vi.fn(), fromSpy: vi.fn(), mockPortal: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: mockPortal, requireAdmin: mockPortal };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));

import { POST as FORM_DELIVER } from "@/app/api/admin/opportunities/[id]/form-deliver/route";
import { FORMS_SUBMISSIONS } from "@/lib/access/formsAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "33333333-3333-4333-8333-333333333333";

/*
 * ctx carries permissionKeys because requireFormsCapability reads them from ctx, not from the
 * access bundle — read from the helper's own signature rather than assumed.
 */
const ctxWith = (permissionKeys: string[], role = "ops") =>
    ({ ok: true as const, orgId: ORG, userId: "u1", role, permissionKeys });

function installClient() {
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => {
        const b: Record<string, unknown> = {};
        const chain = () => b;
        Object.assign(b, {
            select: chain, eq: chain, order: chain, limit: chain, is: chain,
            maybeSingle: async () => ({ data: { id: OPP, org_id: ORG }, error: null }),
            single: async () => ({ data: { id: OPP, org_id: ORG }, error: null }),
            update: () => ({ eq: chain, select: () => ({ single: async () => ({ data: { id: OPP }, error: null }) }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: OPP }, error: null }) }) }),
        });
        return b;
    });
}

const deliver = () =>
    FORM_DELIVER(
        new NextRequest(`http://localhost/api/admin/opportunities/${OPP}/form-deliver`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            /*
             * channel "link" needs no recipient and reaches nobody — the payload is read from the
             * handler's own validation rather than guessed. An email/sms payload with no recipients
             * 400s, which would let the ADMITTED case pass without ever clearing the gate.
             */
            body: JSON.stringify({
                form_definition_id: "44444444-4444-4444-8444-444444444444",
                channel: "link",
            }),
        }),
        { params: Promise.resolve({ id: OPP }) },
    );

beforeEach(() => {
    mockPortal.mockResolvedValue(null); // portal admission granted; authority is under test
    mockAccess.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", permissionKeys: [], roleKeys: [] });
    installClient();
});

/** [name, permissionKeys, roleKeys-ish role, allowed] */
const PERSONAS: ReadonlyArray<readonly [string, string[], string, boolean]> = [
    ["FORMS OPERATOR",            [FORMS_SUBMISSIONS],        "ops",   true],
    ["FORMS AUTHOR only",         ["forms.author"],           "ops",   false],
    ["CRM CUSTOMER WRITER",       ["crm.customers.write"],    "ops",   false],
    ["LEGACY crm.opportunities.write", ["crm.opportunities.write"], "ops", false],
    ["WORK OPERATOR",             ["work.operate"],           "ops",   false],
    ["PORTAL ONLY",               [],                         "ops",   false],
    ["TITULAR ADMIN",             [],                         "admin", false],
];

describe("form-deliver answers to Forms authority, and to nothing else", () => {
    for (const [name, keys, role, allowed] of PERSONAS) {
        it(`${name} ${allowed ? "may" : "may NOT"} deliver a form`, async () => {
            mockCtx.mockResolvedValue(ctxWith(keys, role));
            const res = await deliver();
            if (allowed) {
                expect(res.status, `${name} holds ${FORMS_SUBMISSIONS}`).not.toBe(403);
                /*
                 * A 403 is not the only way to pass for free: if the fixture died in validation the
                 * admitted case would be "not 403" without ever reaching the handler's work.
                 */
                expect(res.status, `${name} must get past the gate, not die at 401`).not.toBe(401);
                expect(res.status, `${name} must clear validation and reach the handler`).toBeLessThan(400);
            } else {
                expect(res.status, `${name} must be refused`).toBe(403);
                expect(fromSpy, "a refusal must reach no client").not.toHaveBeenCalled();
            }
        });
    }

    it("the legacy Opportunity key confers nothing — the census claim, asserted against the handler", async () => {
        mockCtx.mockResolvedValue(ctxWith(["crm.opportunities.read", "crm.opportunities.write"], "admin"));
        const res = await deliver();
        expect(res.status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("holding every OTHER live authority still does not deliver a form", async () => {
        mockCtx.mockResolvedValue(ctxWith(
            ["crm.customers.write", "work.operate", "work.configure", "fields.manage",
             "layouts.manage", "ops.workflows.write", "tours.book", "ai.enrichment.use"], "ops"));
        const res = await deliver();
        expect(res.status, "forms.submissions is the only key that opens this door").toBe(403);
    });
});
