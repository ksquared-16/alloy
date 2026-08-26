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
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { addChild } from "@/lib/records/addChildService";
import { directEnroll } from "@/lib/records/directEnrollService";

/** RFC-2606 reserved: nothing real can ever live here, so the selector cannot over-match. */
export const CERT_DOMAIN = "operational-cards-cert.alloy.invalid";
export const CERT_PARENT_EMAIL = `guardian@${CERT_DOMAIN}`;
const CERT_LAST_NAME = "Certhouse";

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
    children: Array<{ firstName: string; customerMemberId: string; agreements: number }>;
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
            const { data: ag } = await supabase
                .from("child_enrollment_agreements")
                .select("id")
                .eq("org_id", orgId)
                .eq("customer_member_id", m.id as string);
            children.push({
                firstName: t(m.first_name),
                customerMemberId: m.id as string,
                agreements: (ag ?? []).length,
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

/**
 * Remove the fixture, outside-in.
 *
 * Attendance events and charges reference the agreement; the trio references the member; the member
 * references the household. Every selector is anchored on ids reached from the reserved domain.
 */
export async function resetOperationalCardsCertification(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ removed: string[]; customerId: string | null }> {
    await assertNamespaceIsolated(supabase, orgId);
    const { customerId, personId } = await findHousehold(supabase, orgId);
    const removed: string[] = [];
    if (!customerId) return { removed, customerId: null };

    const { data: members } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    const memberIds = (members ?? []).map((m) => m.id as string);

    let agreementIds: string[] = [];
    if (memberIds.length) {
        const { data: ags } = await supabase
            .from("child_enrollment_agreements")
            .select("id")
            .eq("org_id", orgId)
            .in("customer_member_id", memberIds);
        agreementIds = (ags ?? []).map((a) => a.id as string);
    }

    const drop = async (table: string, column: string, ids: string[]) => {
        if (!ids.length) return;
        const { error } = await supabase.from(table).delete().eq("org_id", orgId).in(column, ids);
        if (!error) removed.push(table);
    };

    await drop("child_attendance_events", "enrollment_agreement_id", agreementIds);
    await drop("charges", "billable_source_id", agreementIds);
    await drop("schedule_assignments", "enrollment_agreement_id", agreementIds);
    await drop("child_placements", "enrollment_agreement_id", agreementIds);
    await drop("child_enrollment_agreements", "id", agreementIds);
    await drop("opportunity_customer_members", "customer_member_id", memberIds);
    await drop("customer_members", "id", memberIds);
    await drop("opportunities", "customer_id", [customerId]);
    await drop("customer_persons", "customer_id", [customerId]);
    await drop("customers", "id", [customerId]);
    if (personId) await drop("persons", "id", [personId]);

    return { removed, customerId };
}
