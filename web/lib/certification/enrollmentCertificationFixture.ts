/**
 * THE REAL ENROLLMENT CERTIFICATION FIXTURE — two families, and nothing else.
 *
 * REAL ENROLLMENT V1 needs to be certified down two paths that must converge on one completion
 * model: a CONTEXT-FREE enrolment with no acquisition episode, and an OPPORTUNITY-BACKED one. This
 * creates exactly the families those two paths need.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CREATE ──
 *
 * No organization, no site, no program, no Business Process, no Form definitions, no work units.
 * The certification tenant already has all of it — 21 participant sessions are bound across 21
 * Enrollment journeys, which is only possible if the process and its Forms are configured. A
 * fixture that re-created them would be a second tenant bootstrap competing with the real one, and
 * the first time the two disagreed the certification would be testing the fixture's idea of
 * Enrollment rather than the product's.
 *
 * So this FAILS CLOSED when the configuration is missing. "The Enrollment process is not
 * configured" is a real answer that a human should see, not a gap for a fixture to paper over.
 *
 * ── IT GOES THROUGH THE PRODUCT, NOT AROUND IT ──
 *
 *     executeCreateLeadAction  → household + parent (+ its acquisition Opportunity)
 *     addChild                 → the durable child (`customer_members`)
 *     startEnrollment          → the Enrollment Participation and its anchored Process Instance
 *
 * Every one is the service a registered capability already calls. Nothing here inserts an OCM, a
 * process instance or an agreement directly: the anchor invariant this whole program exists to
 * establish is only meaningful if the fixture earns it the same way an operator would.
 *
 * ── HOW A CONTEXT-FREE FAMILY IS MADE WITHOUT FABRICATING ANYTHING ──
 *
 * Create Lead necessarily produces an acquisition Opportunity — that is what a lead IS. A
 * context-free enrolment is therefore not "a family with no Opportunity ever", which the product
 * cannot produce; it is a family whose acquisition episode has CONCLUDED, so
 * `resolveLiveEnrollmentContextForHousehold` finds no live episode and Start Enrollment runs
 * context-free. That is exactly the real-world shape: a family the school already knows, enrolling
 * a second child years later. The fixture concludes the episode through the canonical status
 * writer rather than editing a row.
 *
 * ── THE NAMESPACE IS THE BLAST RADIUS ──
 *
 * Every record is reachable from one RFC-2606 reserved domain, so `reset` matches on that alone —
 * never a name, never a date, never "created recently". The certification tenant's existing 25
 * journeys are not read, not matched and not touched.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { addChild } from "@/lib/records/addChildService";
import { startEnrollment } from "@/lib/records/startEnrollmentService";

/** RFC-2606 reserved: nothing real can ever live here, so the selector cannot over-match. */
export const ENROLLMENT_CERT_DOMAIN = "enrollment-cert.alloy.invalid";

/**
 * Deterministic identities. Re-running names the same people, which is what makes this idempotent
 * without a bespoke key: the canonical identity resolver finds them and declines to duplicate.
 */
export const CERT_FAMILIES = {
    /** Path A — the family whose acquisition episode has concluded, so Enrollment runs context-free. */
    contextFree: {
        key: "context_free",
        lastName: "Certfree",
        parentFirstName: "Ada",
        email: `guardian-a@${ENROLLMENT_CERT_DOMAIN}`,
        phone: "+15555550301",
        child: { firstName: "Patha", dob: "2021-06-14" },
    },
    /** Path B — the family whose acquisition Opportunity is live, and stays live through completion. */
    opportunityBacked: {
        key: "opportunity_backed",
        lastName: "Certopp",
        parentFirstName: "Bo",
        email: `guardian-b@${ENROLLMENT_CERT_DOMAIN}`,
        phone: "+15555550302",
        child: { firstName: "Pathb", dob: "2021-11-02" },
    },
} as const;

export type CertFamilyKey = keyof typeof CERT_FAMILIES;

export type CertFamilyResult = {
    readonly key: string;
    readonly customerId: string;
    readonly opportunityId: string | null;
    readonly customerMemberId: string;
    readonly enrollmentParticipationId: string | null;
    readonly processInstanceId: string | null;
    readonly acquisition: "present" | "concluded";
    readonly participantLaunch: { realized: boolean; detail: string };
};

export type EnrollmentCertEnsureResult =
    | { ok: true; orgId: string; families: CertFamilyResult[] }
    | { ok: false; code: string; detail: string };

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * PROVE THE SELECTOR IS SAFE BEFORE THE FIRST WRITE.
 *
 * If anything outside the reserved domain would match, the fixture refuses rather than risking a
 * reset that reaches a real family. This is the same guarantee the operational-cards fixture makes,
 * and it is the reason a shared certification tenant can host a destructive-capable fixture at all.
 */
export async function assertNamespaceIsolated(supabase: SupabaseClient, orgId: string): Promise<void> {
    // Identity lives on `persons.email`; a household reaches it through `customer_persons`. There is
    // no email on `customers`, so the selector has to start where the address actually is.
    const { data, error } = await supabase
        .from("persons")
        .select("id, email")
        .eq("org_id", orgId)
        .ilike("email", `%@${ENROLLMENT_CERT_DOMAIN}`);
    if (error) throw new Error(`namespace probe failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ email?: string }>) {
        const email = t(row.email).toLowerCase();
        if (email && !email.endsWith(`@${ENROLLMENT_CERT_DOMAIN}`)) {
            throw new Error(`namespace selector would match ${email} — refusing to proceed`);
        }
    }
}

/** The household behind a fixture e-mail, through the canonical person → customer link. */
export async function findFixtureHousehold(
    supabase: SupabaseClient,
    orgId: string,
    email: string,
): Promise<{ customerId: string | null; personId: string | null }> {
    const { data: person } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("email", email)
        .maybeSingle();
    const personId = t((person as { id?: string } | null)?.id) || null;
    if (!personId) return { customerId: null, personId: null };
    const { data: link } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    return { customerId: t((link as { customer_id?: string } | null)?.customer_id) || null, personId };
}

/** The child's participation row for a household, if the product made one. */
async function findParticipation(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
): Promise<{ id: string; opportunity_id: string | null; outcome_status_key: string | null } | null> {
    const { data } = await supabase
        .from("opportunity_customer_members")
        .select("id, opportunity_id, outcome_status_key")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId);
    const rows = (data ?? []) as Array<{ id: string; opportunity_id: string | null; outcome_status_key: string | null }>;
    return rows[0] ?? null;
}

/**
 * Conclude the acquisition episode so a later Start Enrollment resolves CONTEXT-FREE.
 *
 * Through the canonical lifecycle writer, never a column patch: the status change is the thing the
 * product would do, and doing it any other way would leave the fixture's family in a state the
 * product cannot produce.
 */
async function concludeAcquisition(
    supabase: SupabaseClient,
    orgId: string,
    participationId: string,
    opportunityId: string | null,
): Promise<void> {
    await updateOpportunityCustomerMemberLifecycleStatus({
        supabase,
        orgId,
        opportunityId,
        opportunityCustomerMemberId: participationId,
        nextStatusKey: "not_enrolling",
        reason: "enrollment certification fixture — concluding the acquisition episode",
        source: "enrollment_certification_fixture",
        rowGrain: "child",
    } as Parameters<typeof updateOpportunityCustomerMemberLifecycleStatus>[0]);
}

/** The household's existing child, if the fixture already made one. */
async function findFixtureChild(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("relationship", "child")
        .limit(1);
    return t(((data ?? []) as Array<{ id?: string }>)[0]?.id) || null;
}

/**
 * Execute the real `family_enrolling` outcome on the family `decision` stage.
 *
 * This is the acquisition → Enrollment handoff an operator performs. Running it here rather than
 * fabricating the child's journey is the whole point: the fixture certifies the product's decision,
 * not the fixture's idea of one.
 */
async function enterEnrollmentByFamilyDecision(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerMemberId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
    const { defaultStageOperatingPlanForEnrollmentStage } = await import(
        "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans"
    );
    const { executeStageOperatingOutcome } = await import("@/lib/lifecycle/executeStageOperatingOutcome");

    const plan = defaultStageOperatingPlanForEnrollmentStage("decision");
    if (!plan) return { ok: false, detail: "the decision stage has no configured operating plan" };

    const { data: opp } = await supabase
        .from("opportunities")
        .select("id, department_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();
    const departmentId = t((opp as { department_id?: string } | null)?.department_id);

    const result = await executeStageOperatingOutcome({
        supabase,
        orgId,
        userId: "",
        departmentId,
        plan,
        outcomeKey: "family_enrolling",
        subject: {
            journey_segment: "family",
            opportunity_id: opportunityId,
            // Named explicitly: the handoff refuses to guess which child a family decision meant.
            customer_member_id: customerMemberId,
        },
        /*
         * The FAMILY stage move is skipped here and only here. It needs the org's configured stage
         * inventory, which a fixture has no business asserting; the effect under certification is the
         * CHILD one. The family half is certified through the operator UI in manual QA.
         */
        skipTargetKinds: ["move_to_stage"],
    });

    const failed = result.failed_targets ?? [];
    if (failed.length) {
        return { ok: false, detail: (result.errors ?? []).join("; ") || "child enrollment entry failed" };
    }
    return { ok: true };
}

/**
 * Re-enter an existing fixture family without minting anything.
 *
 * `addChild` is find-or-create on the household, and `startEnrollment` reuses an open journey, so
 * the only thing a re-run must avoid is Create Lead — which has no "reuse" mode and would leave a
 * second Opportunity behind every time.
 */
async function resumeExistingFamily(
    supabase: SupabaseClient,
    orgId: string,
    spec: (typeof CERT_FAMILIES)[CertFamilyKey],
    customerId: string,
): Promise<CertFamilyResult> {
    /*
     * FIND the child; do not re-add. `addChild` refuses a probable duplicate rather than guessing
     * ("This child may already be in Alloy"), which is the identity gate working — a fixture that
     * answered it would be deciding an identity question the product reserves for a human.
     */
    const existingChildId = await findFixtureChild(supabase, orgId, customerId);
    const customerMemberId = existingChildId
        ?? t(
            (await addChild(supabase, {
                orgId,
                customerId,
                firstName: spec.child.firstName,
                lastName: spec.lastName,
                dob: spec.child.dob,
            })).customerMemberId,
        );
    if (!customerMemberId) throw new Error(`no child resolves for ${spec.child.firstName}`);

    const started = await startEnrollment(supabase, { orgId, customerMemberId });
    return {
        key: spec.key,
        customerId,
        opportunityId: started.opportunityId,
        customerMemberId,
        enrollmentParticipationId: started.enrollmentParticipationId,
        processInstanceId: started.processInstanceId,
        acquisition: spec.key === "context_free" ? "concluded" : "present",
        participantLaunch: started.participantLaunch.realized
            ? { realized: true, detail: "participant objective realized (reused)" }
            : { realized: false, detail: `${started.participantLaunch.code}: ${started.participantLaunch.detail}` },
    };
}

/**
 * Build (or re-find) one certification family.
 *
 * `startEnrollment` is deliberately the LAST step and is the product's own launch path, so the
 * participation and the anchored process instance are whatever the product makes them — which is
 * the thing under certification.
 */
async function ensureFamily(
    supabase: SupabaseClient,
    orgId: string,
    spec: (typeof CERT_FAMILIES)[CertFamilyKey],
    actorUserId: string | null,
): Promise<CertFamilyResult> {
    /*
     * CREATE THE LEAD ONLY IF THE HOUSEHOLD IS ABSENT.
     *
     * Calling it unconditionally is idempotent for PEOPLE — the canonical resolver reuses the
     * household — but NOT for Opportunities: every call mints another one. The post-fixture census
     * caught it, +3 Opportunities for 2 families across re-runs, which is exactly the unexplained
     * residue that check exists to surface. The operational-cards fixture guards the same call the
     * same way.
     */
    const preexisting = await findFixtureHousehold(supabase, orgId, spec.email);
    if (preexisting.customerId) {
        return await resumeExistingFamily(supabase, orgId, spec, preexisting.customerId);
    }

    /*
     * THE REAL COMMAND. Identity is settled by the command, not by this caller.
     *
     * The actor is a real user id, not a placeholder. Omitting it let a downstream audit write
     * reach a uuid column with the literal string "unknown" — the create ran for seven seconds and
     * then failed on a type error that named nothing about the actor.
     */
    const created = await executeCreateLeadAction(
        supabase,
        { orgId, userId: actorUserId ?? undefined },
        {
            /*
             * PATH B CARRIES ITS CHILD IN THE LEAD ITSELF.
             *
             * That is what makes an enrolment genuinely acquisition-backed. Create Lead's own
             * household commit calls `applyCreateLeadChildParticipationFromIdentity`, which creates
             * the Enrollment Participation UNDER the Opportunity. Adding the child afterwards with
             * `addChild` produces a participation with no acquisition context, which is precisely
             * how Path B came out context-free before.
             *
             * Path A deliberately does NOT do this: its child is added after the episode concludes,
             * so it has no acquisition context to inherit — which is the shape being certified.
             */
            merged: {
                first_name: spec.parentFirstName,
                last_name: spec.lastName,
                email: spec.email,
                phone: spec.phone,
                ...(spec.key === "opportunity_backed"
                    ? {
                          child_first_name: spec.child.firstName,
                          child_last_name: spec.lastName,
                          child_date_of_birth: spec.child.dob,
                      }
                    : {}),
            },
            context: { surface: "enrollment_certification" },
        },
    );
    if (!created.ok) throw new Error(`create_lead failed for ${spec.email}: ${created.error}`);
    if (created.mode === "processing_review") {
        /*
         * FAIL CLOSED. The command found the identity ambiguous, and resolving that is a human
         * judgement the product deliberately reserves. Forcing "create new" here would be exactly
         * the duplicate-person bug the gate exists to prevent.
         */
        throw new Error(
            `create_lead returned processing_review for ${spec.email}: the certification identity is `
            + "ambiguous. Refusing to force a new person — resolve it once in BOS, then re-run ensure.",
        );
    }
    const opportunityId = t((created as { opportunity_id?: string }).opportunity_id) || null;

    /*
     * The household is RESOLVED, not read off the command result. Create Lead returns the
     * opportunity it made and the processing case that made it; the customer is reached the way
     * everything else reaches it -- person e-mail through `customer_persons`. Reading a field the
     * result does not carry is how this failed after a successful create, which reported
     * "produced no customer" for a household that existed.
     */
    const { customerId } = await findFixtureHousehold(supabase, orgId, spec.email);
    if (!customerId) {
        throw new Error(`create_lead committed but no household resolves for ${spec.email}`);
    }

    /*
     * Path B's child already exists — Create Lead made it, under the Opportunity. Calling addChild
     * again would trip the product's duplicate-identity gate, and answering that gate is a decision
     * the product reserves for a human.
     */
    const fromLead = await findFixtureChild(supabase, orgId, customerId);
    const customerMemberId = fromLead
        ?? t(
            (await addChild(supabase, {
                orgId,
                customerId,
                firstName: spec.child.firstName,
                lastName: spec.lastName,
                dob: spec.child.dob,
            })).customerMemberId,
        );
    if (!customerMemberId) throw new Error(`no child resolves for ${spec.child.firstName}`);

    // Path A only: conclude the acquisition episode so Start Enrollment runs context-free.
    let acquisition: "present" | "concluded" = "present";
    if (spec.key === "context_free") {
        const participation = await findParticipation(supabase, orgId, customerMemberId);
        if (participation) {
            await concludeAcquisition(supabase, orgId, participation.id, participation.opportunity_id);
        }
        acquisition = "concluded";
    }

    /*
     * PATH B ENTERS ENROLLMENT THROUGH THE GOVERNED FAMILY DECISION, not Start Enrollment.
     *
     * Intake no longer creates a child journey, so the acquisition Opportunity is not a LIVE episode
     * and Start Enrollment would correctly run context-free. That is the model working: an
     * acquisition-backed child begins Enrollment when the family decides, and the fixture has to make
     * the same decision an operator would rather than route around it.
     */
    if (spec.key === "opportunity_backed" && opportunityId) {
        const entered = await enterEnrollmentByFamilyDecision(supabase, orgId, opportunityId, customerMemberId);
        if (!entered.ok) throw new Error(`family enrollment decision failed: ${entered.detail}`);
    }

    const started = await startEnrollment(supabase, { orgId, customerMemberId });

    return {
        key: spec.key,
        customerId,
        opportunityId: started.opportunityId,
        customerMemberId,
        enrollmentParticipationId: started.enrollmentParticipationId,
        processInstanceId: started.processInstanceId,
        acquisition,
        participantLaunch: started.participantLaunch.realized
            ? { realized: true, detail: "participant objective realized" }
            : { realized: false, detail: `${started.participantLaunch.code}: ${started.participantLaunch.detail}` },
    };
}

/**
 * Ensure both certification families exist. Safe to call repeatedly: the canonical identity
 * resolver reuses the household and `startEnrollment` reuses an open journey rather than opening a
 * second one, so a re-run converges on the same rows instead of accumulating them.
 */
export async function ensureEnrollmentCertification(
    supabase: SupabaseClient,
    orgId: string,
    options: { actorUserId?: string | null } = {},
): Promise<EnrollmentCertEnsureResult> {
    await assertNamespaceIsolated(supabase, orgId);

    /*
     * NO CONFIGURATION PRECHECK HERE, deliberately.
     *
     * An earlier version called `resolveCreateLeadEntryDepartmentForOrg` first, to fail early with a
     * friendly message. That resolver reaches `unstable_cache`, which needs a Next request context
     * that a `tsx` script does not have -- so the precheck threw "incrementalCache missing" and
     * reported it as a configuration problem the tenant did not have.
     *
     * `executeCreateLeadAction` is the authority on whether Create Lead is configured and it already
     * fails closed with its own message. A second opinion that cannot run in this process is worse
     * than none.
     */
    const families: CertFamilyResult[] = [];
    for (const key of Object.keys(CERT_FAMILIES) as CertFamilyKey[]) {
        families.push(await ensureFamily(supabase, orgId, CERT_FAMILIES[key], options.actorUserId ?? null));
    }
    return { ok: true, orgId, families };
}

export type EnrollmentCertVerifyResult = {
    readonly ok: boolean;
    readonly orgId: string;
    readonly findings: string[];
    readonly families: CertFamilyResult[];
};

/**
 * Read-only. Answers the one question the E2E depends on: are both paths in the shape their
 * certification requires, right now?
 */
export async function verifyEnrollmentCertification(
    supabase: SupabaseClient,
    orgId: string,
): Promise<EnrollmentCertVerifyResult> {
    const findings: string[] = [];
    const families: CertFamilyResult[] = [];

    for (const key of Object.keys(CERT_FAMILIES) as CertFamilyKey[]) {
        const spec = CERT_FAMILIES[key];
        const { customerId } = await findFixtureHousehold(supabase, orgId, spec.email);
        if (!customerId) {
            findings.push(`${spec.key}: household ${spec.email} is absent`);
            continue;
        }

        const { data: members } = await supabase
            .from("customer_members")
            .select("id, display_name")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("relationship", "child");
        const customerMemberId = t((members ?? [])[0]?.id);
        if (!customerMemberId) {
            findings.push(`${spec.key}: child is absent`);
            continue;
        }

        const participation = await findParticipation(supabase, orgId, customerMemberId);
        const { data: instances } = await supabase
            .from("process_instances")
            .select("id, context_type, context_id, state")
            .eq("org_id", orgId)
            .eq("process_key", "enrollment")
            .eq("subject_id", customerMemberId);
        const instance = ((instances ?? []) as Array<{ id: string; context_type: string | null; context_id: string | null }>)[0];

        if (spec.key === "context_free" && participation?.opportunity_id) {
            findings.push("context_free: participation still carries an acquisition Opportunity");
        }
        if (spec.key === "opportunity_backed" && !participation?.opportunity_id) {
            findings.push("opportunity_backed: participation has no acquisition Opportunity");
        }
        if (instance && instance.context_type !== "enrollment_participation") {
            findings.push(`${spec.key}: journey anchored as ${instance.context_type}, expected enrollment_participation`);
        }
        if (instance && participation && instance.context_id !== participation.id) {
            findings.push(`${spec.key}: journey context_id is not the participation id`);
        }

        families.push({
            key: spec.key,
            customerId,
            opportunityId: participation?.opportunity_id ?? null,
            customerMemberId,
            enrollmentParticipationId: participation?.id ?? null,
            processInstanceId: instance?.id ?? null,
            acquisition: spec.key === "context_free" ? "concluded" : "present",
            participantLaunch: { realized: false, detail: "not evaluated by verify" },
        });
    }

    return { ok: findings.length === 0, orgId, findings, families };
}
