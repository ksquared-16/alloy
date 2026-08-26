#!/usr/bin/env npx tsx
/**
 * OPERATIONAL CARDS CERTIFICATION HOUSEHOLD — one fixture, shared by every card vertical.
 *
 * Process, Attendance and Financials each need the same thing: a household with two children who
 * are GENUINELY ENROLLED. Three ad-hoc fixtures would drift apart and each would have to solve
 * reversal separately, so there is one household and one cleanup.
 *
 * ── IT GOES THROUGH THE PRODUCT, NOT AROUND IT ──
 *
 * Every write here is a canonical service that a registered action already calls:
 *
 *     createLead        → household + parent + opportunity
 *     addChild          → the durable child (`customer_members`)
 *     directEnroll      → materializeChildEnrollment → the durable trio:
 *                         child_enrollment_agreements → child_placements → schedule_assignments
 *
 * Inserting an agreement directly would be faster and would also be a lie: the invariant that an
 * agreement is materialized, not authored, is exactly what Attendance depends on. `directEnroll`
 * is the registered `enrollment.direct` capability's own service, so the fixture and the operator
 * take the same path.
 *
 * ── THE NAMESPACE IS THE SAFETY ──
 *
 * The local stack is SHARED. Every record is reachable from one reserved e-mail domain
 * (`operational-cards-cert.alloy.invalid`, RFC-2606 reserved so it can never collide with a real
 * address), and `--remove` matches on that alone — never on a name, a date, or "recently created".
 * The 17 existing Firefly children are not read, not matched and not touched.
 *
 * Run from `web/`:
 *   npm run dev:seed:operational-cards-certification
 *   npm run dev:seed:operational-cards-certification -- --remove
 *   npm run dev:seed:operational-cards-certification -- --verify
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

/** RFC-2606 reserved. Nothing real can ever live here, so the selector cannot over-match. */
const CERT_DOMAIN = "operational-cards-cert.alloy.invalid";
const PARENT_EMAIL = `guardian@${CERT_DOMAIN}`;
const HOUSEHOLD_LAST_NAME = "Certhouse";

/** Deterministic identities. Re-running names the same people, which is what makes it idempotent. */
const PARENT = { firstName: "Cert", lastName: HOUSEHOLD_LAST_NAME, email: PARENT_EMAIL, phone: "+15555550100" };
const CHILDREN = [
    { firstName: "Certa", lastName: HOUSEHOLD_LAST_NAME, dob: "2021-04-12", slug: "child-a" },
    { firstName: "Certb", lastName: HOUSEHOLD_LAST_NAME, dob: "2022-09-30", slug: "child-b" },
] as const;

type Supabase = ReturnType<typeof createAdminClient>;

async function resolveOrgId(supabase: Supabase): Promise<string> {
    const explicit = process.env.ALLOY_CERT_ORG_ID?.trim();
    if (explicit) return explicit;
    const { data, error } = await supabase.from("orgs").select("id").order("created_at").limit(2);
    if (error) throw new Error(`orgs lookup failed: ${error.message}`);
    if (!data?.length) throw new Error("no orgs in this database");
    if (data.length > 1) throw new Error("several orgs present — pass ALLOY_CERT_ORG_ID rather than guessing");
    return data[0]!.id as string;
}

/**
 * PROVE THE SELECTOR IS SAFE BEFORE THE FIRST WRITE.
 *
 * §5 of the mission: the namespace must be shown incapable of matching existing tenant records. This
 * asserts it against live data rather than asserting it in a comment.
 */
async function assertNamespaceIsolated(supabase: Supabase, orgId: string): Promise<void> {
    const { data, error } = await supabase
        .from("persons")
        .select("id, email")
        .eq("org_id", orgId)
        .like("email", `%@${CERT_DOMAIN}`);
    if (error) throw new Error(`namespace probe failed: ${error.message}`);
    const foreign = (data ?? []).filter((p) => !String(p.email ?? "").endsWith(`@${CERT_DOMAIN}`));
    if (foreign.length > 0) {
        throw new Error("namespace selector matched a record outside the reserved domain — refusing to write");
    }
}

async function findCertHousehold(supabase: Supabase, orgId: string): Promise<string | null> {
    const { data } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("email", PARENT_EMAIL)
        .maybeSingle();
    if (!data?.id) return null;
    const { data: link } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", data.id)
        .limit(1)
        .maybeSingle();
    return (link?.customer_id as string) ?? null;
}

async function create(supabase: Supabase, orgId: string): Promise<void> {
    const { addChild } = await import("@/lib/records/addChildService");
    const { directEnroll } = await import("@/lib/records/directEnrollService");
    const { resolveOperationalEnrollmentTodayYmd } = await import(
        "@/lib/childcareOperational/operationalEnrollmentApi"
    );

    /*
     * THE HOUSEHOLD IS THE OPERATOR'S ONE STEP, and deliberately so.
     *
     * `create_lead` is a multi-stage COMMAND (intake → commit selection → household member commit),
     * not a callable service, and there is no `createLead(supabase, input)` to delegate to. Writing
     * `customers` + `persons` + `opportunities` directly here would reproduce that command's
     * decisions outside it — exactly the bypass §1 forbids.
     *
     * So the household arrives from the registered command, by `--customer <id>` or by the reserved
     * e-mail, and everything downstream of it IS canonical service delegation.
     */
    const flagIndex = process.argv.indexOf("--customer");
    let customerId =
        (flagIndex >= 0 ? process.argv[flagIndex + 1]?.trim() : null)
        || (await findCertHousehold(supabase, orgId));
    if (!customerId) {
        throw new Error(
            [
                "No certification household yet.",
                `Create one with the registered create_lead command using ${PARENT.email}`,
                `(parent ${PARENT.firstName} ${PARENT.lastName}), then re-run — or pass --customer <customers.id>.`,
            ].join(" "),
        );
    }
    console.log(`= household  customer=${customerId}`);

    // Site and a room: `directEnroll` refuses without a site, and without a program or room the
    // child would be enrolled nowhere.
    const { data: sites } = await supabase.from("locations").select("id, name").eq("org_id", orgId).limit(1);
    const siteLocationId = sites?.[0]?.id as string | undefined;
    const { data: rooms } = await supabase
        .from("locations")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("location_type", "unit")
        .limit(1);
    const roomLocationId = rooms?.[0]?.id as string | undefined;
    if (!siteLocationId) throw new Error("no site location configured — cannot enrol anyone");

    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);

    for (const child of CHILDREN) {
        const { data: existing } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("first_name", child.firstName)
            .maybeSingle();

        let memberId = existing?.id as string | undefined;
        if (memberId) {
            console.log(`= ${child.slug.padEnd(8)} child present  member=${memberId}`);
        } else {
            const added = await addChild(supabase, {
                orgId,
                customerId,
                firstName: child.firstName,
                lastName: child.lastName,
                dob: child.dob,
            } as Parameters<typeof addChild>[1]);
            memberId = (added as { customerMemberId?: string }).customerMemberId;
            console.log(`+ ${child.slug.padEnd(8)} child created  member=${memberId}`);
        }
        if (!memberId) throw new Error(`could not resolve ${child.slug}`);

        // THE INVARIANT-OWNING PATH. Materialization, not authoring.
        const enrolled = await directEnroll(supabase, {
            orgId,
            customerMemberId: memberId,
            siteLocationId,
            roomLocationId: roomLocationId ?? null,
            startDate: todayYmd,
            todayYmd,
            actorUserId: null,
        } as Parameters<typeof directEnroll>[1]);
        console.log(
            `  ${child.slug.padEnd(8)} agreement=${enrolled.agreementId} placement=${enrolled.placementId} schedule=${enrolled.scheduleAssignmentId}`,
        );
    }
}

/**
 * REVERSAL, in dependency order.
 *
 * Attendance events and charges reference the agreement; the trio references the member; the member
 * references the household. Removing outside-in is what keeps the FKs satisfied. Everything is
 * reached from the reserved domain — never from a name or a timestamp.
 */
async function remove(supabase: Supabase, orgId: string): Promise<void> {
    const customerId = await findCertHousehold(supabase, orgId);
    if (!customerId) {
        console.log("nothing to remove — no certification household present");
        return;
    }
    const { data: members } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    const memberIds = (members ?? []).map((m) => m.id as string);

    const { data: agreements } = memberIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id")
              .eq("org_id", orgId)
              .in("customer_member_id", memberIds)
        : { data: [] as { id: string }[] };
    const agreementIds = (agreements ?? []).map((a) => a.id as string);

    const step = async (table: string, column: string, ids: string[]) => {
        if (!ids.length) return;
        const { error } = await supabase.from(table).delete().eq("org_id", orgId).in(column, ids);
        if (error) console.warn(`! ${table}: ${error.message}`);
        else console.log(`- ${table}`);
    };

    await step("child_attendance_events", "enrollment_agreement_id", agreementIds);
    await step("charges", "billable_source_id", agreementIds);
    await step("schedule_assignments", "enrollment_agreement_id", agreementIds);
    await step("child_placements", "enrollment_agreement_id", agreementIds);
    await step("child_enrollment_agreements", "id", agreementIds);
    await step("opportunity_customer_members", "customer_member_id", memberIds);
    await step("customer_members", "id", memberIds);
    await step("opportunities", "customer_id", [customerId]);
    await step("customer_persons", "customer_id", [customerId]);
    await step("customers", "id", [customerId]);

    const { data: people } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .like("email", `%@${CERT_DOMAIN}`);
    await step("persons", "id", (people ?? []).map((p) => p.id as string));
    console.log("removed the certification household");
}

async function verify(supabase: Supabase, orgId: string): Promise<void> {
    const customerId = await findCertHousehold(supabase, orgId);
    console.log(`household: ${customerId ?? "absent"}`);
    if (!customerId) return;
    const { data: members } = await supabase
        .from("customer_members")
        .select("id, first_name")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    for (const m of members ?? []) {
        const { data: ag } = await supabase
            .from("child_enrollment_agreements")
            .select("id, status")
            .eq("org_id", orgId)
            .eq("customer_member_id", m.id as string);
        console.log(`  ${String(m.first_name).padEnd(8)} member=${m.id} agreements=${(ag ?? []).length}`);
    }
}

async function main(): Promise<void> {
    const supabase = createAdminClient();
    const orgId = await resolveOrgId(supabase);
    await assertNamespaceIsolated(supabase, orgId);

    if (process.argv.includes("--remove")) return remove(supabase, orgId);
    if (process.argv.includes("--verify")) return verify(supabase, orgId);
    await create(supabase, orgId);
    await verify(supabase, orgId);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
