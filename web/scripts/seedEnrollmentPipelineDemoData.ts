#!/usr/bin/env npx tsx
/**
 * Enrollment demo seed (canonical identity v2):
 * - NO contacts (legacy)
 * - Persons are canonical identities (guardian + children)
 * - Customer is an explicit inquiry-stage household/account container
 * - Children are linked via customer_members + opportunity_customer_members (not metadata-only)
 *
 * Idempotent via `metadata.seed_key` on opportunities/customers/persons/customer_members.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const DEFAULT_ORG_ID = "7803388d-cdee-4afb-89cf-23a137f39423";
const DEFAULT_WORK_UNIT_KEY = "enrollment_pipeline";

const CHILD_CARE_ACTIVE_OPPORTUNITY_STATUS_KEYS = new Set([
    "new_inquiry",
    "contacted",
    "tour_scheduled",
    "tour_completed",
    "application_in_progress",
    "ready_to_enroll",
    "waitlisted",
    "enrolled",
    "lost",
]);

type SeedSpec = {
    seed_key: string;
    family_last: string;
    status_key: string;
    note: string;
    children: Array<{ first: string; last: string }>;
};

const DEMO_PROGRAMS: Array<{ program_label: string; age_group: string }> = [
    { program_label: "Toddler (2–3)", age_group: "Ages 24–36 mo" },
    { program_label: "Preschool (3–4)", age_group: "Ages 36–48 mo" },
    { program_label: "Pre-K (4–5)", age_group: "Ages 48–60 mo" },
    { program_label: "Infant (6–12 mo)", age_group: "Ages 6–12 mo" },
    { program_label: "Young Toddler (12–24 mo)", age_group: "Ages 12–24 mo" },
];

function isoDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function stableChildDob(seedKey: string, idx: number): string {
    // Deterministic DOB: 2–4 years old range.
    const base = Math.abs(`${seedKey}:${idx}`.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0));
    const yearsAgo = 2 + (base % 3); // 2..4
    const monthsAgo = base % 12;
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    d.setMonth(Math.max(0, d.getMonth() - monthsAgo));
    d.setDate(1 + (base % 27));
    return isoDateOnly(d);
}

function isoDate(d: Date): string {
    return d.toISOString();
}

function seedEmail(orgId: string, seedKey: string): string {
    const orgTag = orgId.replace(/-/g, "").slice(0, 10);
    const slug = (seedKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "seed").slice(0, 26);
    return `${slug}+${orgTag}@demo.alloy.invalid`;
}

function seedPhone(orgId: string, seedKey: string): string {
    const combined = `${seedKey}|${orgId}`;
    const n = Math.abs(combined.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0));
    const s = String(1000000 + (n % 9000000));
    return `+1415${s}`;
}

async function ensureCustomer(supabase: any, orgId: string, seedKey: string, familyLast: string): Promise<string> {
    const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((existing as any)?.id) return (existing as any).id;

    const { data: created, error } = await supabase
        .from("customers")
        .insert({
            org_id: orgId,
            name: `${familyLast} Family`,
            metadata: { seed_key: seedKey, demo_seed_package: "enrollment_pipeline_demo_v2" },
        })
        .select("id")
        .single();
    if (error) throw new Error(`customers insert failed (${seedKey}): ${error.message}`);
    return (created as any).id;
}

async function ensurePerson(
    supabase: any,
    orgId: string,
    seedKey: string,
    first: string,
    last: string,
    role: string
): Promise<string> {
    const k = `${seedKey}:${role}:${first}:${last}`;
    const { data: existing } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", k)
        .maybeSingle();
    if ((existing as any)?.id) return (existing as any).id;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: first,
            last_name: last,
            email: role === "guardian" ? seedEmail(orgId, seedKey) : null,
            phone: role === "guardian" ? seedPhone(orgId, seedKey) : null,
            // Canonical child identity DOB lives on `persons.date_of_birth`.
            ...(role.startsWith("child:")
                ? { date_of_birth: stableChildDob(seedKey, Number(role.split(":")[1] ?? 0) || 0) }
                : {}),
            metadata: { seed_key: k, demo_seed_package: "enrollment_pipeline_demo_v2" },
        })
        .select("id")
        .single();
    if (error) throw new Error(`persons insert failed (${seedKey}): ${error.message}`);
    return (created as any).id;
}

async function ensureCustomerPerson(supabase: any, orgId: string, customerId: string, personId: string): Promise<void> {
    const { error } = await supabase.from("customer_persons").insert({
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: "guardian",
        is_primary: true,
    } as any);
    if (error && !String((error as any).message ?? "").toLowerCase().includes("duplicate")) {
        console.log("WARN: customer_persons insert failed", { error: error.message });
    }
}

async function ensureCustomerMemberChild(
    supabase: any,
    orgId: string,
    customerId: string,
    seedKey: string,
    child: { first: string; last: string },
    idx: number
): Promise<string> {
    const memberSeedKey = `${seedKey}:child:${idx}`;
    const { data: existing } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("metadata->>seed_key", memberSeedKey)
        .maybeSingle();
    if ((existing as any)?.id) return (existing as any).id;

    const childPersonId = await ensurePerson(supabase, orgId, seedKey, child.first, child.last, `child:${idx}`);
    const display = `${child.first} ${child.last}`.trim();
    const { data: created, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            display_name: display,
            relationship: "child",
            first_name: child.first,
            last_name: child.last,
            // Compatibility fallback only; canonical DOB is `persons.date_of_birth`.
            dob: stableChildDob(seedKey, idx),
            person_id: childPersonId,
            metadata: { seed_key: memberSeedKey, demo_seed_package: "enrollment_pipeline_demo_v2" },
        } as any)
        .select("id")
        .single();
    if (error) throw new Error(`customer_members insert failed (${seedKey}): ${error.message}`);
    return (created as any).id;
}

async function ensureOpportunity(
    supabase: any,
    orgId: string,
    workUnitId: string | null,
    seedKey: string,
    familyLast: string,
    statusKey: string,
    guardianPersonId: string,
    customerId: string,
    note: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((existing as any)?.id) return (existing as any).id;

    const now = new Date();
    const prog = DEMO_PROGRAMS[Math.abs(seedKey.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0)) % DEMO_PROGRAMS.length]!;
    const desiredStart = isoDateOnly(new Date(now.getTime() + (18 + (now.getDate() % 10)) * 86400000));
    const tourEligible =
        statusKey === "tour_scheduled" ||
        statusKey === "tour_completed" ||
        statusKey === "application_in_progress" ||
        statusKey === "ready_to_enroll";
    const tourDate = tourEligible ? isoDateOnly(new Date(now.getTime() + (2 + (now.getDate() % 6)) * 86400000)) : null;

    const { data: created, error } = await supabase
        .from("opportunities")
        .insert({
            org_id: orgId,
            name: `Enrollment — ${familyLast} Family`,
            status_key: statusKey,
            work_unit_id: workUnitId,
            customer_id: customerId,
            primary_person_id: guardianPersonId,
            primary_contact_id: null,
            metadata: {
                seed_key: seedKey,
                demo_seed_package: "enrollment_pipeline_demo_v2",
                // Operational display fields (keep in metadata for now; identity is person-backed).
                program_label: prog.program_label,
                age_group: prog.age_group,
                desired_start_date: desiredStart,
                tour_date: tourDate,
                notes: note,
                next_step:
                    statusKey === "new_inquiry"
                        ? "Call to confirm age and preferred start window."
                        : statusKey === "contacted"
                          ? "Propose two tour times."
                          : statusKey === "tour_scheduled"
                            ? "Send tour reminder 24h ahead."
                            : "Move to the next clear step.",
            },
            created_at: isoDate(now),
            updated_at: isoDate(now),
        } as any)
        .select("id")
        .single();
    if (error) throw new Error(`opportunities insert failed (${seedKey}): ${error.message}`);
    return (created as any).id;
}

async function ensureOppChildJoin(supabase: any, orgId: string, opportunityId: string, customerMemberId: string): Promise<void> {
    const { error } = await supabase
        .from("opportunity_customer_members")
        .insert({ org_id: orgId, opportunity_id: opportunityId, customer_member_id: customerMemberId } as any);
    if (error && !String((error as any).message ?? "").toLowerCase().includes("duplicate")) {
        throw new Error(`opportunity_customer_members insert failed: ${error.message}`);
    }
}

async function deleteDemoRowsForOrg(supabase: any, orgId: string): Promise<{
    deleted_ocm: number;
    deleted_opportunities: number;
    deleted_customer_members: number;
    deleted_customer_persons: number;
    deleted_contacts: number;
    deleted_customers: number;
    deleted_persons: number;
}> {
    const packages = ["enrollment_pipeline_demo_v1", "enrollment_pipeline_demo_v2"];
    const likeSeed = "enroll_demo_%";

    // Collect demo opportunity ids first (for FK-safe join deletes).
    const { data: demoOpps } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`);
    const oppIds = (demoOpps ?? []).map((r: any) => r?.id).filter((x: any) => typeof x === "string" && x.trim());

    let deleted_ocm = 0;
    if (oppIds.length) {
        const { data } = await supabase
            .from("opportunity_customer_members")
            .delete()
            .eq("org_id", orgId)
            .in("opportunity_id", oppIds as any)
            .select("id");
        deleted_ocm = (data ?? []).length;
    }

    const { data: deletedOppRows } = await supabase
        .from("opportunities")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_opportunities = (deletedOppRows ?? []).length;

    const { data: deletedMemberRows } = await supabase
        .from("customer_members")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_customer_members = (deletedMemberRows ?? []).length;

    const { data: deletedCpRows } = await supabase
        .from("customer_persons")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_customer_persons = (deletedCpRows ?? []).length;

    // Contacts should not exist for the new seed, but clean v1 anyway.
    const { data: deletedContactRows } = await supabase
        .from("contacts")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_contacts = (deletedContactRows ?? []).length;

    const { data: deletedCustRows } = await supabase
        .from("customers")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_customers = (deletedCustRows ?? []).length;

    const { data: deletedPersonRows } = await supabase
        .from("persons")
        .delete()
        .eq("org_id", orgId)
        .or(`metadata->>demo_seed_package.in.(${packages.join(",")}),metadata->>seed_key.like.${likeSeed}`)
        .select("id");
    const deleted_persons = (deletedPersonRows ?? []).length;

    return {
        deleted_ocm,
        deleted_opportunities,
        deleted_customer_members,
        deleted_customer_persons,
        deleted_contacts,
        deleted_customers,
        deleted_persons,
    };
}

async function main() {
    const orgId = process.env.ORG_ID || DEFAULT_ORG_ID;
    const workUnitKey = process.env.WORK_UNIT_KEY || DEFAULT_WORK_UNIT_KEY;
    const supabase = createAdminClient();

    const { data: wu } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", workUnitKey)
        .maybeSingle();
    const workUnitId = (wu as any)?.id ?? null;

    const specs: SeedSpec[] = [
        {
            seed_key: "enroll_demo_new_2",
            family_last: "Chen",
            status_key: "new_inquiry",
            note: "New inquiry",
            children: [{ first: "Mia", last: "Chen" }],
        },
        {
            seed_key: "enroll_demo_contacted_1",
            family_last: "Patel",
            status_key: "contacted",
            note: "Contacted",
            children: [
                { first: "Liam", last: "Patel" },
                { first: "Mia", last: "Patel" },
            ],
        },
        {
            seed_key: "enroll_demo_tour_scheduled_stale",
            family_last: "Nguyen",
            status_key: "tour_scheduled",
            note: "Tour scheduled but stale",
            children: [{ first: "Sophia", last: "Nguyen" }],
        },
        {
            seed_key: "enroll_demo_stale_3d",
            family_last: "Stale",
            status_key: "contacted",
            note: "Stale >3d",
            children: [{ first: "Case", last: "Stale" }],
        },
    ];

    for (const s of specs) {
        if (!CHILD_CARE_ACTIVE_OPPORTUNITY_STATUS_KEYS.has(s.status_key)) {
            throw new Error(`Invalid status_key in seed spec ${s.seed_key}: ${s.status_key}`);
        }
    }

    console.log("[enrollment-seed] deleting old demo rows…", { orgId });
    const deleted = await deleteDemoRowsForOrg(supabase, orgId);
    console.log("[enrollment-seed] deleted", deleted);

    let seededOpportunities = 0;
    let seededChildMembers = 0;
    for (const spec of specs) {
        const customerId = await ensureCustomer(supabase, orgId, spec.seed_key, spec.family_last);
        const guardianId = await ensurePerson(supabase, orgId, spec.seed_key, "Parent", spec.family_last, "guardian");
        await ensureCustomerPerson(supabase, orgId, customerId, guardianId);
        const oppId = await ensureOpportunity(
            supabase,
            orgId,
            workUnitId,
            spec.seed_key,
            spec.family_last,
            spec.status_key,
            guardianId,
            customerId,
            spec.note
        );
        seededOpportunities++;
        for (let i = 0; i < spec.children.length; i++) {
            const cmId = await ensureCustomerMemberChild(supabase, orgId, customerId, spec.seed_key, spec.children[i]!, i);
            await ensureOppChildJoin(supabase, orgId, oppId, cmId);
            seededChildMembers++;
        }
        console.log("seeded", { seed_key: spec.seed_key, opportunity_id: oppId });
    }

    const { data: nullPersonMembers } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", "enrollment_pipeline_demo_v2")
        .is("person_id", null);
    const nullPersonCount = (nullPersonMembers ?? []).length;

    console.log("[enrollment-seed] seeded_counts", {
        orgId,
        workUnitKey,
        opportunities: seededOpportunities,
        child_members: seededChildMembers,
    });
    console.log("[enrollment-seed] validation", { demo_customer_members_person_id_null: nullPersonCount });
    if (nullPersonCount !== 0) {
        throw new Error(`Validation failed: customer_members.person_id is null for ${nullPersonCount} demo rows`);
    }
    console.log("Enrollment demo seed complete", { orgId, workUnitKey });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

