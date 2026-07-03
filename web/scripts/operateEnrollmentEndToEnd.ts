/**
 * Operate Alloy Enrollment end-to-end against staging — the FULL workflow.
 *
 * Create Lead (2 children) → move through stages → Schedule Tour → Waitlist one child → Enroll the other
 * → materialize agreement + placement + schedule for the enrolled child → verify Work Views, Focus Panel,
 * Process Instances, Durable Operational Facts, Actions, Materialization, Multi-child behavior.
 *
 * OCM bridge is present (temporary) — subjects carry BOTH customer_member_id and the OCM id so waitlist
 * placement candidates resolve. Records every defect. Self-cleaning unless KEEP_DATA=1.
 *
 * Usage (from web/):  CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED=true \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig tsconfig.json scripts/operateEnrollmentEndToEnd.ts
 */
import { createClient } from "@supabase/supabase-js";
import { applyCreateLeadChildParticipationFromIdentity } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";
import { queryEnrollmentProcessInstanceTrackRows } from "@/lib/queues/childGrainProcessInstanceQueue";
import { resolveDurableFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";
import { buildOperationalEnrollmentReadModelForMemberSite } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

// Enable operational materialization for this run (server env flag).
process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED = process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED ?? "true";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT = "5ba90557-876d-4450-9c28-36beac6e83be";
const TAG = "operate_e2e_20260704";
const USER = "00000000-0000-4000-8000-000000000001";

type Any = Record<string, unknown>;
const defects: string[] = [];
const ok = (label: string, pass: boolean, detail?: unknown) => {
    if (!pass) defects.push(label + (detail !== undefined ? " :: " + JSON.stringify(detail) : ""));
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? "  :: " + JSON.stringify(detail) : ""}`);
};
const note = (m: string) => console.log("NOTE  " + m);

async function move(supabase: unknown, oppId: string, cmId: string, ocmId: string, fromStage: string, toStage: string) {
    return applyStageOutcomeRuleTarget(supabase as never, {
        orgId: ORG, userId: USER, departmentId: "e2e", stageKey: fromStage, plan: {} as never,
        subject: { journey_segment: "child", opportunity_id: oppId, customer_member_id: cmId, opportunity_customer_member_id: ocmId } as never,
        target: { kind: "move_to_stage", stage_key: toStage } as never,
    });
}
async function disposition(supabase: unknown, oppId: string, cmId: string, ocmId: string, stage: string, key: string) {
    return applyStageOutcomeRuleTarget(supabase as never, {
        orgId: ORG, userId: USER, departmentId: "e2e", stageKey: stage, plan: {} as never,
        subject: { journey_segment: "child", opportunity_id: oppId, customer_member_id: cmId, opportunity_customer_member_id: ocmId } as never,
        target: { kind: "update_child_enrollment_status", disposition_key: key } as never,
    });
}

async function main() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) { console.error("Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // --- Config (site / program / room / schedule pattern). Missing config = a real defect. ---
    // Rooms are location_type='unit' with parent_location_id → the site. Sites are top-level (no parent).
    const { data: locs } = await supabase.from("locations").select("id, label, location_type, parent_location_id").eq("org_id", ORG).eq("is_active", true).limit(100);
    const siteRow = (locs ?? []).find((l) => (l as Any).parent_location_id == null);
    const siteId = siteRow ? String((siteRow as Any).id) : null;
    ok("staging has a site location", !!siteId, { total: (locs ?? []).length });
    const roomRow = (locs ?? []).find((l) => String((l as Any).parent_location_id ?? "") === siteId);
    const roomLocationId = roomRow ? String((roomRow as Any).id) : null;
    const { data: cats } = await supabase.from("location_program_categories").select("id, location_id").eq("org_id", ORG).eq("is_active", true).limit(50);
    const catAtSite = (cats ?? []).find((c) => String((c as Any).location_id ?? "") === siteId) ?? (cats ?? [])[0];
    const programCategoryId = catAtSite ? String((catAtSite as Any).id) : null;
    ok("staging has a program category (placement)", !!programCategoryId, { count: (cats ?? []).length });
    if (!siteId) { console.log(`\n===== DEFECTS (${defects.length}) =====`); defects.forEach((d) => console.log("  • " + d)); return; }
    const { data: patterns } = await supabase.from("schedule_patterns").select("id, key, schedule_type_key").eq("org_id", ORG).eq("is_active", true).limit(10);
    const pat = (patterns ?? [])[0] as Any | undefined;
    const scheduleTypeKey = pat ? String(pat.schedule_type_key ?? pat.key) : null;
    if (!scheduleTypeKey) defects.push("no active schedule_patterns for org — schedule assignment cannot materialize (config gap)");
    note(`config: site=${siteId} program=${programCategoryId} room=${roomLocationId ?? "(none)"} scheduleType=${scheduleTypeKey ?? "(none)"}`);

    const c = { customerId: "", oppId: "", cmIds: [] as string[] };
    try {
        const nextNum = async (t: string, col: string) => {
            const { data } = await supabase.from(t).select(col).order(col, { ascending: false }).limit(1).maybeSingle();
            return (data ? Number((data as Any)[col]) : 0) + 1 + Math.floor(Math.random() * 1000);
        };
        const { data: cust } = await supabase.from("customers").insert({ org_id: ORG, name: "E2E Family", customer_number: await nextNum("customers", "customer_number"), metadata: { test: TAG } }).select("id").single();
        c.customerId = String((cust as Any).id);
        const { data: opp } = await supabase.from("opportunities").insert({ org_id: ORG, opportunity_number: await nextNum("opportunities", "opportunity_number"), name: "E2E Lead", customer_id: c.customerId, work_unit_id: WORK_UNIT, location_id: siteId, stage_key: "new_lead", status_key: "open", metadata: { test: TAG } }).select("id").single();
        c.oppId = String((opp as Any).id);
        note(`lead ${c.oppId}`);

        // === Step 1: Create Lead with two children (real persistence — CM + OCM bridge + PI) ===
        const kids: { cmId: string; ocmId: string; name: string }[] = [];
        for (const [i, nm] of [["Ada", "E2E"], ["Bo", "E2E"]].entries()) {
            const res = await applyCreateLeadChildParticipationFromIdentity(supabase, {
                orgId: ORG, opportunityId: c.oppId, customerId: c.customerId,
                identity: { first_name: nm[0], last_name: nm[1], dob: null, display_name: `${nm[0]} ${nm[1]}` },
                ocm: { location_id: siteId, program_key: null, program_category_id: programCategoryId, schedule_type: scheduleTypeKey, start_date: `2026-0${i + 8}-01`, program_room_cohort_key: roomLocationId, notes: null },
            });
            ok(`child ${i + 1}: Create Lead wrote OCM bridge + PI`, !!res.ocm_id && !!res.process_instance_id, { ocm: res.ocm_id, pi: res.process_instance_id });
            kids.push({ cmId: res.customer_member_id, ocmId: res.ocm_id, name: nm[0] });
            c.cmIds.push(res.customer_member_id);
        }
        const [ada, bo] = kids;
        const pis0 = await listEnrollmentInstancesForLead(supabase as never, { orgId: ORG, opportunityId: c.oppId });
        ok("two process instances created (one per child)", pis0.length === 2, { count: pis0.length });

        // === Step 2–3: Move through stages + Schedule Tour (both children new_lead → tour) ===
        for (const k of kids) {
            const r = await move(supabase, c.oppId, k.cmId, k.ocmId, "new_lead", "tour");
            ok(`${k.name}: move new_lead → tour (Schedule Tour)`, !r.error, r.error);
        }

        // === Step 4: Waitlist ONE child (Ada) ===
        const mvW = await move(supabase, c.oppId, ada.cmId, ada.ocmId, "tour", "waitlist");
        ok("Ada: move tour → waitlist", !mvW.error, mvW.error);
        const dW = await disposition(supabase, c.oppId, ada.cmId, ada.ocmId, "waitlist", "waitlisted");
        ok("Ada: waitlist disposition", dW.status_updated === true, dW.error);
        const { count: pcCount } = await supabase.from("placement_candidates").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("opportunity_id", c.oppId).eq("customer_member_id", ada.cmId);
        ok("Ada: waitlist created a placement candidate (bridge intact)", (pcCount ?? 0) >= 1, { pcCount });

        // === Step 5: Enroll the OTHER child (Bo) → materialize ===
        const mvE = await move(supabase, c.oppId, bo.cmId, bo.ocmId, "tour", "enrolling");
        ok("Bo: move tour → enrolling", !mvE.error, mvE.error);
        const dE = await disposition(supabase, c.oppId, bo.cmId, bo.ocmId, "enrolling", "enrolled");
        ok("Bo: enroll disposition", dE.status_updated === true, dE.error);

        // === Step 6: Verify materialization for Bo (agreement + placement + schedule) ===
        const rm = await buildOperationalEnrollmentReadModelForMemberSite(supabase, ORG, bo.cmId, siteId ?? "");
        ok("Bo: durable ENROLLMENT AGREEMENT materialized", !!rm.agreement, { status: rm.agreement?.status });
        ok("Bo: durable PLACEMENT materialized (program/site)", !!rm.placement, { program: rm.placement?.program_category_id, warnings: rm.warnings });
        if (scheduleTypeKey) ok("Bo: durable SCHEDULE ASSIGNMENT materialized", !!rm.scheduleAssignment, { warnings: rm.warnings });
        else note("Bo: schedule assignment skipped (no schedule_patterns config)");

        // Multi-child: Ada (waitlisted) has NO agreement; Bo (enrolled) has one — independence.
        const rmA = await buildOperationalEnrollmentReadModelForMemberSite(supabase, ORG, ada.cmId, siteId ?? "");
        ok("Multi-child: Ada (waitlisted) has NO durable agreement", !rmA.agreement);

        // Process instances: independent states.
        const pis = await listEnrollmentInstancesForLead(supabase as never, { orgId: ORG, opportunityId: c.oppId });
        const sAda = pis.find((p) => p.subject_id === ada.cmId);
        const sBo = pis.find((p) => p.subject_id === bo.cmId);
        ok("Ada process instance state = waitlisted", sAda?.state === "waitlisted", { state: sAda?.state });
        ok("Bo process instance state = enrolled", sBo?.state === "enrolled", { state: sBo?.state });
        ok("Bo process instance links enrollment_agreement_id (journey→durable)", (sBo?.metadata as Any)?.enrollment_agreement_id != null);

        // Focus Panel: durable facts for Bo; participation (state) for both.
        const durable = await resolveDurableFactsForChildren(supabase as never, ORG, kids.map((k) => ({ customerMemberId: k.cmId, siteLocationId: siteId })));
        ok("Focus Panel: Bo shows durable Program/Start", !!durable.get(bo.cmId) && (durable.get(bo.cmId)!.programLabel != null || durable.get(bo.cmId)!.startDate != null), { facts: durable.get(bo.cmId) });
        ok("Focus Panel: Ada (waitlisted) has no durable facts (OCM fallback)", !durable.get(ada.cmId));

        // Work Views (child-grain queue) read process_instances per stage.
        const wlView = await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as never, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "waitlist" });
        const enView = await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as never, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "enrolling" });
        ok("Work View waitlist returns Ada", wlView.some((r) => r.customer_member_id === ada.cmId), { ids: wlView.filter((r) => r.opportunity_id === c.oppId).map((r) => r.customer_member_id) });
        ok("Work View enrolling returns Bo", enView.some((r) => r.customer_member_id === bo.cmId), { ids: enView.filter((r) => r.opportunity_id === c.oppId).map((r) => r.customer_member_id) });
    } finally {
        if (process.env.KEEP_DATA === "1") {
            note(`KEEP_DATA=1 — leaving lead ${c.oppId} for UI inspection`);
        } else if (c.oppId) {
            const agr = await supabase.from("child_enrollment_agreements").select("id").eq("org_id", ORG).in("customer_member_id", c.cmIds.length ? c.cmIds : ["_"]);
            const agrIds = (agr.data ?? []).map((a) => String((a as Any).id));
            if (agrIds.length) {
                await supabase.from("schedule_assignments").delete().eq("org_id", ORG).in("enrollment_agreement_id", agrIds);
                await supabase.from("child_placements").delete().eq("org_id", ORG).in("enrollment_agreement_id", agrIds);
                await supabase.from("child_enrollment_agreements").delete().eq("org_id", ORG).in("id", agrIds);
            }
            await supabase.from("placement_candidates").delete().eq("org_id", ORG).eq("opportunity_id", c.oppId);
            await supabase.from("workflow_events").delete().eq("org_id", ORG).eq("event_type", "child_lifecycle_status_changed").eq("payload->>opportunity_id", c.oppId);
            await supabase.from("process_instances").delete().eq("org_id", ORG).eq("context_id", c.oppId);
            await supabase.from("opportunity_customer_members").delete().eq("org_id", ORG).eq("opportunity_id", c.oppId);
            await supabase.from("opportunities").delete().eq("org_id", ORG).eq("id", c.oppId);
            if (c.cmIds.length) await supabase.from("customer_members").delete().eq("org_id", ORG).in("id", c.cmIds);
            await supabase.from("customers").delete().eq("org_id", ORG).eq("id", c.customerId);
            note("cleanup complete (no residue)");
        }
    }

    console.log(`\n===== DEFECTS (${defects.length}) =====`);
    if (!defects.length) console.log("  none — Enrollment operated end-to-end");
    for (const d of defects) console.log("  • " + d);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
