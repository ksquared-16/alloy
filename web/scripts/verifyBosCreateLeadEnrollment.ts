/**
 * BOS / Action-UI Create Lead path verification (SHARED RUNTIME).
 *
 * The BOS command surface and the direct/backend path both execute the registered `create_lead` action
 * via runRegisteredAction → executeCreateLeadAction, whose child persistence is
 * applyCreateLeadChildParticipation(FromIdentity) — the same function additional household children use.
 * This script drives that EXACT shared runtime (+ a faithful opportunity write matching
 * executeCreateLeadAction) for a two-child lead, then waitlists one child and enrolls the other, and
 * verifies opportunity / process instances / no-OCM / Focus Panel facts / counts / durable materialization.
 * Self-cleaning. No reset.
 *
 * Usage (from web/):  CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED=true npx tsx --tsconfig tsconfig.json scripts/verifyBosCreateLeadEnrollment.ts
 */
import { createClient } from "@supabase/supabase-js";
import { applyCreateLeadChildParticipationFromIdentity } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";
import { resolveProcessDraftFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenProcessDraftFactsOverlay";
import { resolveDurableFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";
import { queryEnrollmentProcessInstanceTrackRows } from "@/lib/queues/childGrainProcessInstanceQueue";

process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED = "true"; // enable materialization on enroll
delete process.env.ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK; // prove no OCM fallback

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT = "5ba90557-876d-4450-9c28-36beac6e83be"; // "New Leads"
const TAG = "bos_create_lead_verify";
type Any = Record<string, unknown>;
const defects: string[] = [];
const ok = (label: string, pass: boolean, detail?: unknown) => {
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? "  :: " + JSON.stringify(detail) : ""}`);
    if (!pass) defects.push(label);
};

async function disposition(supabase: any, oppId: string, cmId: string, key: string) {
    return applyStageOutcomeRuleTarget(supabase as never, {
        orgId: ORG,
        userId: "00000000-0000-4000-8000-000000000001",
        departmentId: "bos-verify",
        stageKey: "tour",
        plan: {} as never,
        subject: { journey_segment: "child", opportunity_id: oppId, customer_member_id: cmId } as never,
        target: { kind: "update_child_enrollment_status", disposition_key: key } as never,
    });
}

async function main() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) { console.error("Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const ids: { oppId?: string; customerId?: string; cmIds: string[]; personIds: string[] } = { cmIds: [], personIds: [] };
    try {
        // Config: a program category (+ its site) and a schedule type/pattern for the org.
        const { data: cat } = await supabase.from("location_program_categories").select("id, key, location_id").eq("org_id", ORG).eq("is_active", true).limit(1).maybeSingle();
        const programCategoryId = (cat as Any)?.id as string | undefined;
        const siteId = ((cat as Any)?.location_id as string | undefined) ?? WORK_UNIT;
        const { data: pat } = await supabase.from("schedule_patterns").select("schedule_type_key, key").eq("org_id", ORG).eq("is_active", true).limit(1).maybeSingle();
        const scheduleType = ((pat as Any)?.schedule_type_key as string | undefined) ?? ((pat as Any)?.key as string | undefined) ?? null;
        console.log(`config: programCategoryId=${programCategoryId ?? "(none)"} site=${siteId} scheduleType=${scheduleType ?? "(none)"}`);

        // Baseline count: open leads in the New Leads work unit.
        const { count: baseOpen } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("work_unit_id", WORK_UNIT).eq("status_key", "open");

        // --- Household + opportunity (faithful to executeCreateLeadAction's opportunity write) ---
        const { data: cust } = await supabase.from("customers").insert({ org_id: ORG, name: "BOS Verify Family", customer_number: 900000 + Math.floor(Math.random() * 90000), metadata: { test: TAG } }).select("id").single();
        ids.customerId = (cust as Any).id as string;
        const { data: opp } = await supabase.from("opportunities").insert({
            org_id: ORG,
            customer_id: ids.customerId,
            name: "BOS Verify Lead",
            source: "manual",
            status_key: "open",     // DEFAULT_LEAD_CASE_STATUS_KEY
            stage_key: "lead",      // executeCreateLeadAction writes stage_key="lead"
            work_unit_id: WORK_UNIT,
            metadata: { created_via: "create_lead", test: TAG },
        }).select("id, status_key, stage_key, work_unit_id").single();
        ids.oppId = (opp as Any).id as string;
        ok("opportunity created", !!ids.oppId);
        ok("opportunity.status_key = open", (opp as Any).status_key === "open", { status_key: (opp as Any).status_key });
        ok("opportunity.stage_key = lead", (opp as Any).stage_key === "lead", { stage_key: (opp as Any).stage_key });
        ok("opportunity assigned to New Leads work unit", (opp as Any).work_unit_id === WORK_UNIT);

        // --- Two children via the SHARED create_lead child runtime ---
        const children: { cmId: string; name: string }[] = [];
        for (const [first, last] of [["Ada", "BosVerify"], ["Bo", "BosVerify"]]) {
            const res = await applyCreateLeadChildParticipationFromIdentity(supabase as never, {
                orgId: ORG,
                opportunityId: ids.oppId!,
                customerId: ids.customerId!,
                identity: { first_name: first, last_name: last, dob: "2023-05-01", display_name: `${first} ${last}` },
                ocm: {
                    location_id: siteId,
                    program_key: null,
                    program_category_id: programCategoryId ?? null,
                    schedule_type: scheduleType,
                    start_date: "2026-09-01",
                    program_room_cohort_key: null,
                    notes: null,
                },
            });
            ok(`child ${first}: no OCM row written (ocm_id null)`, res.ocm_id === null, { ocm_id: res.ocm_id });
            ok(`child ${first}: process_instance created`, !!res.process_instance_id);
            children.push({ cmId: res.customer_member_id, name: first });
            ids.cmIds.push(res.customer_member_id);
        }
        const [ada, bo] = children;

        // --- one process_instance per child + participation metadata ---
        const pis = await listEnrollmentInstancesForLead(supabase as never, { orgId: ORG, opportunityId: ids.oppId! });
        ids.personIds = []; // collected below from customer_members
        ok("one process_instance per child (2)", pis.length === 2, { count: pis.length });
        ok("each PI subject is a distinct child", new Set(pis.map((p) => p.subject_id)).size === 2);
        ok("PI metadata carries participation draft facts", pis.every((p) => (p.metadata as Any)?.start_date === "2026-09-01" && (programCategoryId ? (p.metadata as Any)?.program_category_id === programCategoryId : true)));

        // --- NO OCM row for this admin/BOS action path ---
        const { count: ocmCount } = await supabase.from("opportunity_customer_members").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("opportunity_id", ids.oppId!);
        ok("no opportunity_customer_members row created for the lead", (ocmCount ?? 0) === 0, { ocmCount });

        // --- Focus Panel pre-materialization facts come from PI metadata ---
        const draft = await resolveProcessDraftFactsForChildren(supabase as never, ORG, ids.oppId!, children.map((c) => ({ customerMemberId: c.cmId })));
        ok("Focus Panel pre-mat: Ada shows PI draft facts (start date)", draft.get(ada.cmId)?.startDate === "2026-09-01", { ada: draft.get(ada.cmId) });
        ok("Focus Panel pre-mat: Bo shows PI draft facts (start date)", draft.get(bo.cmId)?.startDate === "2026-09-01");
        if (programCategoryId) ok("Focus Panel pre-mat: program label resolved from PI metadata", !!draft.get(ada.cmId)?.programLabel, { programLabel: draft.get(ada.cmId)?.programLabel });

        // --- Count / tile: open leads in New Leads incremented ---
        const { count: afterOpen } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("work_unit_id", WORK_UNIT).eq("status_key", "open");
        ok("New Leads open-lead count incremented by 1", (afterOpen ?? 0) === (baseOpen ?? 0) + 1, { base: baseOpen, after: afterOpen });

        // === Move: Ada → waitlist, Bo → enroll ===
        const wl = await disposition(supabase, ids.oppId!, ada.cmId, "waitlisted");
        ok("Ada: waitlist disposition ok", wl.status_updated === true, wl.error);
        const { count: pcCount } = await supabase.from("placement_candidates").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("opportunity_id", ids.oppId!).eq("customer_member_id", ada.cmId);
        ok("Ada: placement_candidate created", (pcCount ?? 0) >= 1, { pcCount });
        const { data: pcRow } = await supabase.from("placement_candidates").select("opportunity_customer_member_id").eq("org_id", ORG).eq("opportunity_id", ids.oppId!).eq("customer_member_id", ada.cmId).maybeSingle();
        ok("Ada: placement_candidate has NO OCM link (opportunity_customer_member_id null)", (pcRow as Any)?.opportunity_customer_member_id == null, { v: (pcRow as Any)?.opportunity_customer_member_id });

        const en = await disposition(supabase, ids.oppId!, bo.cmId, "enrolled");
        ok("Bo: enroll disposition ok", en.status_updated === true, en.error);

        // === Materialization for Bo (durable agreement + placement + schedule) ===
        const durable = await resolveDurableFactsForChildren(supabase as never, ORG, [{ customerMemberId: bo.cmId, siteLocationId: siteId }]);
        ok("Bo: durable agreement + placement materialized (Focus Panel durable facts)", !!durable.get(bo.cmId), { facts: durable.get(bo.cmId) });
        const { data: agr } = await supabase.from("child_enrollment_agreements").select("id, status").eq("org_id", ORG).eq("customer_member_id", bo.cmId).maybeSingle();
        ok("Bo: child_enrollment_agreement row exists", !!(agr as Any)?.id, { status: (agr as Any)?.status });
        if ((agr as Any)?.id) {
            const { count: plcCount } = await supabase.from("child_placements").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("enrollment_agreement_id", (agr as Any).id);
            ok("Bo: child_placement row exists", (plcCount ?? 0) >= 1, { plcCount });
            const { count: schCount } = await supabase.from("schedule_assignments").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("enrollment_agreement_id", (agr as Any).id);
            if (scheduleType) ok("Bo: schedule_assignment row exists", (schCount ?? 0) >= 1, { schCount });
            else console.log("note: no active schedule_pattern for org — schedule_assignment not expected");
        }
        ok("Multi-child independence: Ada (waitlisted) has NO durable agreement", !durable.get(ada.cmId));

        // === Work View counts: child-grain track rows ===
        const wlView = (await queryEnrollmentProcessInstanceTrackRows({ supabase: supabase as never, orgId: ORG, workUnitId: WORK_UNIT, stageKey: "waitlist" })).filter((r) => r.opportunity_id === ids.oppId);
        console.log(`Work View waitlist rows for lead: ${wlView.map((r) => r.customer_member_id).join(",") || "(none — stage not moved)"}`);

        console.log(`\n${defects.length ? "DEFECTS: " + defects.length : "ALL CHECKS PASSED"}`);
    } finally {
        // Cleanup (durable → PI → opp → members → persons → customer → events).
        const oppId = ids.oppId ?? "";
        if (oppId) {
            const { data: agrs } = await supabase.from("child_enrollment_agreements").select("id").eq("org_id", ORG).in("customer_member_id", ids.cmIds.length ? ids.cmIds : ["_"]);
            for (const a of agrs ?? []) {
                const aid = (a as Any).id as string;
                await supabase.from("schedule_assignments").delete().eq("org_id", ORG).eq("enrollment_agreement_id", aid);
                await supabase.from("child_placements").delete().eq("org_id", ORG).eq("enrollment_agreement_id", aid);
            }
            await supabase.from("child_enrollment_agreements").delete().eq("org_id", ORG).in("customer_member_id", ids.cmIds.length ? ids.cmIds : ["_"]);
            await supabase.from("placement_candidates").delete().eq("org_id", ORG).eq("opportunity_id", oppId);
            await supabase.from("workflow_events").delete().eq("org_id", ORG).eq("event_type", "child_lifecycle_status_changed").eq("payload->>opportunity_id", oppId);
            await supabase.from("process_instances").delete().eq("org_id", ORG).eq("context_id", oppId);
            await supabase.from("opportunity_persons").delete().eq("org_id", ORG).eq("opportunity_id", oppId);
            await supabase.from("opportunities").delete().eq("org_id", ORG).eq("id", oppId);
        }
        // person ids from the created child customer_members, then delete members + persons + customer.
        if (ids.cmIds.length) {
            const { data: members } = await supabase.from("customer_members").select("id, person_id").eq("org_id", ORG).in("id", ids.cmIds);
            const personIds = (members ?? []).map((m) => (m as Any).person_id as string).filter(Boolean);
            await supabase.from("customer_members").delete().eq("org_id", ORG).in("id", ids.cmIds);
            if (personIds.length) {
                await supabase.from("customer_persons").delete().eq("org_id", ORG).in("person_id", personIds);
                await supabase.from("persons").delete().eq("org_id", ORG).in("id", personIds);
            }
        }
        if (ids.customerId) {
            await supabase.from("customer_persons").delete().eq("org_id", ORG).eq("customer_id", ids.customerId);
            await supabase.from("customers").delete().eq("org_id", ORG).eq("id", ids.customerId);
        }
        const { count: piLeft } = await supabase.from("process_instances").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("context_id", oppId);
        console.log(`Cleanup done. process_instances left: ${piLeft ?? 0}`);
    }
    if (defects.length) process.exit(2);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
