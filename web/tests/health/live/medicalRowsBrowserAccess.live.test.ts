/**
 * FI-01 (Director medical visibility policy) — a child's medical rows in SHARED tables need Medical's
 * permission from a signed-in browser session, while everything else is unchanged.
 *
 * Three real signed-in users in the cert org, reading PostgREST directly:
 *   ops    — an org role (RLS grants it the shared tables) WITHOUT health.view
 *   admin  — holds health.view
 *   none   — signed in, no role
 * Medical rows: a child's allergy field value, an immunization_record document, a submission of a
 * form that declares health capture (and its signature). Non-medical controls: the same child's
 * preferred-name value, a signature_asset document, a non-medical form's submission.
 *
 * Skipped unless the cert stack is configured (alloy-stack use) with migration 20261204090000.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string; anonKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
        return url && serviceKey && anonKey ? { url, serviceKey, anonKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = Date.now();
let service: SupabaseClient;
const people: string[] = [];
const users: Record<"ops" | "admin" | "none", { id: string; client: SupabaseClient | null }> = {
    ops: { id: "", client: null },
    admin: { id: "", client: null },
    none: { id: "", client: null },
};
const ids = { customer: "", member: "", allergyValue: "", nameValue: "", healthDoc: "", plainDoc: "", medForm: "", medVer: "", plainForm: "", plainVer: "", medSub: "", plainSub: "", medSig: "" };

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
}

async function signedIn(role: "ops" | "admin" | null): Promise<{ id: string; client: SupabaseClient }> {
    const email = `zz-fi01-med-${role ?? "none"}-${RUN}@cert.alloy.invalid`;
    const password = `Med-${Math.random().toString(36).slice(2)}-Aa1!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "user not created");
    const id = created.data.user.id;
    if (role) {
        // A money-capable role (admin) needs an active person link, as for any real staff user.
        const person = (await ok(service.from("persons").insert({ org_id: ORG, first_name: "ZZ", last_name: `Medical ${role} ${RUN}` }).select("id").single())) as { id: string };
        people.push(person.id);
        await ok(service.from("user_person_links").insert({ org_id: ORG, user_id: id, person_id: person.id, status: "active" }).select("id"));
        // Profile first: a membership must have an access profile at commit.
        await ok(service.from("user_access_profiles").upsert({ user_id: id, org_id: ORG, department_scope: "all", site_scope: "all" }, { onConflict: "user_id,org_id" }).select("user_id"));
        await ok(service.from("user_roles").insert({ user_id: id, org_id: ORG, role }).select("user_id"));
    }
    const client = createClient(env!.url, env!.anonKey, { auth: { persistSession: false } });
    const s = await client.auth.signInWithPassword({ email, password });
    if (s.error) throw new Error(s.error.message);
    return { id, client };
}

const sees = async (who: keyof typeof users, table: string, id: string): Promise<boolean> => {
    const { data, error } = await users[who].client!.from(table).select("id").eq("id", id);
    if (error && error.code !== "42501") throw new Error(`${table}: ${error.message}`);
    return (data ?? []).length === 1;
};

describe.skipIf(!env)("medical rows in shared tables need Medical's permission (cert DB)", () => {
    beforeAll(async () => {
        service = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        Object.assign(users.ops, await signedIn("ops"));
        Object.assign(users.admin, await signedIn("admin"));
        Object.assign(users.none, await signedIn(null));

        const c = (await ok(service.from("customers").insert({ org_id: ORG, name: `ZZ Cert Medical RLS ${RUN}` }).select("id").single())) as { id: string };
        ids.customer = c.id;
        const m = (await ok(service.from("customer_members").insert({ org_id: ORG, customer_id: ids.customer, display_name: `Mia ${RUN}`, first_name: "Mia", relationship: "child", is_active: true }).select("id").single())) as { id: string };
        ids.member = m.id;
        const defs = (await ok(service.from("field_definitions").select("id, field_key").eq("org_id", ORG).eq("entity_type", "customer_member").in("field_key", ["allergies", "preferred_name"]))) as { id: string; field_key: string }[];
        const def = (k: string) => defs.find((d) => d.field_key === k)!.id;
        const fv = (await ok(service.from("field_values").insert([
            { org_id: ORG, entity_type: "customer_member", entity_id: ids.member, field_definition_id: def("allergies"), value_text: "Peanuts — anaphylaxis" },
            { org_id: ORG, entity_type: "customer_member", entity_id: ids.member, field_definition_id: def("preferred_name"), value_text: "Mimi" },
        ]).select("id, field_definition_id"))) as { id: string; field_definition_id: string }[];
        ids.allergyValue = fv.find((r) => r.field_definition_id === def("allergies"))!.id;
        ids.nameValue = fv.find((r) => r.field_definition_id === def("preferred_name"))!.id;

        const docs = (await ok(service.from("documents").insert([
            { org_id: ORG, entity_type: "customer_member", entity_id: ids.member, doc_type: "immunization_record", title: "Immunization record", original_filename: "imm.pdf", mime_type: "application/pdf", byte_size: 1, bucket: "documents", storage_path: `zz/${RUN}/imm.pdf`, status: "uploaded" },
            { org_id: ORG, entity_type: "customer_member", entity_id: ids.member, doc_type: "signature_asset", title: "Signature", original_filename: "sig.png", mime_type: "image/png", byte_size: 1, bucket: "documents", storage_path: `zz/${RUN}/sig.png`, status: "uploaded" },
        ]).select("id, doc_type"))) as { id: string; doc_type: string }[];
        ids.healthDoc = docs.find((d) => d.doc_type === "immunization_record")!.id;
        ids.plainDoc = docs.find((d) => d.doc_type === "signature_asset")!.id;

        const schema = { schema_version: 1, title: "ZZ", sections: [{ id: "s", field_ids: ["a"] }], fields: [{ id: "a", type: "text", label: "A", required: false }] };
        const medForm = (await ok(service.from("form_definitions").insert({ org_id: ORG, key: `zz_med_rls_${RUN}`, name: "ZZ medical", kind: "center", metadata: { health_capture: { medical_consent: { consent_kind: "medical_records_release", text_field_ids: [], signature_field_ids: ["sig"] } } } }).select("id").single())) as { id: string };
        const plainForm = (await ok(service.from("form_definitions").insert({ org_id: ORG, key: `zz_plain_rls_${RUN}`, name: "ZZ plain", kind: "center", metadata: {} }).select("id").single())) as { id: string };
        ids.medForm = medForm.id;
        ids.plainForm = plainForm.id;
        const vers = (await ok(service.from("form_definition_versions").insert([
            { org_id: ORG, form_definition_id: ids.medForm, version_number: 1, status: "published", published_at: new Date().toISOString(), schema_json: schema },
            { org_id: ORG, form_definition_id: ids.plainForm, version_number: 1, status: "published", published_at: new Date().toISOString(), schema_json: schema },
        ]).select("id, form_definition_id"))) as { id: string; form_definition_id: string }[];
        ids.medVer = vers.find((v) => v.form_definition_id === ids.medForm)!.id;
        ids.plainVer = vers.find((v) => v.form_definition_id === ids.plainForm)!.id;
        const subs = (await ok(service.from("form_submissions").insert([
            { org_id: ORG, form_definition_id: ids.medForm, form_definition_version_id: ids.medVer, status: "submitted", submitted_at: new Date().toISOString(), payload: { values: { a: "medical answer" } }, customer_id: ids.customer, customer_member_id: ids.member },
            { org_id: ORG, form_definition_id: ids.plainForm, form_definition_version_id: ids.plainVer, status: "submitted", submitted_at: new Date().toISOString(), payload: { values: { a: "plain answer" } }, customer_id: ids.customer, customer_member_id: ids.member },
        ]).select("id, form_definition_id"))) as { id: string; form_definition_id: string }[];
        ids.medSub = subs.find((s) => s.form_definition_id === ids.medForm)!.id;
        ids.plainSub = subs.find((s) => s.form_definition_id === ids.plainForm)!.id;
        const sig = (await ok(service.from("form_submission_signatures").insert({ org_id: ORG, form_submission_id: ids.medSub, field_id: "sig", signature_kind: "typed", typed_full_name: "Pat Rivers", signer_acknowledged_at: new Date().toISOString() }).select("id").single())) as { id: string };
        ids.medSig = sig.id;
    });

    afterAll(async () => {
        if (!service) return;
        if (ids.medSub || ids.plainSub) await service.from("form_submissions").delete().in("id", [ids.medSub, ids.plainSub].filter(Boolean));
        await service.from("form_definition_versions").delete().in("id", [ids.medVer, ids.plainVer].filter(Boolean));
        await service.from("form_definitions").delete().in("id", [ids.medForm, ids.plainForm].filter(Boolean));
        await service.from("documents").delete().in("id", [ids.healthDoc, ids.plainDoc].filter(Boolean));
        await service.from("field_values").delete().in("id", [ids.allergyValue, ids.nameValue].filter(Boolean));
        for (const u of Object.values(users)) if (u.id) {
            await service.from("user_roles").delete().eq("user_id", u.id);
            await service.from("user_person_links").delete().eq("user_id", u.id);
            await service.from("user_access_profiles").delete().eq("user_id", u.id);
            await service.auth.admin.deleteUser(u.id);
        }
    });

    const MEDICAL_ROWS = [
        ["field_values (allergy)", "field_values", () => ids.allergyValue],
        ["documents (immunization_record)", "documents", () => ids.healthDoc],
        ["form_submissions (medical form)", "form_submissions", () => ids.medSub],
        ["form_submission_signatures (medical form)", "form_submission_signatures", () => ids.medSig],
    ] as const;

    it.each(MEDICAL_ROWS)("an ops operator (org role, no health.view) cannot read %s", async (_label, table, id) => {
        expect(await sees("ops", table, id())).toBe(false);
    });

    it("…and still reads what ops reads today that is not medical (document, form submission)", async () => {
        // Measured baseline: ops reads the org's documents and form submissions through RLS. (Ops reads
        // no field_values row at all today — that policy's user_roles lookup is itself RLS-filtered
        // for ops — so field_values has no ops control; the admin control below covers it.)
        expect(await sees("ops", "documents", ids.plainDoc)).toBe(true);
        expect(await sees("ops", "form_submissions", ids.plainSub)).toBe(true);
        expect(await sees("admin", "field_values", ids.nameValue)).toBe(true);
    });

    it("an admin holding health.view reads the medical rows (authorized access preserved)", async () => {
        expect(await sees("admin", "field_values", ids.allergyValue)).toBe(true);
        expect(await sees("admin", "documents", ids.healthDoc)).toBe(true);
        expect(await sees("admin", "form_submissions", ids.medSub)).toBe(true);
        expect(await sees("admin", "form_submission_signatures", ids.medSig)).toBe(true);
    });

    it("a signed-in user with no role reads none of it", async () => {
        for (const [t, id] of [["field_values", ids.allergyValue], ["documents", ids.healthDoc], ["form_submissions", ids.medSub], ["field_values", ids.nameValue]] as const) {
            expect(await sees("none", t, id)).toBe(false);
        }
    });

    it("ops cannot write a child's allergy either (health.manage)", async () => {
        const { data } = await users.ops.client!.from("field_values").update({ value_text: "none" }).eq("id", ids.allergyValue).select("id");
        expect(data ?? []).toHaveLength(0);
        const after = (await ok(service.from("field_values").select("value_text").eq("id", ids.allergyValue).single())) as { value_text: string };
        expect(after.value_text).toBe("Peanuts — anaphylaxis");
    });
});
