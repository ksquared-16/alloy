/**
 * OFFERING A SPOT IS AN OPERATOR ACT THAT STARTS WORK — NOT THE OUTCOME ITSELF.
 *
 * `offer_spot` was fully configured — declared on the Waitlist stage, holding its own work
 * definition, carrying its own outcomes — and unreachable, because nothing started it. Stage entry
 * opens the effective primary only (`review_waitlist_position`), rightly: a place is offered because
 * somebody decided to offer it, not because a date passed. Checked on the cert tenant, the Waitlist
 * stage's action list held nothing offer-shaped and no route instantiated an arbitrary template, so
 * the flow read as working until someone looked for the control.
 *
 * `stage_work.start` is that control, and it is deliberately GENERIC: the template is an input, so
 * `offer_spot` needs no capability of its own and the Process card needs no branch of its own. These
 * tests hold it to starting exactly one thing, refusing from configuration rather than from a list
 * kept in code, and deduping instead of opening a second copy.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const mockInstantiate = vi.fn();

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...a: unknown[]) => mockInstantiate(...a),
}));

vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: async () => "dept-1",
}));

import {
    stageWorkStartAction,
    resolveStageWorkStart,
    STAGE_WORK_START_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/stageWorkStartAction";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const ORG = "11111111-1111-4111-8111-111111111111";
const CHILD = "44444444-4444-4444-8444-444444444444";
const OPP = "22222222-2222-4222-8222-222222222222";

function departmentMetadata(): Record<string, unknown> {
    const process: LifecycleBuilderProcessRecord = {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        is_active: true,
        sort_order: 0,
        tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
        stages: buildEnrollmentTemplateStageRecords(),
    };
    return {
        lifecycle_builder_v1: { version: 1 as const, active_process_id: "proc-1", processes: [process] },
    };
}

type World = {
    /** The child's own stage. Null means riding the family track. */
    childStage: string | null;
    familyStage: string;
    instances: number;
};

function makeSupabase(world: World) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            const api: Record<string, unknown> = {
                select: () => api,
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    return api;
                },
                maybeSingle() {
                    if (table === "departments") {
                        return Promise.resolve({ data: { metadata: departmentMetadata() }, error: null });
                    }
                    if (table === "opportunities") {
                        return Promise.resolve({ data: { stage_key: world.familyStage }, error: null });
                    }
                    if (table === "opportunity_customer_members") {
                        return Promise.resolve({ data: { opportunity_id: OPP }, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                then(resolve: (r: { data: unknown[]; error: null }) => void) {
                    if (table === "process_instances") {
                        const rows = Array.from({ length: world.instances }, (_, i) => ({
                            id: `pi-${i}`,
                            stage_key: world.childStage,
                            context_id: OPP,
                            context_type: "enrollment_participation",
                            state: null,
                        }));
                        resolve({ data: rows, error: null });
                        return;
                    }
                    resolve({ data: [], error: null });
                },
            };
            return api;
        },
    } as never;
}

function world(over: Partial<World> = {}): World {
    return { childStage: "waitlist", familyStage: "lead", instances: 1, ...over };
}

async function resolve(w: World, templateKey = "offer_spot") {
    return resolveStageWorkStart({
        supabase: makeSupabase(w),
        orgId: ORG,
        customerMemberId: CHILD,
        templateKey,
    });
}

async function execute(w: World, templateKey = "offer_spot") {
    return stageWorkStartAction.execute!({
        supabase: makeSupabase(w),
        ctx: { orgId: ORG, userId: "user-1" },
        invocation: { actionKey: STAGE_WORK_START_ACTION_KEY, entityType: "child", entityId: CHILD },
        payload: { template_key: templateKey },
    } as never);
}

describe("stage_work.start — the control that starts configured work", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInstantiate.mockResolvedValue({ status: "created", work_id: "work-offer-1" });
    });

    it("is a registered, executable action", () => {
        expect(getRegisteredAction(STAGE_WORK_START_ACTION_KEY)).toBeTruthy();
    });

    it("starts offer_spot for a child who is actually in Waitlist", async () => {
        const res = await execute(world());
        expect(res.ok).toBe(true);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
        const args = mockInstantiate.mock.calls[0]![0];
        expect(args.stageKey).toBe("waitlist");
        expect(args.template.template_key).toBe("offer_spot");
        expect(args.opportunityId).toBe(OPP);
    });

    /**
     * The family is at Lead throughout. A child's eligibility to be offered a place is their own,
     * and reading it from the household would repeat the substitution this sprint removed.
     */
    it("does not care that the family is still Lead", async () => {
        const r = await resolve(world({ familyStage: "lead" }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.stageKey).toBe("waitlist");
    });

    it("refuses when the child has left the stage the work belongs to", async () => {
        const r = await resolve(world({ childStage: "enrolling" }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("template_not_configured_on_stage");
    });

    it("refuses a child riding the family track, whose stage is the family's", async () => {
        // childStage null → effective stage is `lead`, which configures no offer_spot.
        const r = await resolve(world({ childStage: null, familyStage: "lead" }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("template_not_configured_on_stage");
    });

    it("refuses a child with no enrollment track at all", async () => {
        const r = await resolve(world({ instances: 0 }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("no_enrollment_track");
    });

    it("refuses rather than choosing when the child has two journeys", async () => {
        const r = await resolve(world({ instances: 2 }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("ambiguous_enrollment_track");
    });

    it("refuses a template the stage does not configure", async () => {
        const r = await resolve(world(), "conduct_tour");
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("template_not_configured_on_stage");
    });

    it("requires a template — it is an input, never a default", () => {
        const v = stageWorkStartAction.validatePayload!({} as never);
        expect(v.ok).toBe(false);
    });

    /** A second click hands back the work already in progress, not a second copy of it. */
    it("dedupes on repeat, reporting the existing work as reused", async () => {
        mockInstantiate.mockResolvedValue({ status: "deduped", work_id: "work-offer-1", reason: "bp_runtime_fingerprint" });
        const res = await execute(world());
        expect(res.ok).toBe(true);
        const detail = (res as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.work_id).toBe("work-offer-1");
        expect(detail.started).toBe(false);
        expect(detail.reused_existing).toBe(true);
    });

    it("eligibility and execution agree — the button cannot appear and then refuse", async () => {
        const blocked = world({ childStage: "enrolling" });
        const eligibility = await stageWorkStartAction.resolveEligibility!({
            supabase: makeSupabase(blocked),
            ctx: { orgId: ORG, userId: "user-1" },
            invocation: { actionKey: STAGE_WORK_START_ACTION_KEY, entityType: "child", entityId: CHILD },
            payload: { template_key: "offer_spot" },
        } as never);
        expect(eligibility.eligible).toBe(false);
        const res = await execute(blocked);
        expect(res.ok).toBe(false);
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    /**
     * STARTING IS NOT DECIDING. The action opens the work and stops. Moving the stage, setting the
     * disposition and writing placement status are consequences of the OUTCOME, recorded separately.
     */
    it("starts the work and nothing else", async () => {
        await execute(world());
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/actions/definitions/stageWorkStartAction.ts"),
            "utf8",
        );
        expect(src).not.toMatch(/moveEnrollmentInstanceStageByScope/);
        expect(src).not.toMatch(/updateOpportunityCustomerMemberLifecycleStatus/);
        expect(src).not.toMatch(/applyStageOutcomeRuleTarget/);
        expect(src).not.toMatch(/placement_candidates/);
    });
});

describe("the offer control is configuration, not a card branch", () => {
    /**
     * The Process card must not ask "is this Waitlist?" and draw a button. The action resolves
     * because a capability exists, the stage makes it eligible, and a placement exposes it.
     */
    it("no Process Card component hardcodes an offer_spot branch", () => {
        const roots = [
            "components/admin/focusPanel",
            "lib/adminV2/runtime/focusPanel",
        ];
        const offenders: string[] = [];
        for (const root of roots) {
            const dir = path.join(process.cwd(), root);
            const walk = (p: string) => {
                for (const entry of require("node:fs").readdirSync(p, { withFileTypes: true })) {
                    const full = path.join(p, entry.name);
                    if (entry.isDirectory()) walk(full);
                    else if (/\.(ts|tsx)$/.test(entry.name)) {
                        const src = readFileSync(full, "utf8");
                        if (/["'`]offer_spot["'`]/.test(src)) offenders.push(full);
                    }
                }
            };
            walk(dir);
        }
        expect(offenders, `offer_spot must not be named in Process Card code: ${offenders.join(", ")}`).toEqual([]);
    });

    it("offer_spot stays a configured Waitlist template rather than platform code", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("waitlist");
        expect(plan!.work_templates.map((w) => w.template_key)).toContain("offer_spot");
        // And it is NOT the entry template — entry opens the review only.
        expect(plan!.work_templates[0]!.template_key).toBe("review_waitlist_position");
    });
});
