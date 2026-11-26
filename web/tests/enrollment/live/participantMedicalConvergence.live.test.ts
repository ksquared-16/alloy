/**
 * PARTICIPANT, MEDICAL & CANONICAL DATA CONVERGENCE — against the real database.
 *
 * Every Lil' Sunshine defect this sprint closes was a disagreement BETWEEN writers and readers that a
 * mock cannot see: which table a participant writer touches, which roles a card reads, whether a
 * draft's rows carry a person's identity, whether Health's append-only table accepts the commit. So
 * these are certified over rows Postgres holds, through the same functions the routes call.
 *
 *   R  relationship roles — a physician is a child relationship, never a household member; an
 *      emergency contact is both; one person may hold several roles on one edge
 *   C  collection convergence — the child's people become linked draft rows; a re-sync is a no-op;
 *      Processing proposes `link_existing_person`, never a new person; a sibling gets nothing
 *   M  medical — an approved allergy row commits through Health onto the submission's child, shows
 *      on that child's Medical card with its details, never on the sibling's; a retry is
 *      `already_applied`; the same allergen later is a correction, not a second allergy; a caller
 *      without `health.manage` writes nothing
 *
 * Skipped unless the cert stack is configured (alloy-stack use). `person_health_facts` is
 * append-only by trigger, so facts written here stay on the disposable cert stack under a unique
 * per-run household; every other row is removed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attachPartyRole, resolveChildParties, resolveHouseholdCandidates } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import { writePartyRowsIntoDrafts } from "@/lib/enrollment/participantRuntime/partyRowsIntoDrafts";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { executeHealthFactProposalCommit } from "@/lib/pos/processingCase/commit/executeHealthFactProposalCommit";
import { buildHealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

function certEnv(): { url: string; serviceKey: string } | null {
    if (process.env.CERT_SUPABASE_URL && process.env.CERT_SERVICE_ROLE_KEY) {
        return { url: process.env.CERT_SUPABASE_URL, serviceKey: process.env.CERT_SERVICE_ROLE_KEY };
    }
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = Date.now();
const MANAGER = { permissionKeys: ["health.view", "health.manage"] };
/** EN-FI-01: the card's document list also passes the Documents read gates — an unrestricted administrator here. */
const DOCUMENT_READER = {
    roleKeys: ["admin"],
    permissionKeys: ["documents.read", "health.view", "health.manage"],
    scope: { departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null } as never,
};
const VIEWER = { permissionKeys: ["health.view"] };

const ids = {
    customer: "",
    ava: "",
    ben: "",
    formDefinition: "",
    version: "",
    persons: [] as string[],
    submissions: [] as string[],
    cases: [] as string[],
};

const SCHEMA: FormSchemaV1 = validateFormSchema({
    schema_version: 1,
    title: "ZZ Cert TA-806",
    sections: [{ id: "s", field_ids: ["og", "ec", "dr", "allergies"] }],
    fields: [
        {
            id: "og",
            type: "group",
            label: "Other parents or guardians",
            required: false,
            repeat: { min: 0, max: 3 },
            collection_binding: { collection_provider_ref: "person.contact_role.parents", iteration_entity_type: "person", iteration_alias: "guardian" },
            fields: [
                { id: "og__full_name", type: "text", label: "Name", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
                { id: "og__relationship_type", type: "text", label: "Relationship to the child", required: true, field_source: { entity_type: "person_child_relationship", field_key: "relationship_type" } },
            ],
        },
        {
            id: "ec",
            type: "group",
            label: "Emergency contacts",
            required: false,
            repeat: { min: 1, max: 4 },
            collection_binding: { collection_provider_ref: "person.contact_role.emergency_contacts", iteration_entity_type: "person", iteration_alias: "emergency_contact" },
            fields: [
                { id: "ec__full_name", type: "text", label: "Name", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
                { id: "ec__phone", type: "text", label: "Phone", required: true, field_source: { entity_type: "person", field_key: "phone" } },
                { id: "ec__relationship_type", type: "text", label: "Relationship", required: true, field_source: { entity_type: "person_child_relationship", field_key: "relationship_type" } },
            ],
        },
        {
            id: "dr",
            type: "group",
            label: "Primary physician",
            required: false,
            repeat: { min: 1, max: 2 },
            collection_binding: { collection_provider_ref: "person.contact_role.physicians", iteration_entity_type: "person", iteration_alias: "physician" },
            fields: [
                { id: "dr__full_name", type: "text", label: "Physician name", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
                { id: "dr__phone", type: "text", label: "Phone", required: true, field_source: { entity_type: "person", field_key: "phone" } },
            ],
        },
        {
            id: "allergies",
            type: "group",
            label: "Allergies",
            required: false,
            repeat: { min: 0, max: 6 },
            collection_binding: { collection_provider_ref: "health.allergies", iteration_entity_type: "person_health_fact", iteration_alias: "allergy" },
            fields: [
                { id: "allergies__allergen", type: "text", label: "What is your child allergic to?", required: true },
                { id: "allergies__severity", type: "select", label: "How serious is it?", required: false, static_options: [{ value: "life_threatening", label: "Life-threatening" }, { value: "mild", label: "Mild" }] },
                { id: "allergies__reaction", type: "text", label: "Reaction", required: false },
                { id: "allergies__care_instructions", type: "text", label: "What should staff do?", required: false },
            ],
        },
    ],
} as never);

let db: SupabaseClient;

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
}

async function draftFor(childId: string, payload: FormPayload, status: "draft" | "submitted" = "draft"): Promise<string> {
    const row = await ok(db.from("form_submissions").insert({
        org_id: ORG,
        form_definition_id: ids.formDefinition,
        form_definition_version_id: ids.version,
        status,
        payload,
        customer_id: ids.customer,
        customer_member_id: childId,
        ...(status === "submitted" ? { submitted_at: new Date().toISOString() } : {}),
    }).select("id").single());
    ids.submissions.push((row as { id: string }).id);
    return (row as { id: string }).id;
}

async function caseFor(submissionId: string): Promise<string> {
    const c = await ok(db.from("processing_cases").insert({ org_id: ORG, status: "needs_review", metadata: {} }).select("id").single());
    const caseId = (c as { id: string }).id;
    ids.cases.push(caseId);
    await ok(db.from("processing_case_sources").insert({ org_id: ORG, processing_case_id: caseId, source_kind: "form_submission", source_id: submissionId, role: "primary" }));
    return caseId;
}

async function caseMetadata(caseId: string): Promise<Record<string, unknown>> {
    const row = await ok(db.from("processing_cases").select("metadata").eq("id", caseId).single());
    return ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
}

function allergyPayload(rows: Record<string, unknown>[]): FormPayload {
    return {
        values: {},
        groups: {
            allergies: rows.map((values, i) => ({
                instance_key: `allergy-${RUN}-${i}`,
                values,
                collection: { provider_ref: "health.allergies", origin: "respondent_added", iteration_entity_type: "person_health_fact" },
            })),
        },
    } as FormPayload;
}

function proposalIdFor(submissionId: string, payload: FormPayload, index = 0): string {
    const bundle = adaptFormSubmissionToRelatedRecordProposals(SCHEMA, payload, { formSubmissionId: submissionId, formDefinitionVersionId: ids.version });
    const group = bundle.collections.find((c) => c.collection_provider_ref === "health.allergies")!;
    return group.instances[index]!.proposal_id;
}

describe.skipIf(!env)("participant, medical & canonical data convergence (cert DB)", () => {
    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const customer = await ok(db.from("customers").insert({ org_id: ORG, name: `ZZ Cert Medical ${RUN}` }).select("id").single());
        ids.customer = (customer as { id: string }).id;
        const kids = await ok(db.from("customer_members").insert([
            { org_id: ORG, customer_id: ids.customer, display_name: `Ava ${RUN}`, first_name: "Ava", last_name: `Cert${RUN}`, relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.customer, display_name: `Ben ${RUN}`, first_name: "Ben", last_name: `Cert${RUN}`, relationship: "child", is_active: true },
        ]).select("id, first_name"));
        const rows = kids as { id: string; first_name: string }[];
        ids.ava = rows.find((k) => k.first_name === "Ava")!.id;
        ids.ben = rows.find((k) => k.first_name === "Ben")!.id;
        const def = await ok(db.from("form_definitions").insert({ org_id: ORG, key: `zz_cert_medical_${RUN}`, name: "ZZ Cert TA-806", kind: "center" }).select("id").single());
        ids.formDefinition = (def as { id: string }).id;
        const ver = await ok(db.from("form_definition_versions").insert({
            org_id: ORG,
            form_definition_id: ids.formDefinition,
            version_number: 1,
            status: "published",
            published_at: new Date().toISOString(),
            schema_json: SCHEMA,
        }).select("id").single());
        ids.version = (ver as { id: string }).id;
    });

    afterAll(async () => {
        if (!db) return;
        await db.from("processing_case_sources").delete().in("processing_case_id", ids.cases.length ? ids.cases : ["00000000-0000-0000-0000-000000000000"]);
        await db.from("processing_cases").delete().in("id", ids.cases.length ? ids.cases : ["00000000-0000-0000-0000-000000000000"]);
        await db.from("form_submissions").delete().in("id", ids.submissions.length ? ids.submissions : ["00000000-0000-0000-0000-000000000000"]);
        await db.from("form_definition_versions").delete().eq("id", ids.version || "00000000-0000-0000-0000-000000000000");
        await db.from("form_definitions").delete().eq("id", ids.formDefinition || "00000000-0000-0000-0000-000000000000");
        if (ids.customer) {
            const { data: edges } = await db.from("person_child_relationships").select("id").eq("customer_id", ids.customer);
            const edgeIds = ((edges ?? []) as { id: string }[]).map((e) => e.id);
            if (edgeIds.length) await db.from("person_child_relationship_roles").delete().in("relationship_id", edgeIds);
            await db.from("person_child_relationships").delete().eq("customer_id", ids.customer);
            await db.from("customer_persons").delete().eq("customer_id", ids.customer);
            await db.from("contacts").delete().eq("customer_id", ids.customer);
        }
        if (ids.persons.length) await db.from("persons").delete().in("id", ids.persons);
        if (ids.customer) {
            await db.from("customer_members").delete().eq("customer_id", ids.customer);
            await db.from("customers").delete().eq("id", ids.customer);
        }
    });

    let physicianId = "";
    let grandmaId = "";

    it("R · a physician is the child's relationship only; an emergency contact is also a household person", async () => {
        const dr = await attachPartyRole(db, { orgId: ORG, customerId: ids.customer, customerMemberId: ids.ava, role: "physician", identity: { full_name: "Dr. Lee Park", phone: "5035550200" } });
        expect(dr.ok).toBe(true);
        physicianId = (dr as { person_id: string }).person_id;
        ids.persons.push(physicianId);

        const household = (await ok(db.from("customer_persons").select("role_type").eq("customer_id", ids.customer).eq("person_id", physicianId))) as unknown[];
        expect(household).toHaveLength(0);
        const contacts = (await ok(db.from("contacts").select("id").eq("person_id", physicianId))) as unknown[];
        expect(contacts.length).toBe(1);

        const gm = await attachPartyRole(db, { orgId: ORG, customerId: ids.customer, customerMemberId: ids.ava, role: "emergency_contact", identity: { full_name: "Mary Rivers", phone: "5035550111" }, relationshipType: "grandparent" });
        expect(gm.ok).toBe(true);
        grandmaId = (gm as { person_id: string }).person_id;
        ids.persons.push(grandmaId);
        const gmHousehold = (await ok(db.from("customer_persons").select("role_type").eq("customer_id", ids.customer).eq("person_id", grandmaId))) as { role_type: string }[];
        expect(gmHousehold.map((r) => r.role_type)).toEqual(["emergency_contact"]);

        // One person, one edge, two roles — and the same person twice is still one person.
        const again = await attachPartyRole(db, { orgId: ORG, customerId: ids.customer, customerMemberId: ids.ava, role: "authorized_pickup", personId: grandmaId });
        expect(again).toMatchObject({ ok: true, person_id: grandmaId, created_person: false });
        const parties = await resolveChildParties(db, { orgId: ORG, customerMemberId: ids.ava });
        const mary = parties.find((p) => p.person_id === grandmaId)!;
        expect([...mary.roles].sort()).toEqual(["authorized_pickup", "emergency_contact"]);
        expect(mary.relationship_type).toBe("grandparent");
        expect(parties.find((p) => p.person_id === physicianId)!.roles).toEqual(["physician"]);
    });

    it("R · the sibling inherits nobody, but is OFFERED the household's people with the roles they hold", async () => {
        expect(await resolveChildParties(db, { orgId: ORG, customerMemberId: ids.ben })).toEqual([]);
        const offered = await resolveHouseholdCandidates(db, { orgId: ORG, customerId: ids.customer, excludePersonIds: new Set() });
        expect(offered.find((c) => c.person_id === physicianId)?.roles).toEqual(["physician"]);
        expect(offered.find((c) => c.person_id === grandmaId)?.relationship_type).toBe("grandparent");
    });

    it("C · the child's people become linked draft rows; a re-sync is a no-op; the sibling's draft is untouched", async () => {
        const avaDraft = await draftFor(ids.ava, {
            values: {},
            groups: {
                // What deployed review held: a seeded blank, and the family retyping the physician.
                ec: [{ instance_key: "seed", values: {}, collection: { provider_ref: "person.contact_role.emergency_contacts", origin: "respondent_added", iteration_entity_type: "person" } }],
                dr: [{ instance_key: "typed", values: { dr__full_name: "Dr. Lee Park", dr__phone: "5035550200" }, collection: { provider_ref: "person.contact_role.physicians", origin: "respondent_added", iteration_entity_type: "person" } }],
            },
        } as FormPayload);
        const benDraft = await draftFor(ids.ben, { values: {} } as FormPayload);

        const options = [{ value: "grandparent", label: "Grandparent" }];
        const first = await writePartyRowsIntoDrafts(db, { orgId: ORG, sessionId: "", customerMemberId: ids.ava, submissionIds: [avaDraft], relationshipOptions: options });
        expect(Object.keys(first)).toEqual([avaDraft]);
        const stored = (await ok(db.from("form_submissions").select("payload").eq("id", avaDraft).single())) as { payload: FormPayload };
        const ec = stored.payload.groups!.ec!;
        expect(ec).toHaveLength(1);
        expect(ec[0]).toMatchObject({ collection: { item_id: grandmaId, origin: "existing" }, values: { ec__full_name: "Mary Rivers", ec__relationship_type: "Grandparent" } });
        expect(stored.payload.groups!.dr!).toHaveLength(1);
        expect(stored.payload.groups!.dr![0]!.collection).toMatchObject({ item_id: physicianId, origin: "existing" });
        // The envelope Processing reads first describes the same rows.
        const envelope = (stored.payload.meta as Record<string, unknown>).collection_submission_envelope as Record<string, Array<{ item_id: string | null }>>;
        expect(envelope.dr![0]!.item_id).toBe(physicianId);

        const second = await writePartyRowsIntoDrafts(db, { orgId: ORG, sessionId: "", customerMemberId: ids.ava, submissionIds: [avaDraft], relationshipOptions: options });
        expect(second).toEqual({});

        // Processing links the known people; it proposes no new person.
        const bundle = adaptFormSubmissionToRelatedRecordProposals(SCHEMA, stored.payload, { formSubmissionId: avaDraft, formDefinitionVersionId: ids.version });
        const people = bundle.collections.filter((c) => c.collection_provider_ref.startsWith("person.")).flatMap((c) => c.instances);
        expect(people.map((p) => p.relationship_intent?.identity_action)).toEqual(["link_existing_person", "link_existing_person"]);

        const benSync = await writePartyRowsIntoDrafts(db, { orgId: ORG, sessionId: "", customerMemberId: ids.ben, submissionIds: [benDraft], relationshipOptions: options });
        expect(benSync).toEqual({});
    });

    it("C · an inquiry family's adult (primary_contact, unflagged) prefills and is never 'another' guardian (ZZQALM234600)", async () => {
        const mom = await ok(db.from("persons").insert({ org_id: ORG, first_name: "Parent", last_name: `Cert${RUN}`, email: `zz.cert.${RUN}@test.invalid`, phone: "5551234567" }).select("id").single());
        const momId = (mom as { id: string }).id;
        ids.persons.push(momId);
        await ok(db.from("customer_persons").insert({ org_id: ORG, customer_id: ids.customer, person_id: momId, role_type: "primary_contact", is_primary: false }));
        // The conversation attaches her as Ava's guardian — a true canonical fact.
        const attached = await attachPartyRole(db, { orgId: ORG, customerId: ids.customer, customerMemberId: ids.ava, role: "guardian", personId: momId });
        expect(attached.ok).toBe(true);

        // A draft that an earlier sync already polluted with her as "another" guardian heals.
        const draft = await draftFor(ids.ava, {
            values: {},
            groups: { og: [{ instance_key: `col:person.contact_role.parents:${momId}`, values: { og__full_name: "Parent" }, collection: { provider_ref: "person.contact_role.parents", item_id: momId, origin: "existing", iteration_entity_type: "person" } }] },
        } as FormPayload);
        await writePartyRowsIntoDrafts(db, { orgId: ORG, sessionId: "", customerMemberId: ids.ava, submissionIds: [draft] });
        const stored = (await ok(db.from("form_submissions").select("payload").eq("id", draft).single())) as { payload: FormPayload };
        expect(stored.payload.groups!.og ?? []).toEqual([]);
        // Her people are still Ava's: emergency contact and physician rows are linked as before.
        expect(stored.payload.groups!.ec![0]!.collection).toMatchObject({ item_id: grandmaId });

        // And her identity is what the guardian fields prefill from.
        const { primaryHouseholdAdult } = await import("@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues");
        const links = (await ok(db.from("customer_persons").select("person_id, is_primary, role_type, status").eq("customer_id", ids.customer))) as never[];
        expect(primaryHouseholdAdult(links)?.person_id).toBe(momId);
    });

    it("R · the canonical relationship resolver reads real persons (focus-panel bags are never silently empty)", async () => {
        const { resolvePersonChildRelationshipsFromStore } = await import("@/lib/fields/personChildRelationship/personChildRelationshipResolverRegistry");
        const result = await resolvePersonChildRelationshipsFromStore({ supabase: db, orgId: ORG, customerId: ids.customer, customerMemberId: ids.ava });
        expect(result.status).not.toBe("missing_person");
        const byName = new Map(result.items.map((i) => [String(i.person?.full_name ?? ""), [...i.operational_roles].sort()]));
        expect(byName.get("Dr. Lee Park")).toEqual(["physician"]);
        expect(byName.get("Mary Rivers")).toEqual(["authorized_pickup", "emergency_contact"]);
    });

    let allergyFactId = "";

    it("M · a caller without health.manage writes nothing", async () => {
        const payload = allergyPayload([{ allergies__allergen: "Peanuts", allergies__severity: "life_threatening", allergies__reaction: "Hives", allergies__care_instructions: "EpiPen Jr. in backpack; call 911" }]);
        const sub = await draftFor(ids.ava, payload, "submitted");
        const caseId = await caseFor(sub);
        const denied = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: VIEWER, caseId, proposalId: proposalIdFor(sub, payload), metadata: await caseMetadata(caseId) });
        expect(denied).toMatchObject({ ok: false, status: 403 });
        const facts = (await ok(db.from("person_health_facts").select("id").eq("subject_entity_id", ids.ava))) as unknown[];
        expect(facts).toHaveLength(0);
    });

    it("M · an approved allergy commits onto the submission's child, with its details, once", async () => {
        const payload = allergyPayload([{ allergies__allergen: "Peanuts", allergies__severity: "life_threatening", allergies__reaction: "Hives", allergies__care_instructions: "EpiPen Jr. in backpack; call 911" }]);
        const sub = await draftFor(ids.ava, payload, "submitted");
        const caseId = await caseFor(sub);
        const proposalId = proposalIdFor(sub, payload);

        const applied = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId, metadata: await caseMetadata(caseId) });
        expect(applied).toMatchObject({ ok: true, already_applied: false, record: { outcome: "applied", customer_member_id: ids.ava, fact_kind: "allergy" } });
        allergyFactId = (applied as { record: { health_fact_id: string } }).record.health_fact_id;

        const retry = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId, metadata: await caseMetadata(caseId) });
        expect(retry).toMatchObject({ ok: true, already_applied: true });

        const facts = (await ok(db.from("person_health_facts").select("id, payload, source_kind, source_ref, status").eq("subject_entity_id", ids.ava).eq("status", "active"))) as Array<{ payload: Record<string, unknown>; source_kind: string; source_ref: string }>;
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({ source_kind: "form_submission", payload: { allergen: "Peanuts", severity: "life_threatening", reaction: "Hives", care_instructions: "EpiPen Jr. in backpack; call 911" } });
        expect(facts[0]!.source_ref).toContain(sub);
    });

    it("M · the Medical card shows the allergy with its details, the physician as physician, and only true emergency contacts", async () => {
        const vm = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER, documentActor: DOCUMENT_READER });
        expect(vm.criticalFacts.map((f) => f.label)).toEqual(["Peanuts"]);
        expect(vm.criticalFacts[0]).toMatchObject({ severity: "life_threatening", effect: "Hives", instruction: "EpiPen Jr. in backpack; call 911" });
        expect(vm.careProviders.map((c) => [c.role, c.name])).toEqual([["physician", "Dr. Lee Park"]]);
        expect(vm.emergencyContacts.map((c) => c.name)).toEqual(["Mary Rivers"]);
        // The organization's word for the relationship, never its stored key.
        expect(vm.emergencyContacts[0]!.relationship).toBe("Grandparent");
        expect(vm.gaps.map((g) => g.concept)).not.toContain("physician_dentist");

        const sibling = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ben, access: MANAGER, documentActor: DOCUMENT_READER });
        expect(sibling.criticalFacts).toEqual([]);
        expect(sibling.careFacts).toEqual([]);
        expect(sibling.careProviders).toEqual([]);
        expect(sibling.emergencyContacts).toEqual([]);
    });

    it("M · the same allergen on a later form is a correction, not a second allergy; an unchanged one is already on record", async () => {
        const corrected = allergyPayload([{ allergies__allergen: "peanuts", allergies__severity: "life_threatening", allergies__reaction: "Hives and swelling", allergies__care_instructions: "EpiPen Jr. in backpack; call 911" }]);
        const sub = await draftFor(ids.ava, corrected, "submitted");
        const caseId = await caseFor(sub);
        const out = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: proposalIdFor(sub, corrected), metadata: await caseMetadata(caseId) });
        expect(out).toMatchObject({ ok: true, record: { outcome: "corrected", superseded_fact_id: allergyFactId } });
        const active = (await ok(db.from("person_health_facts").select("id, payload").eq("subject_entity_id", ids.ava).eq("status", "active"))) as Array<{ payload: Record<string, unknown> }>;
        expect(active).toHaveLength(1);
        expect(active[0]!.payload.reaction).toBe("Hives and swelling");

        const sub2 = await draftFor(ids.ava, corrected, "submitted");
        const case2 = await caseFor(sub2);
        const same = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId: case2, proposalId: proposalIdFor(sub2, corrected), metadata: await caseMetadata(case2) });
        expect(same).toMatchObject({ ok: true, record: { outcome: "already_on_record" } });
        const stillOne = (await ok(db.from("person_health_facts").select("id").eq("subject_entity_id", ids.ava).eq("status", "active"))) as unknown[];
        expect(stillOne).toHaveLength(1);
    });

    it("M · a rejected proposal never commits, and an incomplete row is refused", async () => {
        const payload = allergyPayload([{ allergies__allergen: "Bees" }, { allergies__reaction: "Rash" }]);
        const sub = await draftFor(ids.ben, payload, "submitted");
        const caseId = await caseFor(sub);
        const rejectedId = proposalIdFor(sub, payload, 0);
        await ok(db.from("processing_cases").update({ metadata: { related_record_proposals: { decisions: { [rejectedId]: { proposal_id: rejectedId, instance_decision: "reject", field_decisions: [] } } } } }).eq("id", caseId));
        const rejected = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: rejectedId, metadata: await caseMetadata(caseId) });
        expect(rejected).toMatchObject({ ok: false, status: 409, code: "declined" });
        const incomplete = await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: proposalIdFor(sub, payload, 1), metadata: await caseMetadata(caseId) });
        expect(incomplete).toMatchObject({ ok: false, status: 409, code: "proposal_incomplete" });
        const benFacts = (await ok(db.from("person_health_facts").select("id").eq("subject_entity_id", ids.ben))) as unknown[];
        expect(benFacts).toHaveLength(0);
    });
});
