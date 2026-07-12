import { describe, expect, it, beforeAll } from "vitest";
import {
    CERT_ORG_A,
    CERT_ORG_B,
    CERT_CUSTOMER_A,
    CERT_PERSON_A_PARENT,
    CERT_USER_A_ADMIN,
    CERT_USER_A_OPS,
    CERT_USER_A_MANAGER,
    CERT_USER_A_STAFF,
    CERT_USER_B_ADMIN,
    certSupabaseConfigured,
    createCertAdminClient,
    seedProcessingIdentityCertFixtures,
    signInCertUser,
} from "./cert/processingIdentityCertFixtures";

describe.skipIf(!certSupabaseConfigured())("processing identity authenticated RLS (real JWT)", () => {
    beforeAll(async () => {
        const admin = createCertAdminClient();
        await seedProcessingIdentityCertFixtures(admin);
    });

    it("org A admin reads same-org person without recursion error", async () => {
        const client = await signInCertUser("cert-a-admin@test.local");
        const { data, error } = await client.from("persons").select("id").eq("id", CERT_PERSON_A_PARENT);
        expect(error).toBeNull();
        expect(data?.length).toBe(1);
    });

    it("org A admin cannot read org B person", async () => {
        const client = await signInCertUser("cert-a-admin@test.local");
        const { data, error } = await client.from("persons").select("id").eq("org_id", CERT_ORG_B);
        expect(error).toBeNull();
        expect(data?.length ?? 0).toBe(0);
    });

    it("org A admin reads same-org customer", async () => {
        const client = await signInCertUser("cert-a-admin@test.local");
        const { data, error } = await client.from("customers").select("id").eq("id", CERT_CUSTOMER_A);
        expect(error).toBeNull();
        expect(data?.length).toBe(1);
    });

    it("org A ops can read processing_cases in org A", async () => {
        const admin = createCertAdminClient();
        const { data: inserted } = await admin
            .from("processing_cases")
            .insert({ org_id: CERT_ORG_A, status: "received", case_type: "form_submission" })
            .select("id")
            .single();
        const caseId = (inserted as { id: string }).id;
        const client = await signInCertUser("cert-a-ops@test.local");
        const { data, error } = await client.from("processing_cases").select("id").eq("id", caseId);
        expect(error).toBeNull();
        expect(data?.length).toBe(1);
        await admin.from("processing_cases").delete().eq("id", caseId);
    });

    it("org A manager cannot insert person into org B", async () => {
        const client = await signInCertUser("cert-a-manager@test.local");
        const { error } = await client.from("persons").insert({
            org_id: CERT_ORG_B,
            first_name: "Cross",
            last_name: "Tenant",
        });
        expect(error).not.toBeNull();
    });

    it("org A staff cannot insert processing_resolutions in org A", async () => {
        const admin = createCertAdminClient();
        const { data: caseRow } = await admin
            .from("processing_cases")
            .insert({ org_id: CERT_ORG_A, status: "received", case_type: "cert" })
            .select("id")
            .single();
        const caseId = (caseRow as { id: string }).id;
        const client = await signInCertUser("cert-a-staff@test.local");
        const { error } = await client.from("processing_resolutions").insert({
            org_id: CERT_ORG_A,
            case_id: caseId,
            generation_id: crypto.randomUUID(),
            input_facts_hash: "hash",
            subject_ref: "parent:0",
            subject_role: "parent",
            provisional: {},
            candidates: [],
            decided_by: "operator",
            resolver_version: "cert",
            retention_class: "uncommitted_submission",
        });
        expect(error).not.toBeNull();
        await admin.from("processing_cases").delete().eq("id", caseId);
    });

    it("org A admin can read processing_facts in org A", async () => {
        const admin = createCertAdminClient();
        const { data: caseRow } = await admin
            .from("processing_cases")
            .insert({ org_id: CERT_ORG_A, status: "received", case_type: "cert" })
            .select("id")
            .single();
        const caseId = (caseRow as { id: string }).id;
        const client = await signInCertUser("cert-a-admin@test.local");
        const { data, error } = await client.from("processing_facts").select("id").eq("case_id", caseId);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
        await admin.from("processing_cases").delete().eq("id", caseId);
    });

    it("org B admin cannot read org A customer", async () => {
        const client = await signInCertUser("cert-b-admin@test.local");
        const { data, error } = await client.from("customers").select("id").eq("id", CERT_CUSTOMER_A);
        expect(error).toBeNull();
        expect(data?.length ?? 0).toBe(0);
    });

    it("org A ops cannot read org B processing_cases", async () => {
        const admin = createCertAdminClient();
        const { data: inserted } = await admin
            .from("processing_cases")
            .insert({ org_id: CERT_ORG_B, status: "received", case_type: "cert" })
            .select("id")
            .single();
        const caseId = (inserted as { id: string }).id;
        const client = await signInCertUser("cert-a-ops@test.local");
        const { data, error } = await client.from("processing_cases").select("id").eq("id", caseId);
        expect(error).toBeNull();
        expect(data?.length ?? 0).toBe(0);
        await admin.from("processing_cases").delete().eq("id", caseId);
    });

    it("service role still reads both orgs", async () => {
        const admin = createCertAdminClient();
        const { count } = await admin.from("persons").select("id", { count: "exact", head: true }).in("org_id", [CERT_ORG_A, CERT_ORG_B]);
        expect((count ?? 0) >= 2).toBe(true);
    });
});
