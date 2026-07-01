/**
 * Idempotent childcare demo seed (internal). Re-run safe: skips if `demo_seed_package` marker exists.
 * Uses locations (site) as classrooms, persons for teachers/parents/children, customers as families,
 * person_relationships (parent), person_locations (child ↔ classroom), opportunities (Growth).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";

export const CHILDCARE_DEMO_SEED_PACKAGE = "childcare_demo_v1";

export type SeedChildcareDemoResult =
    | {
          ok: true;
          summary: {
              classrooms: number;
              teachers: number;
              parents: number;
              children: number;
              customers: number;
              opportunities: number;
          };
      }
    | { ok: false; error: string };

async function getChildcareVerticalId(supabase: SupabaseClient): Promise<string | null> {
    const { data } = await supabase.from("verticals").select("id").eq("slug", "childcare").eq("is_active", true).maybeSingle();
    return data && typeof (data as { id: string }).id === "string" ? (data as { id: string }).id : null;
}

async function findPersonBySeedKey(supabase: SupabaseClient, orgId: string, seedKey: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .contains("metadata", { seed_key: seedKey })
        .maybeSingle();
    if (error) return null;
    return data ? (data as { id: string }).id : null;
}

async function findLocationBySeedKey(supabase: SupabaseClient, orgId: string, seedKey: string): Promise<string | null> {
    const { data } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .contains("metadata", { seed_key: seedKey })
        .maybeSingle();
    return data ? (data as { id: string }).id : null;
}

const MISSING_CHILDCARE_VERTICAL_MSG =
    "Missing platform vertical: no active row in public.verticals with slug 'childcare' " +
    "(required for customers.vertical_id and opportunities.vertical_id in this seed). " +
    "Apply latest Supabase migrations from the repo (e.g. `supabase db push` or `supabase migration up` " +
    "against your dev database) so the platform childcare vertical is created. " +
    "If tenant bootstrap already completed for this run, the org exists — only the demo seed step failed.";

export async function seedChildcareDemo(supabase: SupabaseClient, orgId: string): Promise<SeedChildcareDemoResult> {
    const verticalId = await getChildcareVerticalId(supabase);
    if (!verticalId) {
        return { ok: false, error: MISSING_CHILDCARE_VERTICAL_MSG };
    }

    const classroomKeys = ["classroom_infants", "classroom_toddlers", "classroom_preschool"] as const;
    const classroomLabels = ["Infants — Room A", "Toddlers — Room B", "Preschool — Room C"];

    for (let i = 0; i < 3; i++) {
        const sk = classroomKeys[i];
        if (await findLocationBySeedKey(supabase, orgId, sk)) continue;
        const { error } = await supabase.from("locations").insert({
            org_id: orgId,
            customer_id: null,
            vendor_id: null,
            label: classroomLabels[i],
            location_type: "site",
            is_primary: false,
            is_active: true,
            metadata: {
                seed_key: sk,
                demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE,
                demo_classroom: true,
            },
        });
        if (error) {
            return { ok: false, error: `locations[${sk}]: ${error.message}` };
        }
    }

    const classroomIds: string[] = [];
    for (const sk of classroomKeys) {
        const id = await findLocationBySeedKey(supabase, orgId, sk);
        if (!id) return { ok: false, error: `Missing classroom after insert: ${sk}` };
        classroomIds.push(id);
    }

    for (let t = 1; t <= 5; t++) {
        const sk = `teacher_${t}`;
        if (await findPersonBySeedKey(supabase, orgId, sk)) continue;
        const { error } = await supabase.from("persons").insert({
            org_id: orgId,
            first_name: "Teacher",
            last_name: `${t}`,
            email: `demo.teacher.${t}.${orgId.slice(0, 8)}@invalid.local`,
            phone: `555-010${t}`,
            metadata: {
                seed_key: sk,
                demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE,
                demo_role: "teacher",
            },
        });
        if (error) return { ok: false, error: `persons[${sk}]: ${error.message}` };
    }

    type FamilyIds = {
        customerId: string;
        parentA: string;
        parentB: string;
        children: string[];
    };
    const families: FamilyIds[] = [];

    for (let f = 1; f <= 9; f++) {
        const custSeed = `family_${f}`;
        let customerId = (await findCustomerBySeed(supabase, orgId, custSeed)) ?? null;
        if (!customerId) {
            const { data: cRow, error: cErr } = await supabase
                .from("customers")
                .insert({
                    org_id: orgId,
                    name: `Family ${f} (Demo)`,
                    status: "active",
                    vertical_id: verticalId,
                    metadata: {
                        seed_key: custSeed,
                        demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE,
                    },
                })
                .select("id")
                .single();
            if (cErr || !cRow) {
                return { ok: false, error: `customers[${custSeed}]: ${cErr?.message ?? "insert failed"}` };
            }
            customerId = (cRow as { id: string }).id;
        }

        const paSeed = `parent_${f}_a`;
        const pbSeed = `parent_${f}_b`;
        let parentA = await findPersonBySeedKey(supabase, orgId, paSeed);
        if (!parentA) {
            parentA = await insertPerson(
                supabase,
                orgId,
                paSeed,
                "Parent",
                `A${f}`,
                `demo.parent.a.${f}.${orgId.slice(0, 8)}@invalid.local`
            );
        }
        if (!parentA) return { ok: false, error: `parent A family ${f}` };

        let parentB = await findPersonBySeedKey(supabase, orgId, pbSeed);
        if (!parentB) {
            parentB = await insertPerson(
                supabase,
                orgId,
                pbSeed,
                "Parent",
                `B${f}`,
                `demo.parent.b.${f}.${orgId.slice(0, 8)}@invalid.local`
            );
        }
        if (!parentB) return { ok: false, error: `parent B family ${f}` };

        // primary_contact matches BOOKING_CUSTOMER_PERSON_ROLE_TYPE / bookingCustomerPersonLink; childcare
        // vocabulary also includes parent/guardian for household semantics — seed uses primary_contact for demo/booking parity.
        await ensureCustomerPerson(supabase, orgId, customerId, parentA, "primary_contact", true);
        await ensureCustomerPerson(supabase, orgId, customerId, parentB, "primary_contact", false);

        const childIds: string[] = [];
        for (let c = 1; c <= 3; c++) {
            const chSeed = `child_${f}_${c}`;
            let cid = await findPersonBySeedKey(supabase, orgId, chSeed);
            if (!cid) {
                cid = await insertPerson(supabase, orgId, chSeed, "Child", `F${f}-${c}`, undefined, {
                    year: 2019 + c,
                    month: 3,
                    day: 15,
                });
            }
            if (!cid) return { ok: false, error: `child ${chSeed}` };
            childIds.push(cid);

            await ensureRelationship(supabase, orgId, parentA, cid, "parent");
            await ensureRelationship(supabase, orgId, parentB, cid, "parent");

            const roomIdx = (f - 1) % 3;
            await ensurePersonLocation(supabase, orgId, cid, classroomIds[roomIdx]);
        }

        families.push({ customerId, parentA, parentB, children: childIds });
    }

    const oppSpecs: Array<{
        seed_key: string;
        status_key: string;
        quote_total: number | null;
        familyIndex: number;
        updated_at?: string | null;
        locationClassroomIndex?: number;
        customer_notes?: string | null;
        job_date?: string | null;
        job_time_window?: string | null;
        demo_meta?: Record<string, string>;
    }> = [
        // Small but intentional distribution across lifecycle statuses.
        // A few rows are intentionally stale to populate Needs Attention via existing attention rules.
        { seed_key: "opp_demo_1", status_key: "new_inquiry", quote_total: null, familyIndex: 0, updated_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() }, // stale_new_inquiry
        { seed_key: "opp_demo_2", status_key: "new_inquiry", quote_total: null, familyIndex: 1 },
        { seed_key: "opp_demo_3", status_key: "contacted", quote_total: null, familyIndex: 2, updated_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString() }, // stale_qualified
        { seed_key: "opp_demo_4", status_key: "contacted", quote_total: null, familyIndex: 3 },
        { seed_key: "opp_demo_5", status_key: "tour_scheduled", quote_total: null, familyIndex: 4, updated_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString() }, // missing_quote_after_execution
        { seed_key: "opp_demo_6", status_key: "tour_completed", quote_total: null, familyIndex: 5 },
        { seed_key: "opp_demo_7", status_key: "ready_to_enroll", quote_total: 1850.0, familyIndex: 6, updated_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString() }, // stale_quote_followup
        { seed_key: "opp_demo_8", status_key: "ready_to_enroll", quote_total: 2100.0, familyIndex: 7 },
        { seed_key: "opp_demo_9", status_key: "waitlisted", quote_total: null, familyIndex: 8 },
        { seed_key: "opp_demo_10", status_key: "waitlisted", quote_total: null, familyIndex: 0 },
        // Closed outcomes (must exist in dept KPIs, must not appear in active execution queues)
        { seed_key: "opp_demo_11", status_key: "enrolled", quote_total: 2200.5, familyIndex: 1 },
        { seed_key: "opp_demo_12", status_key: "lost", quote_total: null, familyIndex: 2 },
        // Additional outliers for Needs Attention (distinct reasons; CRM-rich for workspace rows).
        {
            seed_key: "opp_attn_demo_1",
            status_key: "new_inquiry",
            quote_total: null,
            familyIndex: 5,
            updated_at: new Date(Date.now() - 1000 * 60 * 60 * 110).toISOString(),
            locationClassroomIndex: 0,
            customer_notes: "Asked about summer start.",
            demo_meta: {
                demo_requested_program: "Toddler program",
                demo_age_band: "18–24 mo",
                demo_tour_starts_at: new Date(Date.now() + 86400000 * 5).toISOString(),
                demo_child_name: "Jordan",
            },
        },
        {
            seed_key: "opp_attn_demo_2",
            status_key: "contacted",
            quote_total: null,
            familyIndex: 6,
            updated_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
            locationClassroomIndex: 1,
            customer_notes: "Prefers afternoon tours.",
            demo_meta: {
                demo_requested_program: "Preschool",
                demo_age_band: "3–4 yrs",
                demo_child_name: "Sam",
            },
        },
        {
            seed_key: "opp_attn_demo_3",
            status_key: "tour_scheduled",
            quote_total: null,
            familyIndex: 7,
            updated_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
            locationClassroomIndex: 2,
            customer_notes: "Sibling already enrolled.",
            job_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
            job_time_window: "2:30 PM",
            demo_meta: {
                demo_requested_program: "Infant care",
                demo_age_band: "4–8 mo",
                demo_child_name: "Riley",
            },
        },
    ];

    for (const spec of oppSpecs) {
        const { data: existingOpp } = await supabase
            .from("opportunities")
            .select("id")
            .eq("org_id", orgId)
            .contains("metadata", { seed_key: spec.seed_key })
            .maybeSingle();
        if (existingOpp) continue;

        const fam = families[spec.familyIndex];
        if (!fam) continue;

        const locationId =
            spec.locationClassroomIndex != null ? classroomIds[spec.locationClassroomIndex % classroomIds.length] : null;

        const oppSeedRow: Record<string, unknown> = {
            org_id: orgId,
            vertical_id: verticalId,
            customer_id: fam.customerId,
            primary_person_id: fam.parentA,
            primary_contact_id: null,
            ...(locationId ? { location_id: locationId } : {}),
            name: `Inquiry — Family ${spec.familyIndex + 1}`,
            status: "open",
            source: "demo_seed",
            status_key: spec.status_key,
            quote_total: spec.quote_total,
            ...(spec.updated_at ? { updated_at: spec.updated_at } : {}),
            ...(spec.customer_notes ? { customer_notes: spec.customer_notes } : {}),
            ...(spec.job_date ? { job_date: spec.job_date } : {}),
            ...(spec.job_time_window ? { job_time_window: spec.job_time_window } : {}),
            metadata: {
                seed_key: spec.seed_key,
                demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE,
                ...(spec.demo_meta ?? {}),
            },
        };
        await normalizeOpportunityWritePayload(supabase, oppSeedRow, "seedChildcareDemo:opp-insert");
        const { error: oErr } = await supabase.from("opportunities").insert(oppSeedRow);
        if (oErr) {
            return { ok: false, error: `opportunities[${spec.seed_key}]: ${oErr.message}` };
        }
    }

    return {
        ok: true,
        summary: {
            classrooms: 3,
            teachers: 5,
            parents: 18,
            children: 27,
            customers: 9,
            opportunities: oppSpecs.length,
        },
    };
}

async function findCustomerBySeed(supabase: SupabaseClient, orgId: string, seedKey: string): Promise<string | null> {
    const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .contains("metadata", { seed_key: seedKey })
        .maybeSingle();
    return data ? (data as { id: string }).id : null;
}

async function insertPerson(
    supabase: SupabaseClient,
    orgId: string,
    seedKey: string,
    first: string,
    last: string,
    email?: string,
    dob?: { year: number; month: number; day: number }
): Promise<string | null> {
    const row: Record<string, unknown> = {
        org_id: orgId,
        first_name: first,
        last_name: last,
        metadata: {
            seed_key: seedKey,
            demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE,
        },
    };
    if (email) row.email = email;
    if (dob) {
        row.date_of_birth = `${dob.year}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")}`;
    }
    const { data, error } = await supabase.from("persons").insert(row).select("id").single();
    if (error || !data) {
        console.error("[seedChildcareDemo] person insert", error);
        return null;
    }
    return (data as { id: string }).id;
}

async function ensureCustomerPerson(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    personId: string,
    role_type: string,
    is_primary: boolean
): Promise<void> {
    const { data: existing } = await supabase
        .from("customer_persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", personId)
        .eq("role_type", role_type)
        .maybeSingle();
    if (existing) return;
    await supabase.from("customer_persons").insert({
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type,
        is_primary,
        metadata: { demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE },
    });
}

async function ensureRelationship(
    supabase: SupabaseClient,
    orgId: string,
    fromPersonId: string,
    toPersonId: string,
    relationship_type: string
): Promise<void> {
    const { data: existing } = await supabase
        .from("person_relationships")
        .select("id")
        .eq("org_id", orgId)
        .eq("from_person_id", fromPersonId)
        .eq("to_person_id", toPersonId)
        .eq("relationship_type", relationship_type)
        .maybeSingle();
    if (existing) return;
    await supabase.from("person_relationships").insert({
        org_id: orgId,
        from_person_id: fromPersonId,
        to_person_id: toPersonId,
        relationship_type,
        is_primary: true,
        metadata: { demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE },
    });
}

async function ensurePersonLocation(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    locationId: string
): Promise<void> {
    const { data: existing } = await supabase
        .from("person_locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .eq("location_id", locationId)
        .maybeSingle();
    if (existing) return;
    await supabase.from("person_locations").insert({
        org_id: orgId,
        person_id: personId,
        location_id: locationId,
        relationship_type: "enrolled_classroom",
        is_primary: true,
        metadata: { demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE },
    });
}
