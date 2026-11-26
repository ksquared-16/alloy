/**
 * DIRECT CERTIFICATION — the second door to an enrollment decision.
 *
 * Changing an opportunity's `status_key` is an enrollment outcome. The canonical door,
 * `/api/admin/enrollment-status-transition/execute`, has required `enrollment.decide` since
 * Enrollment Record Authority V1. The `update_status` Action reaches the same mutation through the
 * generic Action executor, whose route gate is PORTAL ADMISSION — so the capability was bypassable
 * by anyone who could reach the portal.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal asserts the status write was never reached, so
 * "nothing changed" is measured rather than inferred.
 *
 * The neighbours matter here: `enrollment.record.manage` is the sibling half of the same slice and
 * must NOT substitute — keeping a record is not deciding an outcome.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { grantsSpy, writeSpy, validateSpy } = vi.hoisted(() => ({
    grantsSpy: vi.fn(),
    writeSpy: vi.fn(),
    validateSpy: vi.fn(),
}));

vi.mock("@/lib/access/actorPermissionGrants", () => ({ resolveActorPermissionGrants: grantsSpy }));
vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: writeSpy,
}));
vi.mock("@/lib/admin/actions/entryLifecycleActions", () => ({
    validateOpportunityStatusTransitionForAction: validateSpy,
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn() }));
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

import { updateStatusAction, UPDATE_STATUS_ACTION_KEY } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import { ENROLLMENT_DECIDE, ENROLLMENT_RECORD_MANAGE } from "@/lib/access/enrollmentAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";

const run = (permissionKeys: string[] | null) => {
    grantsSpy.mockResolvedValue({ permissionKeys });
    return updateStatusAction.execute!({
        supabase: {} as never,
        ctx: { orgId: ORG, userId: "user-1" },
        invocation: { entityId: LEAD, actionKey: UPDATE_STATUS_ACTION_KEY, context: {} } as never,
        payload: { status_key: "enrolled" },
    } as never);
};

beforeEach(() => {
    vi.clearAllMocks();
    // If authority passes, the transition validates and the write is attempted.
    validateSpy.mockResolvedValue({ ok: true, oldStatusKey: "waitlisted" });
    writeSpy.mockResolvedValue({ error: null });
});

describe("Action status direct — the owner is admitted", () => {
    it("a holder of enrollment.decide reaches the status write", async () => {
        const res = await run([ENROLLMENT_DECIDE]);
        expect(res.ok, `refused unexpectedly: ${JSON.stringify(res)}`).toBe(true);
        expect(writeSpy).toHaveBeenCalledTimes(1);
        // The exact target is what was asked for, not a default.
        expect(writeSpy.mock.calls[0][0]).toMatchObject({ orgId: ORG, opportunityId: LEAD, newStatusKey: "enrolled" });
    });
});

describe("Action status direct — the bypass is closed, and nothing is written", () => {
    const REFUSED: [string, string[] | null][] = [
        ["portal admission alone", ["portal.access"]],
        ["enrollment.record.manage — keeping a record is not deciding an outcome", [ENROLLMENT_RECORD_MANAGE]],
        ["work.operate", ["portal.access", "work.operate", "work.configure"]],
        ["business_process.configure — configuring a process is not deciding for a family", ["portal.access", "business_process.configure"]],
        ["a holder of every neighbouring key but this one", [
            "portal.access",
            ENROLLMENT_RECORD_MANAGE,
            "business_process.configure",
            "business_process.activate",
            "work.operate",
            "crm.customers.write",
            "enrollment.pricing.override",
        ]],
        ["no grants at all", []],
    ];

    it.each(REFUSED)("%s is refused", async (_label, keys) => {
        const res = await run(keys);
        expect(res.ok).toBe(false);
        expect((res as { status?: number }).status).toBe(403);
        expect(writeSpy, "a refusal must not reach the status write").not.toHaveBeenCalled();
        expect(validateSpy, "authority settles before the transition is even validated").not.toHaveBeenCalled();
    });

    it("a FAILED grant read denies — null is not 'no grants needed'", async () => {
        /*
         * `resolveActorPermissionGrants` returns `{ permissionKeys: null }` when the actor is
         * unidentified or the read failed. Treating that as an empty grant set would turn an
         * infrastructure failure into an open door.
         */
        const res = await run(null);
        expect(res.ok).toBe(false);
        expect((res as { status?: number }).status).toBe(403);
        expect(writeSpy).not.toHaveBeenCalled();
    });
});

describe("Action status direct — W-17 composition, no TTL", () => {
    it("granting enrollment.decide opens the next call; revoking closes it", async () => {
        // No grant row is edited and no clock advanced — each call resolves its own grants.
        expect((await run(["portal.access"])).ok).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();

        expect((await run([ENROLLMENT_DECIDE])).ok).toBe(true);
        expect(writeSpy).toHaveBeenCalledTimes(1);

        writeSpy.mockClear();
        expect((await run(["portal.access"])).ok).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
    });
});

describe("Action status direct — the tenant is the caller's, never the payload's", () => {
    it("the write is addressed with ctx.orgId", async () => {
        await run([ENROLLMENT_DECIDE]);
        expect(writeSpy.mock.calls[0][0].orgId).toBe(ORG);
        // The grant read is scoped to the same org, so a foreign org cannot lend authority.
        expect(grantsSpy.mock.calls[0][1]).toBe(ORG);
    });
});
