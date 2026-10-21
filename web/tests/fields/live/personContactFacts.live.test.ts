/**
 * FI-06 / FI-07 — a parent's work and contact facts, Forms → Processing → Person → prefill, against
 * the real database.
 *
 * The responding parent's home / work phone, employer, work hours and work address reach THEIR
 * Person only on an operator's approval; a sibling's form then reads them back. The boundaries: the
 * submission's own adult only, never another household's, never when the answers name a different
 * adult, a blank never clears a value, and the mobile number stays identity's.
 *
 * Skipped unless the cert stack is configured (alloy-stack use).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptPersonContactFactsToProposals } from "@/lib/fields/personContactFacts/personContactFactProposals";
import { readPersonContactFacts } from "@/lib/fields/personContactFacts/personContactFacts";
import { executePersonContactFactsProposalCommit } from "@/lib/pos/processingCase/commit/executePersonContactFactsProposalCommit";
import { resolveFormPrefillValues } from "@/lib/forms/prefill/resolveFormPrefillValues";

function certEnv(): { url: string; serviceKey: string } | null {
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
let db: SupabaseClient;
const ids = { customer: "", otherCustomer: "", pat: "", stranger: "", ava: "", ben: "", def: "", ver: "", subs: [] as string[], cases: [] as string[] };

const G = (field_key: string) => ({ entity_type: "guardian", field_key, shared_value_key: field_key });
const P = (field_key: string) => ({ entity_type: "person", field_key });

const SCHEMA: FormSchemaV1 = validateFormSchema({
    schema_version: 1,
    title: "ZZ Cert guardian facts",
    sections: [{ id: "s", field_ids: ["first", "last", "cell", "home", "work", "employer", "hours", "work_addr"] }],
    fields: [
        { id: "first", type: "text", label: "First name", required: false, field_source: G("guardian_first_name") },
        { id: "last", type: "text", label: "Last name", required: false, field_source: G("guardian_last_name") },
        { id: "cell", type: "text", label: "Cell phone", required: false, field_source: G("guardian_phone") },
        { id: "home", type: "text", label: "Home phone", required: false, field_source: G("guardian_home_phone") },
        { id: "work", type: "text", label: "Work phone", required: false, field_source: P("work_phone") },
        { id: "employer", type: "text", label: "Employer", required: false, field_source: P("employer") },
        { id: "hours", type: "text", label: "Work hours", required: false, field_source: G("guardian_work_hours") },
        { id: "work_addr", type: "text", label: "Work address", required: false, field_source: G("guardian_work_address") },
    ],
} as never);

const answers = (over: Record<string, string> = {}): FormPayload =>
    ({ values: { first: "Pat", last: "Rivers", cell: "503-555-0101", home: "503-555-0202", work: "503-555-0303", employer: "Acme Clinic", hours: "Mon–Fri 8–5", work_addr: "1 Main St, Hillsboro", ...over } }) as FormPayload;

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
}

async function submit(personId: string, customerId: string, childId: string, payload: FormPayload): Promise<{ sub: string; caseId: string }> {
    const s = (await ok(db.from("form_submissions").insert({ org_id: ORG, form_definition_id: ids.def, form_definition_version_id: ids.ver, status: "submitted", submitted_at: new Date().toISOString(), payload, customer_id: customerId, customer_member_id: childId, person_id: personId }).select("id").single())) as { id: string };
    ids.subs.push(s.id);
    const c = (await ok(db.from("processing_cases").insert({ org_id: ORG, status: "needs_review", metadata: {} }).select("id").single())) as { id: string };
    ids.cases.push(c.id);
    await ok(db.from("processing_case_sources").insert({ org_id: ORG, processing_case_id: c.id, source_kind: "form_submission", source_id: s.id, role: "primary" }));
    return { sub: s.id, caseId: c.id };
}

const meta = async (caseId: string) => (((await ok(db.from("processing_cases").select("metadata").eq("id", caseId).single())) as { metadata: Record<string, unknown> }).metadata ?? {});

async function commit(sub: string, caseId: string, payload: FormPayload) {
    const [c] = adaptPersonContactFactsToProposals(SCHEMA, payload, { formSubmissionId: sub, formDefinitionVersionId: ids.ver });
    return executePersonContactFactsProposalCommit({ supabase: db, orgId: ORG, userId: null, caseId, proposalId: c!.instances[0]!.proposal_id, metadata: await meta(caseId) });
}

describe.skipIf(!env)("parent work and contact facts (cert DB)", () => {
    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        // The org's field configuration for these facts (as the field authoring path creates it).
        for (const [field_key, field_type, label] of [["home_phone", "phone", "Home phone"], ["work_phone", "phone", "Work phone"], ["employer", "text", "Employer"], ["work_hours", "text", "Work hours"], ["work_address", "text", "Work address"]] as const) {
            const { data } = await db.from("field_definitions").select("id").eq("org_id", ORG).eq("entity_type", "person").eq("field_key", field_key).maybeSingle();
            if (!data) await ok(db.from("field_definitions").insert({ org_id: ORG, entity_type: "person", field_key, label, field_type, is_system: false, is_active: true }).select("id"));
        }
        const [c1, c2] = (await ok(db.from("customers").insert([{ org_id: ORG, name: `ZZ Cert Guardian Facts ${RUN}` }, { org_id: ORG, name: `ZZ Cert Other Household ${RUN}` }]).select("id, name"))) as { id: string; name: string }[];
        ids.customer = c1!.name.includes("Other") ? c2!.id : c1!.id;
        ids.otherCustomer = c1!.name.includes("Other") ? c1!.id : c2!.id;
        const people = (await ok(db.from("persons").insert([{ org_id: ORG, first_name: "Pat", last_name: "Rivers", phone: "503-555-0101" }, { org_id: ORG, first_name: "Sam", last_name: `Stranger${RUN}` }]).select("id, first_name"))) as { id: string; first_name: string }[];
        ids.pat = people.find((p) => p.first_name === "Pat")!.id;
        ids.stranger = people.find((p) => p.first_name === "Sam")!.id;
        await ok(db.from("contacts").insert([{ org_id: ORG, customer_id: ids.customer, person_id: ids.pat, first_name: "Pat", last_name: "Rivers" }, { org_id: ORG, customer_id: ids.otherCustomer, person_id: ids.stranger, first_name: "Sam", last_name: "Stranger" }]).select("id"));
        const kids = (await ok(db.from("customer_members").insert([
            { org_id: ORG, customer_id: ids.customer, display_name: `Ava ${RUN}`, first_name: "Ava", relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.customer, display_name: `Ben ${RUN}`, first_name: "Ben", relationship: "child", is_active: true },
        ]).select("id, first_name"))) as { id: string; first_name: string }[];
        ids.ava = kids.find((k) => k.first_name === "Ava")!.id;
        ids.ben = kids.find((k) => k.first_name === "Ben")!.id;
        const d = (await ok(db.from("form_definitions").insert({ org_id: ORG, key: `zz_cert_guardian_facts_${RUN}`, name: "ZZ Cert guardian facts", kind: "center", metadata: {} }).select("id").single())) as { id: string };
        ids.def = d.id;
        const v = (await ok(db.from("form_definition_versions").insert({ org_id: ORG, form_definition_id: ids.def, version_number: 1, status: "published", published_at: new Date().toISOString(), schema_json: SCHEMA }).select("id").single())) as { id: string };
        ids.ver = v.id;
    });

    afterAll(async () => {
        if (!db) return;
        if (ids.cases.length) {
            await db.from("processing_case_sources").delete().in("processing_case_id", ids.cases);
            await db.from("processing_cases").delete().in("id", ids.cases);
        }
        if (ids.subs.length) await db.from("form_submissions").delete().in("id", ids.subs);
        if (ids.ver) await db.from("form_definition_versions").delete().eq("id", ids.ver);
        if (ids.def) await db.from("form_definitions").delete().eq("id", ids.def);
    });

    it("an approved proposal records the parent's facts on THEIR Person; the mobile number is untouched", async () => {
        const p = answers();
        const { sub, caseId } = await submit(ids.pat, ids.customer, ids.ava, p);
        expect(await readPersonContactFacts(db, { orgId: ORG, personId: ids.pat })).toEqual({});
        const out = await commit(sub, caseId, p);
        expect(out).toMatchObject({ ok: true, already_applied: false });
        expect(await readPersonContactFacts(db, { orgId: ORG, personId: ids.pat })).toEqual({
            home_phone: "503-555-0202",
            work_phone: "503-555-0303",
            employer: "Acme Clinic",
            work_hours: "Mon–Fri 8–5",
            work_address: "1 Main St, Hillsboro",
        });
        const pat = (await ok(db.from("persons").select("phone").eq("id", ids.pat).single())) as { phone: string };
        expect(pat.phone).toBe("503-555-0101");
        // A retry records nothing twice.
        expect(await commit(sub, caseId, p)).toMatchObject({ ok: true, already_applied: true });
    });

    it("a sibling's form prefills from the parent's record instead of asking again", async () => {
        const values = await resolveFormPrefillValues(db, ORG, { form_context_mode: "existing_record" }, {}, SCHEMA, { person_id: ids.pat, customer_id: ids.customer, customer_member_id: ids.ben, opportunity_id: null });
        expect(values).toMatchObject({ home: "503-555-0202", work: "503-555-0303", employer: "Acme Clinic", hours: "Mon–Fri 8–5", work_addr: "1 Main St, Hillsboro", cell: "503-555-0101" });
        // Home and work did not collapse into the mobile number.
        expect(new Set([values.cell, values.home, values.work]).size).toBe(3);
    });

    it("a later submission with blank answers clears nothing; a changed employer is recorded with what it replaced", async () => {
        const p = answers({ home: "", work: "", hours: "", work_addr: "", employer: "Hillsboro Medical" });
        const { sub, caseId } = await submit(ids.pat, ids.customer, ids.ben, p);
        const out = await commit(sub, caseId, p);
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.record.written).toEqual([{ key: "employer", previous: "Acme Clinic", value: "Hillsboro Medical" }]);
        expect(await readPersonContactFacts(db, { orgId: ORG, personId: ids.pat })).toMatchObject({ home_phone: "503-555-0202", work_phone: "503-555-0303", employer: "Hillsboro Medical" });
    });

    it("answers naming a DIFFERENT adult are refused and recorded on no one", async () => {
        const p = answers({ first: "Jordan", work: "971-555-7777" });
        const { sub, caseId } = await submit(ids.pat, ids.customer, ids.ava, p);
        expect(await commit(sub, caseId, p)).toMatchObject({ ok: false, code: "different_adult" });
        expect((await readPersonContactFacts(db, { orgId: ORG, personId: ids.pat })).work_phone).toBe("503-555-0303");
    });

    it("an adult from another household is never written, even if the submission names them", async () => {
        const p = answers({ first: "Sam", last: `Stranger${RUN}` });
        const { sub, caseId } = await submit(ids.stranger, ids.customer, ids.ava, p);
        expect(await commit(sub, caseId, p)).toMatchObject({ ok: false, code: "person_wrong_household" });
        expect(await readPersonContactFacts(db, { orgId: ORG, personId: ids.stranger })).toEqual({});
    });
});
