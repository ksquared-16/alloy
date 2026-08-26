/**
 * THE OPERATIONAL CARDS CERTIFICATION FIXTURE — the domain logic, callable by a trusted runner.
 *
 * Process, Attendance and Financials all need the same thing: a household whose children are
 * GENUINELY ENROLLED. This creates exactly that, through the same canonical paths the product uses,
 * and nothing else.
 *
 * ── WHY THIS IS NOT A BYPASS OF IDENTITY RESOLUTION ──
 *
 * `executeCreateLeadAction` settles identity itself. For a clean-new person it returns
 * `mode: "committed"`; when identity is AMBIGUOUS it returns `mode: "processing_review"` and waits
 * for a human. This fixture does not force the first outcome — it earns it. The reserved namespace
 * is unique by construction, so the canonical resolver reaches "committed" on its own.
 *
 * And if it ever returns `processing_review`, this **fails closed**. That is the whole safety
 * argument: an ambiguous duplicate is never reinterpreted as "create another person", and no code
 * here decides an identity question the product reserves for an operator.
 *
 * ── WHY IT DOES NOT REPRODUCE CREATE LEAD ──
 *
 * It calls the real command service rather than re-implementing its decisions. `addChild` and
 * `directEnroll` are likewise the services the registered `child.add` and `enrollment.direct`
 * capabilities call, and `directEnroll` reaches `materializeChildEnrollment` — so an agreement is
 * MATERIALIZED, never authored. That invariant is what Attendance depends on.
 *
 * ── THE NAMESPACE IS THE BLAST RADIUS ──
 *
 * Every record is reachable from one RFC-2606 reserved domain, and `reset` matches on that alone —
 * never a name, never a timestamp, never "created recently". Nothing outside it is read or written.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { addChild } from "@/lib/records/addChildService";
import { directEnroll } from "@/lib/records/directEnrollService";
import { startEnrollment } from "@/lib/records/startEnrollmentService";
import {
    createEnrollmentProcessInstance,
    moveProcessInstanceStage,
    readEnrollmentInstanceStageKey,
    setProcessInstanceState,
} from "@/lib/process/processInstances";

/** RFC-2606 reserved: nothing real can ever live here, so the selector cannot over-match. */
export const CERT_DOMAIN = "operational-cards-cert.alloy.invalid";
export const CERT_PARENT_EMAIL = `guardian@${CERT_DOMAIN}`;
const CERT_LAST_NAME = "Certhouse";

/** The Enrollment template's terminal child-track stage — what a child-grain Work View filters on. */
const ENROLLED_STAGE_KEY = "enrolled";

const CERT_PARENT = { firstName: "Cert", lastName: CERT_LAST_NAME, phone: "+15555550100" };
const CERT_CHILDREN = [
    { firstName: "Certa", lastName: CERT_LAST_NAME, dob: "2021-04-12" },
    { firstName: "Certb", lastName: CERT_LAST_NAME, dob: "2022-09-30" },
] as const;

export type CertificationChildResult = {
    firstName: string;
    customerMemberId: string;
    agreementId: string | null;
    placementId: string | null;
    scheduleAssignmentId: string | null;
    /** Participation truth — what a child-grain Work View selects on. */
    processInstanceId: string | null;
    stageKey: string | null;
};

export type CertificationEnsureResult =
    | {
          ok: true;
          customerId: string;
          personId: string | null;
          opportunityId: string | null;
          children: CertificationChildResult[];
          reused: boolean;
      }
    | { ok: false; reason: string; needsOperator?: boolean };

export type CertificationVerifyResult = {
    householdPresent: boolean;
    customerId: string | null;
    namespacedPeople: number;
    children: Array<{
        firstName: string;
        customerMemberId: string;
        agreements: number;
        /** PARTICIPATION truth — absent is exactly the defect this verify exists to catch. */
        processInstanceId: string | null;
        /** Live journeys for this child. Anything but 1 is a defect, and a duplicate is not an absence. */
        processInstanceCount: number;
        stageKey: string | null;
        /** Can Attendance resolve a subject for this child? */
        attendanceSubject: boolean;
        /** PASS requires BOTH truth systems, never one. */
        ok: boolean;
    }>;
    /** Records outside the namespace, counted so a run can prove it disturbed nothing. */
    unrelatedChildren: number;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * PROVE THE SELECTOR IS SAFE BEFORE ANY WRITE.
 *
 * The reserved domain must match only records whose address actually ends with it. Asserting this
 * against live data — rather than in a comment — is what makes the blast radius a fact.
 */
async function assertNamespaceIsolated(supabase: SupabaseClient, orgId: string): Promise<void> {
    const { data, error } = await supabase
        .from("persons")
        .select("id, email")
        .eq("org_id", orgId)
        .like("email", `%@${CERT_DOMAIN}`);
    if (error) throw new Error(`namespace probe failed: ${error.message}`);
    const stray = (data ?? []).find((p) => !t(p.email).toLowerCase().endsWith(`@${CERT_DOMAIN}`));
    if (stray) throw new Error("namespace selector matched outside the reserved domain — refusing to write");
}

async function findHousehold(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ customerId: string | null; personId: string | null }> {
    const { data: person } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("email", CERT_PARENT_EMAIL)
        .maybeSingle();
    if (!person?.id) return { customerId: null, personId: null };
    const { data: link } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", person.id as string)
        .limit(1)
        .maybeSingle();
    return { customerId: (link?.customer_id as string) ?? null, personId: person.id as string };
}

export async function ensureOperationalCardsCertification(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null,
): Promise<CertificationEnsureResult> {
    await assertNamespaceIsolated(supabase, orgId);

    const existing = await findHousehold(supabase, orgId);
    let customerId = existing.customerId;
    let personId = existing.personId;
    let opportunityId: string | null = null;
    const reused = Boolean(customerId);

    if (!customerId) {
        // THE REAL COMMAND. Identity is settled by the command, not by this caller.
        const created = await executeCreateLeadAction(
            supabase,
            { orgId, userId: actorUserId ?? undefined },
            {
                merged: {
                    first_name: CERT_PARENT.firstName,
                    last_name: CERT_PARENT.lastName,
                    email: CERT_PARENT_EMAIL,
                    phone: CERT_PARENT.phone,
                },
                context: { surface: "operational_cards_certification" },
            },
        );
        if (!created.ok) {
            return { ok: false, reason: `create_lead failed: ${created.error}` };
        }
        if (created.mode === "processing_review") {
            // FAIL CLOSED. The command found the identity ambiguous, and resolving that is a human
            // judgement the product deliberately reserves. Forcing "create new" here would be the
            // duplicate-person bug this gate exists to prevent.
            return {
                ok: false,
                needsOperator: true,
                reason:
                    "create_lead returned processing_review: the certification identity is ambiguous. "
                    + "Refusing to force a new person — resolve it once in BOS, then re-run ensure.",
            };
        }
        opportunityId = t(created.opportunity_id) || null;
        personId = t(created.person_id) || null;
        customerId = t(created.customer_id) || null;
        if (!customerId) {
            /*
             * RE-RESOLVE RATHER THAN TRUST THE OPTIONAL FIELD.
             *
             * `customer_id` is optional on the command's result and is not populated on every
             * committed path, so reading it as the source of truth aborts after the household has
             * already been created — leaving a real record behind and reporting failure. The
             * household is looked up the same way `ensure` finds an existing one, which also keeps
             * this idempotent when a previous run stopped here.
             */
            const settled = await findHousehold(supabase, orgId);
            customerId = settled.customerId;
            personId = personId ?? settled.personId;
        }
    }

    if (!customerId) return { ok: false, reason: "no certification household after create_lead" };

    // Site and room: `directEnroll` refuses without a site, and without a program or room the child
    // would be enrolled nowhere.
    // A room must belong to the SITE we enrol into — a room under another campus would place the
    // child somewhere the site says they are not.
    const { data: rooms } = await supabase
        .from("locations")
        .select("id, parent_location_id")
        .eq("org_id", orgId)
        .eq("location_type", "unit")
        .not("parent_location_id", "is", null)
        .limit(1);
    const room = rooms?.[0] ?? null;
    let siteLocationId = (room?.parent_location_id as string) ?? null;
    const roomLocationId = (room?.id as string) ?? null;
    if (!siteLocationId) {
        const { data: sites } = await supabase.from("locations").select("id").eq("org_id", orgId).limit(1);
        siteLocationId = (sites?.[0]?.id as string) ?? null;
    }
    if (!siteLocationId) return { ok: false, reason: "no site location configured — cannot enrol anyone" };

    /*
     * A SCHEDULE IS REQUIRED, and rightly so: without one the child is never EXPECTED on any day,
     * so Roster and Attendance would never see them — which would make an "enrolled" certification
     * subject useless for the very cards it exists to certify.
     *
     * The pattern is read from the site's own active patterns through the canonical reader rather
     * than guessed from a schedule-type string.
     */
    const { listSchedulePatterns } = await import("@/lib/childcareOperational/schedulePatternService");
    const patterns = await listSchedulePatterns(supabase, orgId, { siteLocationId, isActive: true });
    const schedulePatternId = (patterns?.[0] as { id?: string } | undefined)?.id ?? null;
    if (!schedulePatternId) {
        return {
            ok: false,
            reason: `no active schedule pattern at site ${siteLocationId} — configure one before certification`,
        };
    }

    /*
     * THE HOUSEHOLD'S ENROLLMENT EPISODE.
     *
     * Resolved for the REUSE path too, not only when `create_lead` just returned one. Every child's
     * journey has to be created inside it — see the context note in the loop below — and on a reused
     * household the id was simply never looked up, which is how the certification children ended up
     * with journeys that no child-grain Work View could ever contain.
     */
    if (!opportunityId) {
        const { data: oppRow } = await supabase
            .from("opportunities")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
        opportunityId = t((oppRow as { id?: string } | null)?.id) || null;
    }

    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);
    const children: CertificationChildResult[] = [];

    for (const child of CERT_CHILDREN) {
        const { data: found } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("first_name", child.firstName)
            .maybeSingle();

        let memberId: string | null = (found?.id as string) ?? null;
        if (!memberId) {
            const added = await addChild(supabase, {
                orgId,
                customerId,
                firstName: child.firstName,
                lastName: child.lastName,
                dob: child.dob,
            } as Parameters<typeof addChild>[1]);
            memberId = t((added as { customerMemberId?: string }).customerMemberId) || null;
        }
        if (!memberId) return { ok: false, reason: `could not resolve ${child.firstName}` };

        /*
         * BOTH TRUTH SYSTEMS, EACH FROM ITS OWN OWNER.
         *
         * A child needs durable enrolment AND participation. `directEnroll` alone produced the first
         * and skipped the second by design — it "skips the journey" — which left the certification
         * children with real agreements and no process instance, so no child-grain Work View could
         * select them. That was the defect, and it was in the fixture, not in the Work View.
         *
         * `startEnrollment` is the journey's own service and is idempotent (it reuses an open
         * instance). The stage then moves through the canonical mover rather than an insert.
         */
        /*
         * REUSE BEFORE CREATE.
         *
         * `startEnrollment` reuses an OPEN instance for a live episode, but a context-free child
         * (no opportunity resolved) gets a fresh one every call — so calling it unconditionally
         * stacked a second instance per child on the second ensure. Checking first is what makes
         * ensure genuinely idempotent rather than idempotent-looking.
         */
        /*
         * ORDERED, AND CLOSED JOURNEYS ARE NOT CANDIDATES.
         *
         * An unordered `limit(1)` picked whichever row the planner returned first, so after `repair`
         * closed a surplus journey, the next `ensure` selected that CLOSED row and moved it back to
         * enrolled — undoing the repair and leaving two live journeys again. Reuse must name the
         * same instance every time, and a journey deliberately ended is not one to resume.
         */
        const { data: existingPis } = await supabase
            .from("process_instances")
            .select("id, state, created_at")
            .eq("org_id", orgId)
            .eq("subject_id", memberId)
            .order("created_at", { ascending: true });
        const reusablePi = ((existingPis ?? []) as Array<{ id?: string; state?: string | null }>).find(
            (r) => t(r.state) !== "not_enrolling",
        );
        let processInstanceId = t(reusablePi?.id) || null;
        let journeyOpportunityId: string | null = null;
        if (!processInstanceId) {
            /*
             * THE JOURNEY MUST BE CREATED INSIDE THE HOUSEHOLD'S EPISODE.
             *
             * `startEnrollment` was the obvious door and it is the wrong one here, for a structural
             * reason rather than a preference. It asks `resolveLiveEnrollmentContextForHousehold`
             * whether the household has a live episode, and that resolver defines "live" as an
             * opportunity that ALREADY CONTAINS a running child journey. A restored — or simply
             * childless — episode contains none, so the answer is always "no" and every journey it
             * creates is context-free.
             *
             * Context-free is not a cosmetic difference. `queryEnrollmentProcessInstanceTrackRows`,
             * the production child-grain reader, resolves `context_id` to an opportunity and SKIPS
             * the row when it cannot, so a context-free journey is invisible to EVERY child-grain
             * Work View no matter what stage it reports. The `enrolled-children` lens read zero
             * members while both children verified green, which is exactly that gap.
             *
             * `createEnrollmentProcessInstance` with a `contextId` is the same writer `create_lead`
             * uses for a child it already knows about (`applyCreateLeadChildParticipationFromIdentity`
             * → "process_instances is the runtime owner of child participation"). Using it here makes
             * the two-step create_lead + addChild sequence produce the same participation truth that
             * one-step create_lead-with-children does.
             */
            if (opportunityId) {
                const created = await createEnrollmentProcessInstance(supabase, {
                    orgId,
                    subjectId: memberId,
                    contextId: opportunityId,
                    // Rides the family track until the stage move below decides the child journey —
                    // the same shape Create Lead writes at intake.
                    stageKey: null,
                    state: null,
                } as Parameters<typeof createEnrollmentProcessInstance>[1]);
                if (created.error) return { ok: false, reason: `journey create failed: ${created.error}` };
                processInstanceId = t(created.id) || null;
                journeyOpportunityId = opportunityId;
            } else {
                // No episode at all: a context-free journey is the honest outcome, and the platform
                // permits it. The child simply will not appear in a child-grain lens.
                const journey = await startEnrollment(supabase, {
                    orgId,
                    customerMemberId: memberId,
                } as Parameters<typeof startEnrollment>[1]);
                processInstanceId = t(journey.processInstanceId) || null;
                journeyOpportunityId = t(journey.opportunityId) || null;
            }
        }

        if (processInstanceId) {
            const currentStage = journeyOpportunityId
                ? await readEnrollmentInstanceStageKey(supabase, {
                      orgId,
                      opportunityId: journeyOpportunityId,
                      customerMemberId: memberId,
                  }).catch(() => null)
                : null;
            // Self-healing: already terminal is left alone, anything else advances to it.
            if (t(currentStage as unknown) !== ENROLLED_STAGE_KEY) {
                await moveProcessInstanceStage(supabase, {
                    orgId,
                    instanceId: processInstanceId,
                    stageKey: ENROLLED_STAGE_KEY,
                });
                await setProcessInstanceState(supabase, {
                    orgId,
                    instanceId: processInstanceId,
                    state: "enrolled" as never,
                }).catch(() => undefined);
            }
        }

        /*
         * THE PARTICIPATION ROW IS WHAT A CHILD-GRAIN WORK VIEW SELECTS.
         *
         * Moving the process instance was necessary and not sufficient: a Work View filtering
         * "Stage equals Enrolled" reads the PARTICIPATION's disposition, not the instance's stage.
         * With the instance advanced and the row untouched the view still returned nothing — the
         * same silent gap one layer down. This uses the canonical lifecycle writer rather than an
         * update, so the transition emits its events like any other.
         */
        const { data: ocmRow } = await supabase
            .from("opportunity_customer_members")
            .select("id, opportunity_id, outcome_status_key")
            .eq("org_id", orgId)
            .eq("customer_member_id", memberId)
            .maybeSingle();
        const ocmId = t((ocmRow as { id?: string } | null)?.id);
        const oppId = t((ocmRow as { opportunity_id?: string } | null)?.opportunity_id);
        const currentDisposition = t((ocmRow as { outcome_status_key?: string } | null)?.outcome_status_key);
        if (ocmId && oppId && currentDisposition !== ENROLLED_STAGE_KEY) {
            await updateOpportunityCustomerMemberLifecycleStatus({
                supabase,
                orgId,
                opportunityId: oppId,
                opportunityCustomerMemberId: ocmId,
                nextStatusKey: ENROLLED_STAGE_KEY,
                rowGrain: "child",
                source: "operational_cards_certification",
                actorUserId,
            } as Parameters<typeof updateOpportunityCustomerMemberLifecycleStatus>[0]);
        }

        // Idempotent: an existing open agreement is reused by the materializer rather than doubled.
        // The refusal carries BLOCKERS; surfacing them is the difference between "cannot enrol" and
        // a statement of what is missing.
        let enrolled: Awaited<ReturnType<typeof directEnroll>>;
        try {
            enrolled = await directEnroll(supabase, {
                orgId,
                customerMemberId: memberId,
                siteLocationId,
                roomLocationId,
                schedulePatternId,
                startDate: todayYmd,
                todayYmd,
                actorUserId,
            } as Parameters<typeof directEnroll>[1]);
        } catch (e) {
            const blockers = (e as { blockers?: Array<{ code?: string; message?: string }> }).blockers;
            const detail = Array.isArray(blockers)
                ? blockers.map((b) => `${b.code ?? "?"}: ${b.message ?? ""}`).join(" · ")
                : (e as Error).message;
            return { ok: false, reason: `directEnroll refused ${child.firstName} — ${detail}` };
        }

        children.push({
            firstName: child.firstName,
            customerMemberId: memberId,
            agreementId: t(enrolled.agreementId) || null,
            placementId: t(enrolled.placementId) || null,
            scheduleAssignmentId: t(enrolled.scheduleAssignmentId) || null,
            processInstanceId,
            stageKey: ENROLLED_STAGE_KEY,
        });
    }

    return { ok: true, customerId, personId, opportunityId, children, reused };
}

export async function verifyOperationalCardsCertification(
    supabase: SupabaseClient,
    orgId: string,
): Promise<CertificationVerifyResult> {
    const { customerId } = await findHousehold(supabase, orgId);
    const { data: people } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .like("email", `%@${CERT_DOMAIN}`);

    const children: CertificationVerifyResult["children"] = [];
    if (customerId) {
        const { data: members } = await supabase
            .from("customer_members")
            .select("id, first_name")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        for (const m of members ?? []) {
            const memberId = m.id as string;
            const { data: ag } = await supabase
                .from("child_enrollment_agreements")
                .select("id")
                .eq("org_id", orgId)
                .eq("customer_member_id", memberId);

            /*
             * Participation, read straight from the process instance rather than inferred.
             *
             * ORDERED AND COUNTED, never `maybeSingle()`. A second instance made that call return
             * null, so a child with TWO journeys verified identically to a child with NONE — the
             * duplicate read as an absence. The oldest row is the one `ensure` selects, and the
             * count travels with it so a duplicate is reported rather than masked.
             */
            const { data: piRows } = await supabase
                .from("process_instances")
                .select("id, stage_key, state, created_at")
                .eq("org_id", orgId)
                .eq("subject_id", memberId)
                .order("created_at", { ascending: true });
            const allInstances = (piRows ?? []) as Array<{ id: string; stage_key?: string | null; state?: string | null }>;
            // A journey closed as not_enrolling is a record, not a competing participation.
            const liveInstances = allInstances.filter((r) => t(r.state) !== "not_enrolling");
            const pi = liveInstances[0] ?? null;
            const processInstanceCount = liveInstances.length;

            const subject = await resolveAttendanceSubject(supabase, orgId, memberId);
            const agreements = (ag ?? []).length;
            const stageKey = (pi as { stage_key?: string | null } | null)?.stage_key ?? null;
            const processInstanceId = (pi as { id?: string } | null)?.id ?? null;

            children.push({
                firstName: t(m.first_name),
                customerMemberId: memberId,
                agreements,
                processInstanceId,
                processInstanceCount,
                stageKey,
                attendanceSubject: subject.ok,
                /*
                 * BOTH SYSTEMS, OR IT IS NOT A PASS.
                 *
                 * The previous verify asked only for an agreement, so it passed green while the
                 * children had no process instance at all — and a child-grain Work View returned
                 * nothing. Requiring participation here is what turns that silent gap into a failure.
                 */
                ok:
                    agreements === 1
                    && processInstanceCount === 1
                    && Boolean(processInstanceId)
                    && stageKey === ENROLLED_STAGE_KEY
                    && subject.ok,
            });
        }
    }

    // Everything NOT in the namespace, so a caller can prove the fixture disturbed nothing.
    const { count } = await supabase
        .from("customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .neq("customer_id", customerId ?? "00000000-0000-0000-0000-000000000000");

    return {
        householdPresent: Boolean(customerId),
        customerId,
        namespacedPeople: (people ?? []).length,
        children,
        unrelatedChildren: count ?? 0,
    };
}

/*
 * THERE IS NO DESTRUCTIVE RESET, AND THAT IS THE DESIGN.
 *
 * `resetOperationalCardsCertification` used to live here and deleted the fixture outside-in. It is
 * gone rather than deprecated, because a destructive verb that merely goes unused is one call away
 * from being used again. Once a certification child has Attendance history, deleting it is not
 * something the platform permits — `child_attendance_events` refuses DELETE by DB rule, and that
 * refusal cascades to the agreement, the member and the household that history hangs off.
 *
 * Attempting it anyway is what produced a HALF-REMOVED fixture: the parent person, the household
 * link, participation, placements and schedule assignments were gone while the members, agreements
 * and events survived — a state `ensure` could not see, because it finds the household through the
 * person and would have built a second one alongside the orphans.
 *
 * `repair` restores that graph and `restore` neutralizes the day by appending reversals. Between
 * them they do everything reset was actually wanted for, without ever claiming that something which
 * happened did not.
 */


/**
 * FIXTURE-OWNED IDENTITY, PROVEN RATHER THAN GUESSED.
 *
 * The reserved e-mail anchor was deleted by a partial reset, so the household can no longer be
 * found the usual way. Surname alone is not authority — a real family could share it — so a member
 * counts as fixture-owned only when the deterministic name AND a surviving fixture artefact agree:
 * an enrollment agreement or a process instance this fixture created.
 *
 * Anything ambiguous fails closed. Re-attaching a real family to certification scaffolding would be
 * far worse than leaving orphans in place.
 */
export type CertificationGraphMember = {
    customerMemberId: string;
    firstName: string;
    customerId: string | null;
    agreementIds: string[];
    processInstanceIds: string[];
    /** Journeys still running — a closed one is history, never a duplicate. */
    liveProcessInstanceIds: string[];
    placements: number;
    scheduleAssignments: number;
    participations: number;
    attendanceEvents: number;
};

export type CertificationGraph = {
    members: CertificationGraphMember[];
    /** Household row, if it survived. */
    customerId: string | null;
    customerExists: boolean;
    personExists: boolean;
    opportunityIds: string[];
    /** Everything that blocks a clean verify, in plain terms. */
    missing: string[];
    ambiguous: string[];
};

export async function inspectCertificationGraph(
    supabase: SupabaseClient,
    orgId: string,
): Promise<CertificationGraph> {
    const expected = CERT_CHILDREN.map((c) => c.firstName);
    const { data: candidates } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name, customer_id")
        .eq("org_id", orgId)
        .eq("last_name", CERT_LAST_NAME);

    const members: CertificationGraphMember[] = [];
    const ambiguous: string[] = [];

    for (const firstName of expected) {
        const matches = (candidates ?? []).filter((m) => t(m.first_name) === firstName);
        if (matches.length > 1) {
            ambiguous.push(`${firstName}: ${matches.length} members share the reserved identity`);
            continue;
        }
        if (matches.length === 0) continue;
        const m = matches[0]!;
        const id = m.id as string;

        const [ags, pis, plc, sch, ocm, att] = await Promise.all([
            supabase.from("child_enrollment_agreements").select("id").eq("org_id", orgId).eq("customer_member_id", id),
            supabase.from("process_instances").select("id").eq("org_id", orgId).eq("subject_id", id),
            supabase.from("child_placements").select("id").eq("org_id", orgId).eq("customer_member_id", id),
            supabase.from("schedule_assignments").select("id").eq("org_id", orgId).eq("customer_member_id", id),
            supabase.from("opportunity_customer_members").select("id").eq("org_id", orgId).eq("customer_member_id", id),
            supabase.from("child_attendance_events").select("id").eq("org_id", orgId).eq("customer_member_id", id),
        ]);

        const agreementIds = (ags.data ?? []).map((r) => r.id as string);
        const allInstanceRows = (pis.data ?? []) as Array<{ id: string; state?: string | null }>;
        const processInstanceIds = allInstanceRows.map((r) => r.id);
        /*
         * LIVE journeys, separately from all of them. A deliberately closed journey is a record, not
         * a duplicate, and counting the raw rows reported "expected 1, found 3" against a child whose
         * single running journey was exactly right.
         */
        const liveInstanceIds = allInstanceRows.filter((r) => t(r.state) !== "not_enrolling").map((r) => r.id);

        // The corroboration rule: a reserved name alone never qualifies a member as fixture-owned.
        if (agreementIds.length === 0 && processInstanceIds.length === 0) {
            ambiguous.push(`${firstName}: reserved name with no fixture artefact — refusing to claim it`);
            continue;
        }

        members.push({
            customerMemberId: id,
            firstName,
            customerId: t(m.customer_id) || null,
            agreementIds,
            processInstanceIds,
            liveProcessInstanceIds: liveInstanceIds,
            placements: (plc.data ?? []).length,
            scheduleAssignments: (sch.data ?? []).length,
            participations: (ocm.data ?? []).length,
            attendanceEvents: (att.data ?? []).length,
        });
    }

    const customerId = members.find((m) => m.customerId)?.customerId ?? null;
    const [cust, person, opps] = await Promise.all([
        customerId
            ? supabase.from("customers").select("id").eq("org_id", orgId).eq("id", customerId).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from("persons").select("id").eq("org_id", orgId).eq("email", CERT_PARENT_EMAIL).maybeSingle(),
        customerId
            ? supabase.from("opportunities").select("id").eq("org_id", orgId).eq("customer_id", customerId)
            : Promise.resolve({ data: [] as { id: string }[] }),
    ]);

    const missing: string[] = [];
    if (!customerId || !(cust as { data?: unknown }).data) missing.push("household (customers)");
    if (!(person as { data?: unknown }).data) missing.push("certification parent (persons)");
    if (((opps as { data?: unknown[] }).data ?? []).length === 0) missing.push("opportunity");
    for (const m of members) {
        if (m.participations === 0) missing.push(`${m.firstName}: participation row`);
        if (m.placements === 0) missing.push(`${m.firstName}: placement`);
        if (m.scheduleAssignments === 0) missing.push(`${m.firstName}: schedule assignment`);
        if (m.agreementIds.length !== 1) missing.push(`${m.firstName}: expected 1 agreement, found ${m.agreementIds.length}`);
        if (m.liveProcessInstanceIds.length !== 1) {
            missing.push(
                `${m.firstName}: expected 1 live journey, found ${m.liveProcessInstanceIds.length}`,
            );
        }
    }
    if (members.length !== expected.length) missing.push(`expected ${expected.length} members, resolved ${members.length}`);

    return {
        members,
        customerId,
        customerExists: Boolean((cust as { data?: unknown }).data),
        personExists: Boolean((person as { data?: unknown }).data),
        opportunityIds: (((opps as { data?: { id: string }[] }).data) ?? []).map((o) => o.id),
        missing,
        ambiguous,
    };
}

export type CertificationRepairResult = {
    ok: boolean;
    /** Everything repair did, in order, so the operator can audit it without reading the DB. */
    actions: string[];
    /** Why repair stopped, when it did. */
    refusals: string[];
    graphBefore: CertificationGraph;
    ensure?: CertificationEnsureResult;
};

/**
 * REPAIR — restore the certification graph to its known state without erasing anything.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT `reset` ──
 *
 * `reset` used to hard-delete the subject. Once a certification child has Attendance history that is
 * no longer possible and it should not be: `child_attendance_events` is append-only by DB rule, and
 * the platform is right to refuse. The refusal cascaded — agreements, members and process instances
 * are all reachable from that history — and left the fixture half-removed: household and members and
 * agreements and events survived, while the parent person, the household link, participation, the
 * placements and the schedule assignments were gone.
 *
 * A half-removed fixture is worse than either end state, because `ensure` cannot see it. `ensure`
 * finds the household THROUGH the parent person, so with the person deleted it would conclude "no
 * household" and create a second one — leaving the surviving children orphaned under the first and
 * duplicating them under the second. Repair exists to close exactly that gap.
 *
 * ── IT RESTORES; IT NEVER RE-CREATES WHAT SURVIVED ──
 *
 * Rediscovery is `inspectCertificationGraph`, which requires the deterministic reserved name AND a
 * surviving fixture artefact before it will claim a member. Repair writes nothing when that is
 * ambiguous. It then restores the two things `ensure` cannot reach on its own — the parent person
 * and its household link — and hands everything else to `ensure`, which already reuses members,
 * agreements and process instances and re-materializes the durable trio through `directEnroll`.
 *
 * ── IT DOES NOT MANUFACTURE AN OPPORTUNITY ──
 *
 * The opportunity is genuinely gone and repair deliberately leaves it gone. An Opportunity is an
 * ACQUISITION EPISODE; this family is enrolled and settled. `startEnrollment` refuses to invent one
 * for exactly this reason — "inventing an Opportunity to satisfy a helper would manufacture an
 * acquisition episode that never happened and would put a settled family back into acquisition work
 * views" — and a fixture that wants a tidier graph is not a better reason than a product service's.
 * Certification does not need it: `verify` requires an agreement, a process instance at the enrolled
 * stage, and a resolvable attendance subject, and none of those is opportunity-scoped.
 *
 * ── SURPLUS JOURNEYS ARE CLOSED, NOT DELETED ──
 *
 * Two process instances per child survive, from the runs before `ensure` reused instead of creating.
 * The extra one is a journey that never produced an outcome, so it is CLOSED as `not_enrolling`
 * rather than removed. Deleting it would be the same mistake as deleting the history: the row is a
 * record that something happened, and the correction for a wrong record is a further record.
 */
export async function repairOperationalCardsCertification(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null,
): Promise<CertificationRepairResult> {
    await assertNamespaceIsolated(supabase, orgId);

    const graphBefore = await inspectCertificationGraph(supabase, orgId);
    const actions: string[] = [];
    const refusals: string[] = [];

    if (graphBefore.ambiguous.length > 0) {
        // FAIL CLOSED. Re-attaching a real family to certification scaffolding is far worse than
        // leaving orphans in place, so ambiguity ends the operation before any write.
        return {
            ok: false,
            actions,
            refusals: [`ambiguous ownership — refusing to write: ${graphBefore.ambiguous.join(" · ")}`],
            graphBefore,
        };
    }

    const customerId = graphBefore.customerId;
    if (!customerId || !graphBefore.customerExists) {
        // Nothing survived to repair. That is `ensure`'s job, not repair's, and saying so beats
        // silently building a household from a repair verb.
        return {
            ok: false,
            actions,
            refusals: ["no surviving certification household — run ensure, which creates one canonically"],
            graphBefore,
        };
    }

    /*
     * 1 · THE PARENT PERSON AND ITS HOUSEHOLD LINK.
     *
     * `upsertAndLinkPersonForAdmin` is the service behind the registered `add_family_member` action:
     * it resolves the person through `findOrCreatePersonInOrgWithMeta` and links `customer_persons`.
     * The household is the SURVIVING one, so this reconnects rather than replaces — which is the
     * whole difference between repair and a second `ensure`.
     */
    if (!graphBefore.personExists) {
        const { upsertAndLinkPersonForAdmin } = await import("@/lib/admin/person/upsertAndLinkPersonForAdmin");
        const linked = await upsertAndLinkPersonForAdmin(supabase, {
            orgId,
            firstName: CERT_PARENT.firstName,
            lastName: CERT_PARENT.lastName,
            email: CERT_PARENT_EMAIL,
            phone: CERT_PARENT.phone,
            roleType: "primary_contact",
            customerId,
            opportunityId: null,
        });
        if (!linked.ok || !linked.result.person_id) {
            return {
                ok: false,
                actions,
                refusals: [
                    "could not restore the certification parent person — refusing to continue"
                    + (linked.ok ? "" : `: ${linked.error}`),
                ],
                graphBefore,
            };
        }
        actions.push(
            `restored parent person ${linked.result.person_id} and linked it to household ${customerId}`,
        );
    } else {
        actions.push("parent person already present — left alone");
    }

    /*
     * 2 · THE ENROLLMENT EPISODE.
     *
     * ── WHY THIS IS RESTORATION AND NOT INVENTION ──
     *
     * My first pass left the opportunity out, reasoning that an Opportunity is an ACQUISITION EPISODE
     * and this household is already enrolled. That reasoning was wrong here, and the Work View proved
     * it: `enrolled-children` returned zero rows with both children verifying green.
     *
     * `queryEnrollmentProcessInstanceTrackRows` — the production child-grain reader — resolves each
     * instance's `context_id` to an opportunity and SKIPS the row when it cannot:
     *
     *     const opp = pi.context_id ? refs.oppById.get(pi.context_id) : null;
     *     if (!opp) continue;
     *
     * So a context-free journey is structurally invisible to every child-grain lens, whatever its
     * stage says. And this household's episode was not absent by design: `create_lead` created one,
     * and the botched reset deleted it. Restoring it restores what the canonical path built.
     *
     * ── THE DOOR ──
     *
     * `executeCreateLeadAction` cannot be re-run: the parent person now exists, so identity
     * resolution requires review and the command correctly refuses to auto-commit. The canonical
     * writer underneath it takes an EXISTING household — `createLead` on the Processing identity
     * command ports — so that is what this calls. It deliberately does not go through the full
     * command handler, which also spawns stage-entry work ("Contact Family"): that work belongs to a
     * family being acquired, and inventing it for a family already in care would be the fabrication
     * this section is otherwise avoiding.
     */
    let episodeId: string | null = graphBefore.opportunityIds[0] ?? null;
    if (!episodeId) {
        const { data: personRow } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("email", CERT_PARENT_EMAIL)
            .maybeSingle();
        const primaryPersonId = t((personRow as { id?: string } | null)?.id);
        if (!primaryPersonId) {
            return {
                ok: false,
                actions,
                refusals: [...refusals, "no certification parent person to own the enrollment episode"],
                graphBefore,
            };
        }
        const { createDefaultIdentityCommandPorts } = await import(
            "@/lib/pos/processingIdentity/commands/ports"
        );
        const { NEW_LEAD_STATUS_KEY } = await import("@/lib/admin/actions/createLeadActionConstants");
        const created = await createDefaultIdentityCommandPorts().createLead(
            { supabase, orgId, actorId: actorUserId },
            {
                household_id: customerId,
                primary_person_id: primaryPersonId,
                name: `${CERT_PARENT.firstName} ${CERT_PARENT.lastName}`,
                status_key: NEW_LEAD_STATUS_KEY,
                // The lane a child sits in is its OWN instance stage; the episode only has to exist
                // and resolve, so it stays at the stage a new episode legitimately starts on.
                stage_key: "lead",
                work_unit_id: null,
            },
        );
        episodeId = t(created.id) || null;
        if (!episodeId) {
            return {
                ok: false,
                actions,
                refusals: [...refusals, "could not restore the enrollment episode"],
                graphBefore,
            };
        }
        actions.push(`restored enrollment episode ${episodeId} on household ${customerId}`);
    } else {
        actions.push(`enrollment episode ${episodeId} already present — left alone`);
    }

    /*
     * 3 · ONE LIVE JOURNEY PER CHILD, INSIDE THE EPISODE.
     *
     * ── WHY THIS IS NOT "CLOSE EVERYTHING BUT THE OLDEST" ──
     *
     * It was, and that was wrong twice over. The oldest instance is frequently one this fixture
     * already closed, so keeping it kept a corpse and closed the good journey; and a closed
     * CONTEXT-BOUND journey cannot be replaced at all, because `createEnrollmentProcessInstance`
     * upserts on `(org_id, process_key, subject_id, context_id)` with `ignoreDuplicates` and hands
     * back the existing row WHATEVER ITS STATE. Close that row and every later `ensure` receives the
     * same closed row and reports success over a journey that is not running. Verify caught it: two
     * children, one agreement each, zero live journeys.
     *
     * So the keeper is chosen by what makes a child appear in a child-grain lens — a journey bound to
     * the household's episode — and a keeper this fixture wrongly closed is RE-OPENED rather than
     * abandoned. Re-opening is the correction for a wrong state write, and it is the same canonical
     * writer that made the wrong one.
     */
    for (const member of graphBefore.members) {
        const { data: piRows } = await supabase
            .from("process_instances")
            .select("id, context_id, state, created_at")
            .eq("org_id", orgId)
            .eq("subject_id", member.customerMemberId)
            .order("created_at", { ascending: true });
        const rows = (piRows ?? []) as Array<{ id: string; context_id?: string | null; state?: string | null }>;
        const keeper = rows.find((r) => t(r.context_id) === episodeId) ?? null;

        if (keeper && t(keeper.state) === "not_enrolling") {
            // `enrolling` — live and non-terminal. `ensure` advances it to the enrolled outcome; this
            // only has to make it a journey again, and never asserts the outcome itself.
            const reopened = await setProcessInstanceState(supabase, {
                orgId,
                instanceId: keeper.id,
                state: "enrolling",
                closeReasonKey: null,
            });
            if (reopened.error) {
                refusals.push(`could not re-open journey ${keeper.id}: ${reopened.error}`);
            } else {
                actions.push(`re-opened episode journey ${keeper.id} for ${member.firstName}`);
            }
        }

        for (const row of rows) {
            if (keeper && row.id === keeper.id) continue;
            if (t(row.state) === "not_enrolling") continue;
            const closed = await setProcessInstanceState(supabase, {
                orgId,
                instanceId: row.id,
                state: "not_enrolling",
            });
            if (closed.error) {
                refusals.push(`could not close journey ${row.id}: ${closed.error}`);
                continue;
            }
            actions.push(
                t(row.context_id)
                    ? `closed duplicate journey ${row.id} for ${member.firstName}`
                    : `closed context-free journey ${row.id} for ${member.firstName} — it can never appear `
                      + "in a child-grain Work View",
            );
        }
    }

    /*
     * 4 · EVERYTHING ELSE IS `ensure`.
     *
     * With the person restored, `ensure` resolves the surviving household again and reuses what is
     * there: members by name, the open agreement inside `directEnroll`, the kept process instance.
     * The deleted placement and schedule assignment are re-materialized by `directEnroll`, which is
     * the same path the product uses — repair never inserts an agreement or a placement itself.
     *
     * It runs twice on purpose. `ensure` reads participation BEFORE `directEnroll` writes, so a row
     * that only comes into existence during the first pass is only reconciled on the second. Calling
     * it twice is also the cheapest real proof that it is idempotent.
     */
    const first = await ensureOperationalCardsCertification(supabase, orgId, actorUserId);
    if (!first.ok) {
        return { ok: false, actions, refusals: [...refusals, `ensure refused: ${first.reason}`], graphBefore, ensure: first };
    }
    actions.push("ensure pass 1 completed");
    const second = await ensureOperationalCardsCertification(supabase, orgId, actorUserId);
    if (!second.ok) {
        return { ok: false, actions, refusals: [...refusals, `ensure pass 2 refused: ${second.reason}`], graphBefore, ensure: second };
    }
    actions.push("ensure pass 2 completed");

    return { ok: refusals.length === 0, actions, refusals, graphBefore, ensure: second };
}

export type CertificationRestoreResult = {
    ok: boolean;
    /** Reversals appended, per child. Nothing is ever removed. */
    reversals: Array<{ firstName: string; reversedEventIds: string[]; failures: string[] }>;
    repair: CertificationRepairResult;
};

/**
 * RESTORE TO THE KNOWN CERTIFICATION STATE — the non-destructive replacement for `reset`.
 *
 * ── WHY `reset` HAD TO GO ──
 *
 * `reset` deleted the subject so the next run could start clean. That worked exactly until the
 * certification children had Attendance history, at which point the database refused:
 * "child_attendance_events is append-only: DELETE is not allowed. Record a correction/reversal
 * instead." The refusal is CORRECT — an attendance fact is a claim about a child's physical presence
 * in a room, and a system that lets a fixture erase those cannot be trusted with the real ones. The
 * mistake was mine, in wanting a destructive verb at all.
 *
 * So the baseline is restored the way the domain says a wrong fact is undone: by appending the
 * record that voids it. Every effective event gets a REVERSAL, authored through the same
 * `correctAttendanceEvent` an operator uses. The history still says what happened, and says that it
 * was voided — which is more true than the history a delete would have left, not less.
 *
 * ── "EFFECTIVE" IS THE FOLD'S WORD, NOT MINE ──
 *
 * Reversing every row would try to reverse reversals, which the service rightly refuses.
 * `effectiveAttendanceEvents` already answers "what is current truth after corrections and
 * reversals are applied", so restore reverses that set and nothing else. Running it twice therefore
 * appends nothing the second time — idempotent because the fold is, not because of a flag.
 *
 * ── AND THEN THE GRAPH ──
 *
 * Neutralizing the day is only half of "known state"; the other half is the enrolled graph itself,
 * which is `repair`. Restore ends by calling it, so one verb takes the fixture from any surviving
 * state back to the one certification expects.
 */
export async function restoreOperationalCardsCertification(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null,
): Promise<CertificationRestoreResult> {
    await assertNamespaceIsolated(supabase, orgId);

    const { correctAttendanceEvent, listAttendanceEvents } = await import(
        "@/lib/childcareOperational/attendance/attendanceService"
    );
    const { effectiveAttendanceEvents } = await import(
        "@/lib/childcareOperational/attendance/attendanceFold"
    );

    const graph = await inspectCertificationGraph(supabase, orgId);
    const reversals: CertificationRestoreResult["reversals"] = [];

    if (graph.ambiguous.length === 0) {
        for (const member of graph.members) {
            const reversedEventIds: string[] = [];
            const failures: string[] = [];
            const events = await listAttendanceEvents(supabase, orgId, {
                customerMemberId: member.customerMemberId,
            });
            for (const event of effectiveAttendanceEvents(events)) {
                try {
                    const written = await correctAttendanceEvent(supabase, {
                        orgId,
                        entryType: "reversal",
                        correctsEventId: event.id,
                        eventKind: event.event_kind,
                        eventAt: event.event_at,
                        serviceDate: event.service_date,
                        // A reversal restates the shape of what it voids: a room-scoped kind still
                        // needs its room, or `validateEventShape` refuses the write.
                        roomLocationId: event.room_location_id,
                        fromRoomLocationId: event.from_room_location_id,
                        toRoomLocationId: event.to_room_location_id,
                        note: "voided: operational cards certification restore",
                        actor: {
                            actorType: "system",
                            actorUserId,
                            actorLabel: "operational_cards_certification",
                            sourceType: "system",
                            sourceKey: "operational_cards_certification_restore",
                        },
                    } as Parameters<typeof correctAttendanceEvent>[1]);
                    reversedEventIds.push(written.id);
                } catch (e) {
                    failures.push(`${event.id}: ${(e as Error).message}`);
                }
            }
            reversals.push({ firstName: member.firstName, reversedEventIds, failures });
        }
    }

    const repair = await repairOperationalCardsCertification(supabase, orgId, actorUserId);
    const anyFailure = reversals.some((r) => r.failures.length > 0);
    return { ok: repair.ok && !anyFailure, reversals, repair };
}

/**
 * WHY A CHILD-GRAIN LENS DOES OR DOES NOT CONTAIN THE CERTIFICATION CHILDREN — read-only.
 *
 * The `enrolled-children` lens read zero members while both children verified green, and the two
 * possible causes are indistinguishable from outside: a lens that is stage-scoped and matching the
 * wrong key, or a lens the runtime reads as stage-INDEPENDENT, which selects by live participation
 * and therefore excludes `enrolled` — a TERMINAL enrollment state — by design.
 *
 * This reports what each production reader actually returns rather than re-deriving any of it, so the
 * answer is the runtime's own, not a second opinion about it.
 */
export async function diagnoseChildLens(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Record<string, unknown>> {
    const { savedWorkViewsFromDepartmentMetadata } = await import(
        "@/lib/lifecycle/resolveWorkViewRuntimeContext"
    );
    const { lensStageKeys } = await import("@/lib/lifecycle/lensStageKeys");
    const { childRowMembershipForLens, loadChildGrainMembersForLens } = await import(
        "@/lib/runtime/provisioning/childGrainMembership"
    );

    const { data: depts } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", orgId);

    const lenses: Array<Record<string, unknown>> = [];
    for (const dept of (depts ?? []) as Array<{ id: string; name?: string; metadata?: unknown }>) {
        const views = savedWorkViewsFromDepartmentMetadata(dept.metadata);
        for (const view of views) {
            const membership = childRowMembershipForLens(view);
            let members: number | string;
            try {
                members = (
                    await loadChildGrainMembersForLens({ supabase, orgId, workUnitId: "", view })
                ).length;
            } catch (e) {
                members = `error: ${(e as Error).message}`;
            }
            lenses.push({
                department: dept.name ?? dept.id,
                id: view.id,
                label: view.label,
                rowGrain: (view as { row_grain?: unknown }).row_grain ?? null,
                filters: (view.filters_v1 ?? []).map((f) => ({ field: f.field_key, op: f.operator, value: f.value })),
                stageKeys: lensStageKeys(view),
                membershipMode: membership.mode,
                members,
            });
        }
    }

    const graph = await inspectCertificationGraph(supabase, orgId);
    const memberIds = graph.members.map((m) => m.customerMemberId);
    const { data: pis } = memberIds.length
        ? await supabase
              .from("process_instances")
              .select("id, process_key, subject_type, subject_id, context_id, stage_key, state")
              .eq("org_id", orgId)
              .in("subject_id", memberIds)
        : { data: [] };
    const { data: opps } = graph.opportunityIds.length
        ? await supabase
              .from("opportunities")
              .select("id, stage_key, status_key, work_unit_id, customer_id")
              .eq("org_id", orgId)
              .in("id", graph.opportunityIds)
        : { data: [] };

    return { lenses, processInstances: pis ?? [], opportunities: opps ?? [] };
}
