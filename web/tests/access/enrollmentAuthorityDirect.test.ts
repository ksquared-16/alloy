/**
 * DIRECT CERTIFICATION — Enrollment record and decision authority (Slice 1).
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal below asserts that the service or the Supabase
 * client was never reached, so "nothing was written" is measured rather than inferred; every
 * success asserts the write was actually attempted.
 *
 * The personas are the ones the Director's matrix names, and the two diagonals are the point: a
 * Record Manager must be able to keep the record and must NOT be able to decide the outcome, and a
 * Decision Manager the reverse. A suite that only proved "grant works, no grant fails" would pass
 * just as well with one collapsed key, which is the model this slice exists to refuse.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, mockParticipationEdit, mockCancelAgreement, fromSpy } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    mockParticipationEdit: vi.fn(),
    mockCancelAgreement: vi.fn(),
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
vi.mock("@/lib/childcareOperational/applyChildParticipationEdit", () => ({
    applyChildParticipationEdit: mockParticipationEdit,
}));
vi.mock("@/lib/childcareOperational/enrollmentAgreementService", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/childcareOperational/enrollmentAgreementService")
    >("@/lib/childcareOperational/enrollmentAgreementService");
    return { ...actual, cancelAgreementBeforeStart: mockCancelAgreement };
});

import { POST as PARTICIPATION } from "@/app/api/admin/child-participation/route";
import { POST as CANCEL_AGREEMENT } from "@/app/api/admin/child-enrollment-agreements/[id]/cancel/route";
import { PATCH as LEAD_LOCATION } from "@/app/api/admin/opportunities/[id]/lead-location/route";
import { PATCH as OCM_PATCH } from "@/app/api/admin/opportunity-customer-members/[id]/route";
import { ENROLLMENT_DECIDE, ENROLLMENT_RECORD_MANAGE } from "@/lib/access/enrollmentAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const HOME_SITE = "44444444-4444-4444-8444-444444444444";
const FOREIGN_SITE = "55555555-5555-4555-8555-555555555555";

/** A resolved access context holding exactly these keys, scoped to everything unless told otherwise. */
function principal(
    permissionKeys: string[],
    scope: { siteScope?: "all" | "restricted"; allowedSiteLocationIds?: string[] | null } = {},
) {
    return {
        ok: true as const,
        userId: "user-1",
        orgId: ORG,
        roleKeys: [],
        permissionKeys,
        departmentScope: "all" as const,
        allowedDepartmentIds: null,
        siteScope: scope.siteScope ?? ("all" as const),
        allowedSiteLocationIds: scope.allowedSiteLocationIds ?? null,
    };
}

/*
 * THE PERSONAS. Each is defined by GRANTS, never by a role title — `roleKeys` is empty on every
 * one of them, including the titular admin, which is the whole point of that case.
 */
const RECORD_MANAGER = () => principal([ENROLLMENT_RECORD_MANAGE]);
const DECISION_MANAGER = () => principal([ENROLLMENT_DECIDE]);
const COMPOSED = () => principal([ENROLLMENT_RECORD_MANAGE, ENROLLMENT_DECIDE]);
const PORTAL_ONLY = () => principal(["portal.access"]);
/** A role NAMED for enrollment that holds nothing. Labels are not authority. */
const TITULAR_ADMIN = () => ({ ...principal(["portal.access"]), roleKeys: ["admin", "enrollment_admin"] });
const BUSINESS_PROCESS_CONFIGURER = () =>
    principal(["portal.access", "business_process.configure", "business_process.activate"]);
const WORK_OPERATOR = () => principal(["portal.access", "work.operate", "work.configure"]);
const CRM_CUSTOMER_WRITER = () =>
    principal(["portal.access", "crm.customers.write", "crm.customers.read"]);
/** Holds BOTH inert legacy Opportunity pairs and nothing else. */
const LEGACY_OPPORTUNITY_HOLDER = () =>
    principal([
        "portal.access",
        "crm.opportunities.read",
        "crm.opportunities.write",
        "ops.opportunities.read",
        "ops.opportunities.write",
    ]);

const participationReq = () =>
    new NextRequest("http://localhost/api/admin/child-participation", {
        method: "POST",
        body: JSON.stringify({ customer_member_id: "cm-1", patch: { notes: "x" } }),
    });

const cancelReq = () =>
    new NextRequest("http://localhost/api/admin/child-enrollment-agreements/agr-1/cancel", {
        method: "POST",
    });
const cancelCtx = { params: Promise.resolve({ id: "agr-1" }) };

beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "user-1", role: "admin" });
    mockParticipationEdit.mockResolvedValue({ ok: true, routed: "operational" });
    mockCancelAgreement.mockResolvedValue({ id: "agr-1", status: "canceled" });
    fromSpy.mockImplementation(() => {
        throw new Error("supabase must not be reached on a refusal");
    });
});

describe("Enrollment direct — the RECORD MANAGER diagonal", () => {
    it("CAN keep the enrollment record", async () => {
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        const res = await PARTICIPATION(participationReq());
        expect(res.status).toBe(200);
        expect(mockParticipationEdit).toHaveBeenCalledTimes(1);
    });

    it("CANNOT decide the outcome — and the agreement service is never reached", async () => {
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        const res = await CANCEL_AGREEMENT(cancelReq(), cancelCtx);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_DECIDE });
        expect(mockCancelAgreement).not.toHaveBeenCalled();
    });
});

describe("Enrollment direct — the DECISION MANAGER diagonal", () => {
    it("CAN decide the outcome", async () => {
        mockAccess.mockResolvedValue(DECISION_MANAGER());
        const res = await CANCEL_AGREEMENT(cancelReq(), cancelCtx);
        expect(res.status).toBe(200);
        expect(mockCancelAgreement).toHaveBeenCalledTimes(1);
    });

    it("CANNOT keep the record — and the edit service is never reached", async () => {
        mockAccess.mockResolvedValue(DECISION_MANAGER());
        const res = await PARTICIPATION(participationReq());
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_RECORD_MANAGE });
        expect(mockParticipationEdit).not.toHaveBeenCalled();
    });
});

describe("Enrollment direct — COMPOSED holds both", () => {
    it("does both, and each reaches its own service", async () => {
        mockAccess.mockResolvedValue(COMPOSED());
        expect((await PARTICIPATION(participationReq())).status).toBe(200);
        expect((await CANCEL_AGREEMENT(cancelReq(), cancelCtx)).status).toBe(200);
        expect(mockParticipationEdit).toHaveBeenCalledTimes(1);
        expect(mockCancelAgreement).toHaveBeenCalledTimes(1);
    });
});

describe("Enrollment direct — who is refused, and why", () => {
    const REFUSED: [string, () => ReturnType<typeof principal>][] = [
        ["portal admission alone (D3)", PORTAL_ONLY],
        ["a role TITLED for enrollment holding no grant", TITULAR_ADMIN as never],
        ["a Business Process configurer", BUSINESS_PROCESS_CONFIGURER],
        ["a Work operator", WORK_OPERATOR],
        ["a CRM customer writer", CRM_CUSTOMER_WRITER],
        ["a holder of both inert legacy Opportunity pairs", LEGACY_OPPORTUNITY_HOLDER],
    ];

    it.each(REFUSED)("%s cannot keep the enrollment record", async (_label, who) => {
        mockAccess.mockResolvedValue(who());
        const res = await PARTICIPATION(participationReq());
        expect(res.status).toBe(403);
        expect(mockParticipationEdit).not.toHaveBeenCalled();
    });

    it.each(REFUSED)("%s cannot decide the outcome", async (_label, who) => {
        mockAccess.mockResolvedValue(who());
        const res = await CANCEL_AGREEMENT(cancelReq(), cancelCtx);
        expect(res.status).toBe(403);
        expect(mockCancelAgreement).not.toHaveBeenCalled();
    });
});

/*
 * LEAD LOCATION — authority AND destination scope.
 *
 * The chain the handler drives: assertRowOrg(opportunities) -> the scope assert's own
 * opportunities read -> locations lookup for the destination -> locationAllowedUnderSiteScope's
 * locations walk -> update. `locationAllowedUnderSiteScope` is NOT mocked: it is the repair under
 * certification, so it runs for real against the rows below.
 */
function leadLocationSupabase(opts: { leadSite: string; updateSpy: (patch: unknown) => void }) {
    return (table: string) => {
        if (table === "opportunities") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: LEAD, org_id: ORG, work_unit_id: null, location_id: opts.leadSite },
                                error: null,
                            }),
                        }),
                        maybeSingle: async () => ({
                            data: { id: LEAD, org_id: ORG, work_unit_id: null, location_id: opts.leadSite },
                            error: null,
                        }),
                    }),
                }),
                update: (patch: unknown) => {
                    opts.updateSpy(patch);
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            };
        }
        if (table === "locations") {
            return {
                select: () => ({
                    eq: (_c: string, id: string) => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                // Every location here IS a site, so the walk terminates at itself.
                                data: { id, location_type: "site", parent_location_id: null },
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        }
        throw new Error(`unexpected table ${table}`);
    };
}

describe("Enrollment direct — Lead location: authority, then destination scope", () => {
    const req = (destination: string) =>
        new NextRequest(`http://localhost/api/admin/opportunities/${LEAD}/lead-location`, {
            method: "PATCH",
            body: JSON.stringify({ location_id: destination }),
        });
    const routeCtx = { params: Promise.resolve({ id: LEAD }) };

    it("a principal without enrollment.record.manage is refused before any read", async () => {
        mockAccess.mockResolvedValue(PORTAL_ONLY());
        const res = await LEAD_LOCATION(req(HOME_SITE), routeCtx);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_RECORD_MANAGE });
    });

    it("a site-restricted holder MAY move a lead to a site they hold", async () => {
        const updateSpy = vi.fn();
        fromSpy.mockImplementation(leadLocationSupabase({ leadSite: HOME_SITE, updateSpy }));
        mockAccess.mockResolvedValue(
            principal([ENROLLMENT_RECORD_MANAGE], {
                siteScope: "restricted",
                allowedSiteLocationIds: [HOME_SITE],
            }),
        );
        const res = await LEAD_LOCATION(req(HOME_SITE), routeCtx);
        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith({ location_id: HOME_SITE });
    });

    it("the SAME holder may NOT move it to a site outside their scope, and the lead is unchanged", async () => {
        const updateSpy = vi.fn();
        fromSpy.mockImplementation(leadLocationSupabase({ leadSite: HOME_SITE, updateSpy }));
        mockAccess.mockResolvedValue(
            principal([ENROLLMENT_RECORD_MANAGE], {
                siteScope: "restricted",
                allowedSiteLocationIds: [HOME_SITE],
            }),
        );
        const res = await LEAD_LOCATION(req(FOREIGN_SITE), routeCtx);
        expect(res.status).toBe(400);
        // THE DEFECT THIS CLOSES: before the repair this returned 200 and moved the lead.
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("an unrestricted holder is unaffected — the repair narrows nobody who was already allowed", async () => {
        const updateSpy = vi.fn();
        fromSpy.mockImplementation(leadLocationSupabase({ leadSite: HOME_SITE, updateSpy }));
        mockAccess.mockResolvedValue(principal([ENROLLMENT_RECORD_MANAGE]));
        const res = await LEAD_LOCATION(req(FOREIGN_SITE), routeCtx);
        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith({ location_id: FOREIGN_SITE });
    });
});

describe("Enrollment direct — tenant isolation", () => {
    it("a principal resolved into another organization cannot reach this one's record", async () => {
        // The access context and the org context disagree: authority is held in OTHER_ORG.
        mockCtx.mockResolvedValue({ ok: true, orgId: OTHER_ORG, userId: "user-1", role: "admin" });
        mockAccess.mockResolvedValue({ ...principal([ENROLLMENT_RECORD_MANAGE]), orgId: OTHER_ORG });
        const updateSpy = vi.fn();
        fromSpy.mockImplementation((table: string) => {
            if (table === "opportunities") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                    update: (p: unknown) => {
                        updateSpy(p);
                        return { eq: () => ({ eq: async () => ({ error: null }) }) };
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        });
        const res = await LEAD_LOCATION(
            new NextRequest(`http://localhost/api/admin/opportunities/${LEAD}/lead-location`, {
                method: "PATCH",
                body: JSON.stringify({ location_id: HOME_SITE }),
            }),
            { params: Promise.resolve({ id: LEAD }) },
        );
        expect(res.status).toBe(404);
        expect(updateSpy).not.toHaveBeenCalled();
    });
});

/*
 * THE CONDITIONAL OWNER, PROVEN AT RUNTIME.
 *
 * RL-25 proves the fork exists in source. This proves it DECIDES: the same handler, the same
 * principal, two bodies, two different answers. The refusal cases assert Supabase was never
 * reached; the admitted cases assert the gate was passed (not 403) and the handler went on to
 * touch the database, which is the only evidence that the fork returned the key the caller held.
 */
describe("Enrollment direct — one handler, two powers, decided by the body", () => {
    const patch = (body: unknown) =>
        OCM_PATCH(
            new NextRequest("http://localhost/api/admin/opportunity-customer-members/ocm-1", {
                method: "PATCH",
                body: JSON.stringify(body),
            }),
            { params: Promise.resolve({ id: "ocm-1" }) },
        );
    const CANDIDACY = { start_date: "2026-09-01" };
    const OUTCOME = { outcome_status_key: "enrolled" };

    it("a candidacy body needs record.manage — a Decision Manager is refused", async () => {
        mockAccess.mockResolvedValue(DECISION_MANAGER());
        const res = await patch(CANDIDACY);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_RECORD_MANAGE });
    });

    it("an OUTCOME body needs decide — a Record Manager is refused by the SAME handler", async () => {
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        const res = await patch(OUTCOME);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_DECIDE });
    });

    it("clearing an outcome is still deciding one — presence, not truthiness", async () => {
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        const res = await patch({ outcome_status_key: null });
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_DECIDE });
    });

    it("a mixed body takes the STRICTER power — record.manage is not enough", async () => {
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        const res = await patch({ ...CANDIDACY, ...OUTCOME });
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ENROLLMENT_DECIDE });
    });

    it("each holder passes the gate for its own body shape", async () => {
        const reached: string[] = [];
        fromSpy.mockImplementation((t: string) => {
            reached.push(t);
            throw new Error("stop after the gate");
        });
        mockAccess.mockResolvedValue(RECORD_MANAGER());
        await expect(patch(CANDIDACY)).rejects.toThrow("stop after the gate");
        mockAccess.mockResolvedValue(DECISION_MANAGER());
        await expect(patch(OUTCOME)).rejects.toThrow("stop after the gate");
        // Both got past authority and on to the database — neither was a 403.
        expect(reached.length).toBe(2);
    });
});

/*
 * W-17 — COMPOSITION TAKES EFFECT ON THE NEXT REQUEST.
 *
 * No grant row is edited here and no clock is advanced. Each request resolves its own access
 * context, so if authority were cached behind a TTL — or derived from a role TITLE rather than the
 * composed key set — the middle assertion would keep the previous answer. It does not.
 */
describe("Enrollment direct — W-17 composition, no TTL", () => {
    it("adding the Decision role opens the next request; removing it closes, and the record power survives", async () => {
        // Starts as a Record Manager: record yes, decision no.
        mockAccess.mockResolvedValue(principal([ENROLLMENT_RECORD_MANAGE]));
        expect((await PARTICIPATION(participationReq())).status).toBe(200);
        expect((await CANCEL_AGREEMENT(cancelReq(), cancelCtx)).status).toBe(403);
        expect(mockCancelAgreement).not.toHaveBeenCalled();

        // A Decision role is added. The very next request is admitted.
        mockAccess.mockResolvedValue(principal([ENROLLMENT_RECORD_MANAGE, ENROLLMENT_DECIDE]));
        expect((await CANCEL_AGREEMENT(cancelReq(), cancelCtx)).status).toBe(200);
        expect(mockCancelAgreement).toHaveBeenCalledTimes(1);

        // It is removed again. Closes immediately; the record power is untouched.
        mockAccess.mockResolvedValue(principal([ENROLLMENT_RECORD_MANAGE]));
        expect((await CANCEL_AGREEMENT(cancelReq(), cancelCtx)).status).toBe(403);
        expect(mockCancelAgreement).toHaveBeenCalledTimes(1);
        expect((await PARTICIPATION(participationReq())).status).toBe(200);
    });

    it("a role TITLE never substitutes for the composed key set", async () => {
        // Same empty key set, every enrollment-sounding title the product could carry.
        mockAccess.mockResolvedValue({
            ...principal(["portal.access"]),
            roleKeys: ["admin", "ops", "enrollment_admin", "school_director", "regional_lead"],
        });
        expect((await PARTICIPATION(participationReq())).status).toBe(403);
        expect((await CANCEL_AGREEMENT(cancelReq(), cancelCtx)).status).toBe(403);
        expect(mockParticipationEdit).not.toHaveBeenCalled();
        expect(mockCancelAgreement).not.toHaveBeenCalled();
    });
});
