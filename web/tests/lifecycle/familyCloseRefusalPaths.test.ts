/**
 * ONE FAMILY-CLOSE RULE FOR EVERY CLOSE PATH (E2E-09).
 *
 * The outcome target executor refused to close a family case with live child tracks; the command
 * paths that write `opportunities.status_key` directly did not ask. These tests drive each path
 * against a fake database holding a family with a WAITLISTED child anchored to its Enrollment
 * Participation — the certified Add Child → Waitlist shape, whose journey carries the participation
 * id, not the Opportunity id, in `context_id` — and prove the close is refused before any write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open" },
        { status_key: "closed", status_label: "Closed" },
    ]),
}));
vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({ emitStatusChangedEvent: vi.fn() }));
vi.mock("@/lib/admin/actions/entryLifecycleActions", () => ({
    validateOpportunityStatusTransitionForAction: vi.fn().mockResolvedValue({ ok: true, oldStatusKey: "open" }),
}));
vi.mock("@/lib/access/actorPermissionGrants", () => ({
    resolveActorPermissionGrants: vi.fn().mockResolvedValue({ permissionKeys: ["enrollment.decide"] }),
}));
vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue("event-1") }));

import { familyCloseRefusal, familyCaseStatusCloses } from "@/lib/lifecycle/familyCloseRefusal";
import { executeMutation } from "@/lib/mutations/runtime";
import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import { ENROLLMENT_DECIDE } from "@/lib/access/enrollmentAuthority";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

const ORG = "org-1";
const OPP = "opp-1";
const PARTICIPATION = "ocm-1";

type Rows = Record<string, Record<string, unknown>[]>;

/** A chainable fake over in-memory tables: eq / in filters, then await, maybeSingle or single. */
function fakeDb(tables: Rows, opts: { failTable?: string } = {}) {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, mutation_id: "m-1" }, error: null });
    const from = (table: string) => {
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        const result = () =>
            opts.failTable === table
                ? { data: null, error: { message: `${table} unreadable` } }
                : { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                filters.push((r) => r[col] === val);
                return builder;
            },
            in: (col: string, vals: unknown[]) => {
                filters.push((r) => vals.includes(r[col]));
                return builder;
            },
            maybeSingle: async () => {
                const r = result();
                return { data: r.data?.[0] ?? null, error: r.error };
            },
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(result()).then(resolve, reject),
        };
        return builder;
    };
    return { client: { from, rpc } as never, rpc };
}

/** A family whose one child is waitlisted on a participation-anchored journey. */
function familyWithWaitlistedChild(childState: string | null = "waitlisted"): Rows {
    return {
        opportunities: [{ id: OPP, org_id: ORG, status_key: "open" }],
        opportunity_customer_members: [{ id: PARTICIPATION, org_id: ORG, opportunity_id: OPP }],
        process_instances: [
            {
                id: "pi-1",
                org_id: ORG,
                process_key: ENROLLMENT_PROCESS_KEY,
                context_type: "enrollment_participation",
                context_id: PARTICIPATION,
                subject_id: "cust-child",
                state: childState,
            },
        ],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveActorPermissionGrants).mockResolvedValue({ permissionKeys: [ENROLLMENT_DECIDE] } as never);
});

describe("familyCloseRefusal — the shared rule", () => {
    it("only a close is asked: an open write never reads the children", async () => {
        const { client } = fakeDb({}, { failTable: "process_instances" });
        expect(familyCaseStatusCloses("open")).toBe(false);
        await expect(
            familyCloseRefusal(client, { orgId: ORG, opportunityId: OPP, targetStatusKey: "open" }),
        ).resolves.toBeNull();
    });

    it("refuses a close while a participation-anchored child is waitlisted", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild());
        const refusal = await familyCloseRefusal(client, { orgId: ORG, opportunityId: OPP, targetStatusKey: "closed" });
        expect(refusal?.blocked_reasons.map((r) => r.code)).toEqual(["child_track_active_pre_enrollment"]);
        expect(refusal?.error).toMatch(/cannot be closed while child enrollment tracks are still active/);
    });

    it("allows the close once every child track is terminal", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild("not_enrolling"));
        await expect(
            familyCloseRefusal(client, { orgId: ORG, opportunityId: OPP, targetStatusKey: "closed" }),
        ).resolves.toBeNull();
    });

    it("fails closed: an unreadable participation list is never 'no children'", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild(), { failTable: "opportunity_customer_members" });
        const refusal = await familyCloseRefusal(client, { orgId: ORG, opportunityId: OPP, targetStatusKey: "closed" });
        expect(refusal?.blocked_reasons.map((r) => r.code)).toEqual(["child_track_enumeration_failed"]);
    });
});

describe("close_lead / update_lead_status (Mutation Runtime)", () => {
    const intent = (commandKey: string, targetState: string) => ({
        commandKey,
        subjectId: OPP,
        subjectType: "opportunity",
        domain: "lead_status" as const,
        targetState,
        origin: "bos" as never,
    });

    it.each(["close_lead", "update_lead_status"])("%s refuses the close and never calls the RPC", async (key) => {
        const { client, rpc } = fakeDb(familyWithWaitlistedChild());
        const result = await executeMutation({ supabase: client, orgId: ORG } as never, intent(key, "closed"));
        expect(result.status).toBe("blocked");
        expect(result).toMatchObject({ blockedCode: "readiness_blocked" });
        expect((result as { blockedReason: string }).blockedReason).toMatch(/child enrollment tracks/);
        expect(rpc).not.toHaveBeenCalled();
    });

    it("names the refusal in the preview, before the operator confirms", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild());
        const result = await executeMutation(
            { supabase: client, orgId: ORG } as never,
            intent("close_lead", "closed"),
            { previewOnly: true },
        );
        expect(result.status).toBe("previewed");
        const gaps = (result as { preview: { readinessGaps: string[] } }).preview.readinessGaps;
        expect(gaps.join(" ")).toMatch(/child enrollment tracks/);
    });

    it("commits the close when no child track is live", async () => {
        const { client, rpc } = fakeDb(familyWithWaitlistedChild("withdrawn"));
        const result = await executeMutation({ supabase: client, orgId: ORG } as never, intent("close_lead", "closed"));
        expect(result.status).toBe("committed");
        expect(rpc).toHaveBeenCalledWith("execute_lead_status_mutation", expect.anything());
    });
});

describe("update_status (adminV2 Action)", () => {
    const deps = (client: never, status_key: string) => ({
        supabase: client,
        ctx: { orgId: ORG, userId: "user-1" },
        invocation: {
            actionKey: "update_status",
            entityType: "opportunity",
            entityId: OPP,
            context: {},
            payload: { status_key },
        },
        payload: { status_key },
    });

    it("refuses the close with a named blocker and never writes", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild());
        const result = await updateStatusAction.execute(deps(client, "closed") as never);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ status: 409 });
        expect((result as { blockers: { code: string }[] }).blockers[0]?.code).toBe("family_close_blocked");
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });

    it("writes a close with no live child", async () => {
        const { client } = fakeDb(familyWithWaitlistedChild("withdrawn"));
        const result = await updateStatusAction.execute(deps(client, "closed") as never);
        expect(result.ok).toBe(true);
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledTimes(1);
    });
});
