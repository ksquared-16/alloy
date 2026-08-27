/**
 * A DISPOSABLE certification journey with realistic pre-existing truth.
 *
 * The standing QA journey is deliberately sparse, which is exactly why it cannot demonstrate this
 * feature: grouping known facts is worth nothing when almost nothing is known. This seeds a family
 * the way a real one arrives at Enrollment — the child's identity and birthday from the inquiry, the
 * gender and a handful of routine notes from the pre-enrollment conversation, the primary guardian's
 * name, phone and email, and the household's address — and then starts Enrollment through the
 * platform's own launch path, not by hand-writing a session.
 *
 * Disposable by construction: every row it writes carries `metadata.source = "grouped_confirmation_cert"`
 * so the whole fixture can be identified and removed without touching anything else in the tenant.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --tsconfig tsconfig.json \
 *     scripts/createGroupedConfirmationCertJourney.ts
 */

import { createClient } from "@supabase/supabase-js";

import { launchParticipantEnrollment } from "@/lib/enrollment/participantLaunch/launchParticipantEnrollment";

const ORG = "00000000-0000-4000-8000-000000000001";
const SOURCE = "grouped_confirmation_cert";

function required(name: string): string {
    const value = (process.env[name] ?? "").trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

async function main() {
    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
    });

    // The revision the standing Enrollment process runs on — the fixture must not invent one.
    const { data: revision } = await supabase
        .from("process_instances")
        .select("business_process_revision_id")
        .eq("org_id", ORG)
        .eq("process_key", "enrollment")
        .not("business_process_revision_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const revisionId = (revision as { business_process_revision_id?: string } | null)?.business_process_revision_id;
    if (!revisionId) throw new Error("No enrollment business_process_revision_id to run against");

    /** The HOUSEHOLD — its address is a canonical household fact, held once. */
    const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({
            org_id: ORG,
            name: "Okonkwo-Bennett Household",
            customer_type: "family",
            metadata: { source: SOURCE, address: "418 NE Hancock St, Portland, OR 97212" },
        })
        .select("id")
        .single();
    if (customerError) throw customerError;
    const customerId = (customer as { id: string }).id;

    /** The PRIMARY GUARDIAN — the adult the school actually deals with. */
    const { data: person, error: personError } = await supabase
        .from("persons")
        .insert({
            org_id: ORG,
            first_name: "Adaeze",
            last_name: "Okonkwo",
            full_name: "Adaeze Okonkwo",
            email: "adaeze.okonkwo@example.com",
            phone: "5035550142",
            metadata: { source: SOURCE },
        })
        .select("id")
        .single();
    if (personError) throw personError;
    const personId = (person as { id: string }).id;

    const { error: linkError } = await supabase.from("customer_persons").insert({
        org_id: ORG,
        customer_id: customerId,
        person_id: personId,
        role_type: "parent",
        is_primary: true,
        status: "active",
        metadata: { source: SOURCE },
    });
    if (linkError) throw linkError;

    /**
     * The CHILD, with what a pre-enrollment journey would already have gathered.
     *
     * `metadata` keys are read generically by the canonical resolver under `customer_member:<key>` —
     * the same keys the tenant's own forms bind — so these are genuine canonical facts, not a
     * fixture-only shortcut.
     */
    const { data: child, error: childError } = await supabase
        .from("customer_members")
        .insert({
            org_id: ORG,
            customer_id: customerId,
            first_name: "Chidinma",
            last_name: "Okonkwo",
            display_name: "Chidinma Okonkwo",
            dob: "2021-04-02",
            relationship: "child",
            is_active: true,
            metadata: {
                source: SOURCE,
                gender: "Female",
                allergies: "Peanuts — carries an EpiPen",
                temperament: "Warm and observant; takes a few minutes to join a new group",
                nap_routine: "Naps about an hour after lunch",
                eating_habits: "Eats well, prefers to feed herself",
            },
        })
        .select("id")
        .single();
    if (childError) throw childError;
    const childId = (child as { id: string }).id;

    const { data: instance, error: instanceError } = await supabase
        .from("process_instances")
        .insert({
            org_id: ORG,
            process_key: "enrollment",
            subject_type: "child",
            subject_id: childId,
            business_process_revision_id: revisionId,
            /*
             * `source` on a process instance is the ENTRY INTENT, not a provenance label.
             * `entryIntentFromProcessInstanceMetadata` reads it to choose the entry stage, so a
             * fixture marker here means "started in a way the Business Process declares no entry
             * point for" and the launch is correctly refused. Started the ordinary way; the
             * disposability marker lives beside it.
             */
            metadata: { source: "enrollment_start", cert_fixture: SOURCE },
        })
        .select("id")
        .single();
    if (instanceError) throw instanceError;
    const processInstanceId = (instance as { id: string }).id;

    // Started the ORDINARY way — the same call the operator surface makes.
    const launched = await launchParticipantEnrollment(supabase, {
        orgId: ORG,
        processInstanceId,
        customerId,
    });
    if (!launched.ok) throw new Error(`launch refused: ${launched.refusal.code} ${launched.refusal.detail}`);

    console.log(
        JSON.stringify(
            {
                source: SOURCE,
                customer_id: customerId,
                person_id: personId,
                child_id: childId,
                process_instance_id: processInstanceId,
                launch: launched,
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
