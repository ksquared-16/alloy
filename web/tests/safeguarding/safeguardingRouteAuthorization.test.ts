/**
 * The route WIRING, not the predicate.
 *
 * `safeguardingWriteAuthority.test.ts` proves `canManageSafeguarding` refuses the right callers. It
 * cannot prove the route asks it. These call the real handlers with a stubbed access bundle, so a
 * refactor that drops either gate fails here rather than in production.
 *
 * Both gates are asserted independently, because the whole point of the conjunction is that neither
 * is sufficient: a caller holding `crm.customers.write` without owner/admin must still be refused,
 * and an owner without the capability must be refused too.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Bundle = {
    ok: boolean;
    orgId: string;
    userId: string;
    roleKeys: string[];
    permissionKeys: string[];
    portalEligible: boolean;
    status?: number;
};

let bundle: Bundle;
const serviceCalls: string[] = [];

vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    loadAdminAccessBundleCached: async () => bundle,
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/safeguarding/childSafeguardingRestrictionService", () => ({
    addChildSafeguardingRestriction: async () => {
        serviceCalls.push("add");
        return { ok: true, value: { id: "r1" } };
    },
    endChildSafeguardingRestriction: async () => {
        serviceCalls.push("end");
        return { ok: true, value: { id: "r1", status: "revoked" } };
    },
    listChildSafeguardingRestrictions: async () => {
        serviceCalls.push("list");
        return { ok: true, value: [] };
    },
}));

const { POST: addRoute, GET: listRoute } = await import(
    "@/app/api/admin/children/[childId]/safeguarding-restrictions/route"
);
const { POST: endRoute } = await import(
    "@/app/api/admin/children/[childId]/safeguarding-restrictions/[restrictionId]/end/route"
);

const CHILD = { params: Promise.resolve({ childId: "child-1" }) };
const ENDP = { params: Promise.resolve({ childId: "child-1", restrictionId: "r1" }) };

function addRequest(): NextRequest {
    return new NextRequest("http://local/api/admin/children/child-1/safeguarding-restrictions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            restriction_kind: "protective_or_restraining_order",
            operational_effect: "may_not_pick_up",
            evidence_basis: "operator_entry",
        }),
    });
}
function endRequest(): NextRequest {
    return new NextRequest("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

function asCaller(roleKeys: string[], permissionKeys: string[]): void {
    bundle = { ok: true, orgId: "org-1", userId: "user-1", roleKeys, permissionKeys, portalEligible: true };
}

const FULL = ["crm.customers.read", "crm.customers.write"];

beforeEach(() => {
    serviceCalls.length = 0;
    asCaller(["admin"], FULL);
});

describe("safeguarding route authorization", () => {
    it("an admin holding the capability may add and end", async () => {
        expect((await addRoute(addRequest(), CHILD)).status).toBe(201);
        expect((await endRoute(endRequest(), ENDP)).status).toBe(200);
        expect(serviceCalls).toEqual(["add", "end"]);
    });

    it("an owner may too — the compatibility role string cannot express owner, so the bundle is read directly", async () => {
        asCaller(["owner"], FULL);
        expect((await addRoute(addRequest(), CHILD)).status).toBe(201);
    });

    it("ops holding the capability is REFUSED the write, though it may read", async () => {
        // ops holds crm.customers.write in every organization. The capability alone must not be
        // enough to author a protective order.
        asCaller(["ops"], FULL);
        expect((await addRoute(addRequest(), CHILD)).status).toBe(403);
        expect((await endRoute(endRequest(), ENDP)).status).toBe(403);
        expect(serviceCalls, "the service must never be reached").toEqual([]);
        expect((await listRoute(new NextRequest("http://local/x"), CHILD)).status).toBe(200);
    });

    it("manager is refused even the read", async () => {
        asCaller(["manager"], FULL);
        expect((await listRoute(new NextRequest("http://local/x"), CHILD)).status).toBe(403);
        expect(serviceCalls).toEqual([]);
    });

    it("an owner WITHOUT the catalogued capability is refused", async () => {
        asCaller(["owner"], []);
        expect((await addRoute(addRequest(), CHILD)).status).toBe(403);
        expect((await endRoute(endRequest(), ENDP)).status).toBe(403);
        expect(serviceCalls).toEqual([]);
    });

    it("an unauthenticated caller never reaches either gate", async () => {
        bundle = { ok: false, status: 401 } as unknown as Bundle;
        expect((await addRoute(addRequest(), CHILD)).status).toBe(401);
        expect((await endRoute(endRequest(), ENDP)).status).toBe(401);
        expect((await listRoute(new NextRequest("http://local/x"), CHILD)).status).toBe(401);
        expect(serviceCalls).toEqual([]);
    });

    it("a caller with no roles at all is refused", async () => {
        asCaller([], FULL);
        expect((await addRoute(addRequest(), CHILD)).status).toBe(403);
        expect(serviceCalls).toEqual([]);
    });

    it("refuses a body missing the required domain fields before any write", async () => {
        const req = new NextRequest("http://local/x", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ operational_effect: "may_not_pick_up" }),
        });
        expect((await addRoute(req, CHILD)).status).toBe(400);
        expect(serviceCalls).toEqual([]);
    });
});
