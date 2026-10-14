/**
 * E2E-09 — A FAMILY CASE CANNOT CLOSE OUT FROM UNDER ITS CHILDREN, certified against the real database.
 *
 * Every reachable close path is driven through its real implementation with a service-role client on
 * the certification stack, against QA families built by the canonical creators (Create Lead, Add
 * Child, participation, process instance). For each refused close the rows the transition could have
 * written are snapshotted BEFORE and AFTER and must be byte-identical: the claim is "refused before
 * mutation", and a response string cannot prove that.
 *
 * Families are named `ZZQA E2E09 <scenario> <run>` and are never Mygrant.
 *
 * Skips without a certification environment.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createDefaultIdentityCommandPorts } from "@/lib/pos/processingIdentity/commands/ports";
import { addChild } from "@/lib/records/addChildService";
import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import {
    createEnrollmentProcessInstance,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
    readEnrollmentInstancesForLead,
    type EnrollmentProcessState,
} from "@/lib/process/processInstances";
import { familyCloseRefusal } from "@/lib/lifecycle/familyCloseRefusal";
import { executeMutation } from "@/lib/mutations/runtime";
import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
const ORG = process.env.CERT_ENROLLMENT_ORG_ID ?? "00000000-0000-4000-8000-000000000001";
/** An operator in ORG holding `enrollment.decide`; required for the Action-runtime path. */
const ACTOR = process.env.CERT_ENROLLMENT_ACTOR_USER_ID ?? "";
const RUN = Date.now().toString(36);

type ChildSpec = { name: string; state: EnrollmentProcessState | null; anchor: "participation" | "opportunity" };
type Family = { label: string; opportunityId: string; customerId: string; children: { name: string; memberId: string; ocmId: string; instanceId: string }[] };

/** The rows a close could write, read straight from the tables. */
async function snapshot(db: SupabaseClient, f: Family) {
    const [opp, ocm, pi, mev] = await Promise.all([
        db.from("opportunities").select("*").eq("id", f.opportunityId).maybeSingle(),
        db.from("opportunity_customer_members").select("*").eq("opportunity_id", f.opportunityId).order("id"),
        db.from("process_instances").select("*").in("id", f.children.map((c) => c.instanceId)).order("id"),
        db.from("mutation_events").select("id", { count: "exact", head: true }).eq("subject_id", f.opportunityId),
    ]);
    for (const r of [opp, ocm, pi]) if (r.error) throw new Error(`snapshot read failed: ${r.error.message}`);
    return {
        case: opp.data as Record<string, unknown>,
        participations: ocm.data,
        journeys: pi.data,
        mutation_events: mev.error ? `unmeasured: ${mev.error.message}` : mev.count,
    };
}

const caseFacts = (s: Awaited<ReturnType<typeof snapshot>>) => ({
    status_key: s.case.status_key,
    close_reason_key: s.case.close_reason_key,
    stage_key: s.case.stage_key,
});

describeLive("E2E-09 family close — real database", () => {
    let db: SupabaseClient;
    const evidence: Record<string, unknown> = {};

    async function buildFamily(label: string, children: ChildSpec[]): Promise<Family> {
        /*
         * The identity command ports — the same initialization path the certification fixture uses.
         * The cert tenant binds no lifecycle work unit, so the Create Lead COMMAND refuses there
         * ("not configured for this process/location"); Create Lead itself is re-checked on deployed
         * staging in the regression pass.
         */
        const ports = createDefaultIdentityCommandPorts();
        const pctx = { supabase: db, orgId: ORG, actorId: ACTOR || null } as never;
        const person = await ports.createPerson(pctx, {
            first_name: "ZZQA",
            last_name: `E2E09 ${label} ${RUN}`,
            email: `zzqa.e2e09.${label.toLowerCase().replace(/\s+/g, "")}.${RUN}@example.test`,
            phone: null,
        });
        if (!person?.id) throw new Error("createPerson returned nothing");
        const household = await ports.createHousehold(pctx, { household_name: `ZZQA E2E09 ${label} ${RUN}` });
        await ports.linkPersonToHousehold(pctx, { person_id: person.id, household_id: household.id, role_type: "" });
        const lead = await ports.createLead(pctx, {
            household_id: household.id,
            primary_person_id: person.id,
            name: `ZZQA E2E09 ${label} ${RUN}`,
            status_key: "open",
            stage_key: "lead",
            work_unit_id: null,
        });
        const opportunityId = lead.id;
        const customerId = household.id;
        const out: Family = { label, opportunityId, customerId, children: [] };
        for (const c of children) {
            const added = await addChild(db, { orgId: ORG, customerId, firstName: c.name, lastName: `E2E09 ${RUN}`, createNewChild: true, createNewReason: "e2e09 certification" });
            const { ocmId } = await ensureOpportunityCustomerMemberParticipation({
                supabase: db, orgId: ORG, opportunityId, customerMemberId: added.customerMemberId, source: "e2e09_certification",
            });
            const pi = await createEnrollmentProcessInstance(db, {
                orgId: ORG,
                subjectId: added.customerMemberId,
                ...(c.anchor === "participation"
                    ? { contextId: ocmId, contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, acquisitionOpportunityId: opportunityId }
                    : { contextId: opportunityId }),
                state: c.state,
                source: "e2e09_certification",
            });
            if (!pi.id) throw new Error(`process instance for ${c.name}: ${pi.error}`);
            out.children.push({ name: c.name, memberId: added.customerMemberId, ocmId, instanceId: pi.id });
        }
        return out;
    }

    /** Drive every close path at one family; return each path's outcome with before/after snapshots. */
    async function attemptEveryClosePath(f: Family) {
        const results: Record<string, { refused: boolean; detail: unknown; before: unknown; after: unknown; unchanged: boolean }> = {};
        const record = async (path: string, run: () => Promise<{ refused: boolean; detail: unknown }>) => {
            const before = await snapshot(db, f);
            const r = await run();
            const after = await snapshot(db, f);
            results[path] = { ...r, before: caseFacts(before), after: caseFacts(after), unchanged: JSON.stringify(before) === JSON.stringify(after) };
        };
        const intent = (commandKey: string) => ({
            commandKey, subjectId: f.opportunityId, subjectType: "opportunity", domain: "lead_status" as const,
            targetState: "closed", origin: "operator" as never, operatorId: ACTOR || undefined,
        });

        await record("close_lead.preview", async () => {
            const r = await executeMutation({ supabase: db, orgId: ORG } as never, intent("close_lead"), { previewOnly: true });
            const gaps = (r as { preview?: { readinessGaps?: string[] } }).preview?.readinessGaps ?? [];
            return { refused: gaps.some((g) => /child enrollment tracks/.test(g)), detail: gaps };
        });
        for (const key of ["close_lead", "update_lead_status"]) {
            await record(key, async () => {
                const r = await executeMutation({ supabase: db, orgId: ORG } as never, intent(key));
                return { refused: r.status === "blocked", detail: r };
            });
        }
        if (ACTOR) {
            await record("admin.update_status", async () => {
                const r = await updateStatusAction.execute({
                    supabase: db, ctx: { orgId: ORG, userId: ACTOR },
                    invocation: { actionKey: "update_status", entityType: "opportunity", entityId: f.opportunityId, context: {}, payload: { status_key: "closed" } },
                    payload: { status_key: "closed" },
                } as never);
                return { refused: !r.ok, detail: r };
            });
        }
        for (const [path, target] of [["case_transition.closed", "closed"], ["case_transition.closed_withdrawn_default", ""]] as const) {
            await record(path, async () => {
                const r = await executeEnrollmentStatusTransition({
                    supabase: db, orgId: ORG, userId: ACTOR || null,
                    request: {
                        actionKey: "update_enrollment_status",
                        scope: { grain: "case", opportunityId: f.opportunityId },
                        destinationKey: "closed_withdrawn",
                        targetStatusKey: target,
                        confirmationRequired: true,
                    },
                } as never);
                return { refused: !r.ok, detail: r };
            });
        }
        await record("close_lead.lost", async () => {
            const r = await executeMutation({ supabase: db, orgId: ORG } as never, { ...intent("close_lead"), targetState: "lost" });
            return { refused: r.status === "blocked", detail: r };
        });
        await record("legacy.mark_lost", async () => {
            // The REAL global `mark_lost` definition (open_form → update_status, status `lost`).
            const r = await executeAdminAction(db, { orgId: ORG, userId: ACTOR || undefined } as never, {
                actionKey: "mark_lost", entityType: "opportunity", entityId: f.opportunityId,
                payload: { lost_reason: "e2e09 certification" },
            } as never);
            return { refused: !r.ok, detail: r };
        });
        await record("outcome.update_family_case_status", async () => {
            const r = await applyStageOutcomeRuleTarget(db, {
                orgId: ORG, userId: ACTOR, departmentId: "", stageKey: "lead",
                plan: defaultStageOperatingPlanForEnrollmentStage("lead" as never) as never,
                subject: { journey_segment: "family", opportunity_id: f.opportunityId },
                target: { kind: "update_family_case_status", status_key: "closed" } as never,
            });
            return { refused: Boolean(r.error), detail: r };
        });
        return results;
    }

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
    }, 60_000);

    it("Scenario 1 — a waitlisted child (participation-anchored) blocks every close path, with zero mutation", async () => {
        const f = await buildFamily("Waitlist", [{ name: "Alpha", state: "waitlisted", anchor: "participation" }]);
        const r = await attemptEveryClosePath(f);
        evidence.scenario1 = { family: f, r };
        console.info("E2E09_EVIDENCE scenario1", JSON.stringify(evidence.scenario1));
        for (const [path, res] of Object.entries(r)) {
            expect(res.refused, `${path} must refuse`).toBe(true);
            expect(res.unchanged, `${path} must write nothing`).toBe(true);
        }
    }, 180_000);

    it("Scenario 2 — an enrolled child blocks every close path, with zero mutation", async () => {
        const f = await buildFamily("Enrolled", [{ name: "Bravo", state: "enrolled", anchor: "participation" }]);
        const r = await attemptEveryClosePath(f);
        console.info("E2E09_EVIDENCE scenario2", JSON.stringify({ family: f, r }));
        for (const [path, res] of Object.entries(r)) {
            expect(res.refused, `${path} must refuse`).toBe(true);
            expect(res.unchanged, `${path} must write nothing`).toBe(true);
        }
    }, 180_000);

    it("Scenario 3 — mixed children: one waitlisted, one not_enrolling still refuses", async () => {
        const f = await buildFamily("Mixed", [
            { name: "Alpha", state: "waitlisted", anchor: "participation" },
            { name: "Charlie", state: "not_enrolling", anchor: "participation" },
        ]);
        const refusal = await familyCloseRefusal(db, { orgId: ORG, opportunityId: f.opportunityId, targetStatusKey: "closed" });
        console.info("E2E09_EVIDENCE scenario3", JSON.stringify({ family: f, refusal }));
        expect(refusal?.blocked_reasons.map((x) => x.code)).toEqual(["child_track_active_pre_enrollment"]);
        expect(refusal?.blocked_reasons[0]?.tracks.map((t) => t.process_instance_id)).toEqual([f.children[0]!.instanceId]);
    }, 120_000);

    it("Older shape — an opportunity-anchored waitlisted journey is discovered and blocks", async () => {
        const f = await buildFamily("Legacy", [{ name: "Delta", state: "waitlisted", anchor: "opportunity" }]);
        const refusal = await familyCloseRefusal(db, { orgId: ORG, opportunityId: f.opportunityId, targetStatusKey: "closed" });
        console.info("E2E09_EVIDENCE older_shape", JSON.stringify({ family: f, refusal }));
        expect(refusal?.blocked_reasons[0]?.tracks.map((t) => t.process_instance_id)).toEqual([f.children[0]!.instanceId]);
    }, 120_000);

    it("Foreign family — another family's live child neither leaks in nor blocks this close", async () => {
        const blocked = await buildFamily("ForeignA", [{ name: "Echo", state: "waitlisted", anchor: "participation" }]);
        const clear = await buildFamily("ForeignB", [{ name: "Fox", state: "withdrawn", anchor: "participation" }]);
        const readA = await readEnrollmentInstancesForLead(db, { orgId: ORG, opportunityId: blocked.opportunityId });
        const readB = await readEnrollmentInstancesForLead(db, { orgId: ORG, opportunityId: clear.opportunityId });
        console.info("E2E09_EVIDENCE foreign", JSON.stringify({ readA, readB }));
        expect(readA.ok && readA.rows.map((r) => r.id)).toEqual([blocked.children[0]!.instanceId]);
        expect(readB.ok && readB.rows.map((r) => r.id)).toEqual([clear.children[0]!.instanceId]);
        await expect(familyCloseRefusal(db, { orgId: ORG, opportunityId: clear.opportunityId, targetStatusKey: "closed" })).resolves.toBeNull();
    }, 180_000);

    it("Scenario 5 — an unreadable child list fails closed against the real API", async () => {
        const f = await buildFamily("ReadFail", [{ name: "Golf", state: "withdrawn", anchor: "participation" }]);
        const unauthorised = createClient(env!.url, "not-a-valid-key", { auth: { persistSession: false } });
        const refusal = await familyCloseRefusal(unauthorised, { orgId: ORG, opportunityId: f.opportunityId, targetStatusKey: "closed" });
        console.info("E2E09_EVIDENCE readfail", JSON.stringify(refusal));
        expect(refusal?.blocked_reasons.map((x) => x.code)).toEqual(["child_track_enumeration_failed"]);
        // The same family, read with authority, has nothing live — the refusal was the failed read.
        await expect(familyCloseRefusal(db, { orgId: ORG, opportunityId: f.opportunityId, targetStatusKey: "closed" })).resolves.toBeNull();
    }, 120_000);

    it("Scenario 4 — once every child has left, the family closes exactly once", async () => {
        const f = await buildFamily("Exited", [
            { name: "Hotel", state: "withdrawn", anchor: "participation" },
            { name: "India", state: "not_enrolling", anchor: "participation" },
        ]);
        const before = await snapshot(db, f);
        const r = await executeMutation({ supabase: db, orgId: ORG } as never, {
            commandKey: "close_lead", subjectId: f.opportunityId, subjectType: "opportunity", domain: "lead_status",
            targetState: "closed", origin: "operator" as never, operatorId: ACTOR || undefined,
        });
        const after = await snapshot(db, f);
        console.info("E2E09_EVIDENCE scenario4", JSON.stringify({ family: f, result: r, before: caseFacts(before), after: caseFacts(after), mev: [before.mutation_events, after.mutation_events] }));
        expect(r.status).toBe("committed");
        expect(after.case.status_key).toBe("closed");
        expect(after.journeys).toEqual(before.journeys);
        if (typeof before.mutation_events === "number") expect(after.mutation_events).toBe(before.mutation_events + 1);
        // A second close is not a second transition.
        const again = await executeMutation({ supabase: db, orgId: ORG } as never, {
            commandKey: "close_lead", subjectId: f.opportunityId, subjectType: "opportunity", domain: "lead_status",
            targetState: "closed", origin: "operator" as never,
        });
        expect(again.status).toBe("blocked");
    }, 120_000);

    it("Scenario 4b — a child withdrawn through the canonical child transition no longer blocks the close", async () => {
        // Deployed staging measured the defect: the child transition writes the participation (the
        // durable owner) and leaves the journey `enrolling`. The rule must read the owner.
        const f = await buildFamily("Withdrawn", [{ name: "Kilo", state: "enrolling", anchor: "participation" }]);
        const child = f.children[0]!;
        const exit = await executeEnrollmentStatusTransition({
            supabase: db, orgId: ORG, userId: ACTOR || null,
            request: {
                actionKey: "update_enrollment_status",
                scope: { grain: "child", opportunityId: f.opportunityId, opportunityCustomerMemberId: child.ocmId },
                destinationKey: "closed_withdrawn",
                targetStatusKey: "withdrawn",
                confirmationRequired: true,
            },
        } as never);
        const journey = await db.from("process_instances").select("state").eq("id", child.instanceId).single();
        const close = await executeMutation({ supabase: db, orgId: ORG } as never, {
            commandKey: "close_lead", subjectId: f.opportunityId, subjectType: "opportunity", domain: "lead_status",
            targetState: "closed", origin: "operator" as never, operatorId: ACTOR || undefined,
        });
        const after = await snapshot(db, f);
        console.info("E2E09_EVIDENCE scenario4b", JSON.stringify({ exit, journey_state: journey.data, close: close.status, after: caseFacts(after), participations: after.participations }));
        expect(exit.ok).toBe(true);
        expect(close.status).toBe("committed");
        expect(after.case.status_key).toBe("closed");
    }, 120_000);

    it("legacy definition-driven executor refuses too (QA-scoped action definition, removed after)", async () => {
        const f = await buildFamily("Legacy Exec", [{ name: "Juliet", state: "waitlisted", anchor: "participation" }]);
        const key = `zzqa_e2e09_close_${RUN}`;
        const ins = await db.from("action_definitions").insert({
            org_id: ORG, key, label: "ZZQA E2E09 close", action_type: "update_status", entity_type: "opportunity",
            payload_schema: { status_key: "closed" }, is_active: true,
        }).select("id").single();
        expect(ins.error).toBeNull();
        try {
            const before = await snapshot(db, f);
            const r = await executeAdminAction(db, { orgId: ORG, userId: ACTOR || undefined } as never, {
                actionKey: key, entityType: "opportunity", entityId: f.opportunityId, payload: {},
            } as never);
            const after = await snapshot(db, f);
            console.info("E2E09_EVIDENCE legacy_executor", JSON.stringify({ r, before: caseFacts(before), after: caseFacts(after) }));
            expect(r.ok).toBe(false);
            expect(JSON.stringify(after)).toBe(JSON.stringify(before));
        } finally {
            await db.from("action_definitions").delete().eq("id", (ins.data as { id: string }).id);
        }
    }, 120_000);
});
