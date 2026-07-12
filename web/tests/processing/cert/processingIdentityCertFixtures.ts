/**
 * Deterministic fixtures for Processing Identity local certification.
 * Replayable after `supabase db reset --no-seed` + seed().
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const CERT_PASSWORD = "ProcessingCert-Local-Only-2026";

export const CERT_ORG_A = "a1000001-0001-4001-8001-000000000001";
export const CERT_ORG_B = "a1000001-0001-4001-8001-000000000002";
export const CERT_DEPT_A = "a2000001-0001-4001-8001-000000000001";
export const CERT_DEPT_B = "a2000001-0001-4001-8001-000000000002";
export const CERT_WU_A = "a3000001-0001-4001-8001-000000000001";
export const CERT_WU_B = "a3000001-0001-4001-8001-000000000002";

export const CERT_USER_A_ADMIN = "b1000001-0001-4001-8001-000000000001";
export const CERT_USER_A_OPS = "b1000001-0001-4001-8001-000000000002";
export const CERT_USER_A_MANAGER = "b1000001-0001-4001-8001-000000000003";
export const CERT_USER_A_STAFF = "b1000001-0001-4001-8001-000000000004";
export const CERT_USER_B_ADMIN = "b1000001-0001-4001-8001-000000000005";

export const CERT_PERSON_A_PARENT = "c1000001-0001-4001-8001-000000000001";
export const CERT_PERSON_B_PARENT = "c1000001-0001-4001-8001-000000000002";
export const CERT_CUSTOMER_A = "d1000001-0001-4001-8001-000000000001";
export const CERT_CUSTOMER_B = "d1000001-0001-4001-8001-000000000002";
export const CERT_CHILD_A = "e1000001-0001-4001-8001-000000000001";
export const CERT_CHILD_B = "e1000001-0001-4001-8001-000000000002";
export const CERT_OPP_NULL_ORG = "f1000001-0001-4001-8001-000000000001";

export const SHARED_EMAIL = "shared.cert@test.local";
export const SHARED_PHONE = "+15555550999";

export function certDbConfigured(): boolean {
    const url = process.env.PROCESSING_LOCAL_CERT_DATABASE_URL?.trim() || process.env.DB_URL?.trim();
    return Boolean(process.env.PROCESSING_LOCAL_CERT_ENABLED === "true" && url?.includes(":55322"));
}

export function certSupabaseConfigured(): boolean {
    return certDbConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(":55321"));
}

export function createCertAdminClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing cert Supabase env");
    if (url.includes(":54321")) throw new Error("Cert must not target port 54321");
    return createClient(url, key, { auth: { persistSession: false } });
}

export function createCertAnonClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureAuthUser(admin: SupabaseClient, id: string, email: string): Promise<void> {
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.data.user) return;
    const { error } = await admin.auth.admin.createUser({
        id,
        email,
        password: CERT_PASSWORD,
        email_confirm: true,
    });
    if (error && !/already|exists|registered/i.test(error.message)) {
        throw new Error(`auth user ${email}: ${error.message}`);
    }
}

/** Seed org graph + identity fixtures for certification scenarios. */
export async function seedProcessingIdentityCertFixtures(admin: SupabaseClient): Promise<{ verticalId: string }> {
    const { data: industry } = await admin.from("industries").select("id").eq("key", "childcare").maybeSingle();
    const industryId = (industry as { id?: string } | null)?.id;
    if (!industryId) throw new Error("childcare industry missing");

    const { data: vertical } = await admin.from("verticals").select("id").limit(1).maybeSingle();
    const verticalId = (vertical as { id?: string } | null)?.id;
    if (!verticalId) throw new Error("vertical missing");

    for (const [orgId, name, slug] of [
        [CERT_ORG_A, "Cert Org A", "cert-org-a"],
        [CERT_ORG_B, "Cert Org B", "cert-org-b"],
    ] as const) {
        await admin.from("orgs").upsert({ id: orgId, name, slug, status: "active", industry_id: industryId });
    }

    await admin.from("departments").upsert([
        { id: CERT_DEPT_A, org_id: CERT_ORG_A, key: "enrollment", name: "Enrollment A" },
        { id: CERT_DEPT_B, org_id: CERT_ORG_B, key: "enrollment", name: "Enrollment B" },
    ]);
    await admin.from("work_units").upsert([
        { id: CERT_WU_A, org_id: CERT_ORG_A, department_id: CERT_DEPT_A, key: "enrollment-intake", name: "Enrollment Intake A" },
        { id: CERT_WU_B, org_id: CERT_ORG_B, department_id: CERT_DEPT_B, key: "enrollment-intake", name: "Enrollment Intake B" },
    ]);

    const users = [
        [CERT_USER_A_ADMIN, "cert-a-admin@test.local", CERT_ORG_A, "admin"],
        [CERT_USER_A_OPS, "cert-a-ops@test.local", CERT_ORG_A, "ops"],
        [CERT_USER_A_MANAGER, "cert-a-manager@test.local", CERT_ORG_A, "manager"],
        [CERT_USER_A_STAFF, "cert-a-staff@test.local", CERT_ORG_A, "manager"],
        [CERT_USER_B_ADMIN, "cert-b-admin@test.local", CERT_ORG_B, "admin"],
    ] as const;

    for (const [id, email] of users) {
        await ensureAuthUser(admin, id, email);
    }
    for (const [userId, , orgId, role] of users) {
        await admin.from("user_roles").upsert({ user_id: userId, org_id: orgId, role }, { onConflict: "user_id,org_id,role" });
    }

    await admin.from("persons").upsert([
        {
            id: CERT_PERSON_A_PARENT,
            org_id: CERT_ORG_A,
            first_name: "Existing",
            last_name: "ParentA",
            email: SHARED_EMAIL,
            phone: SHARED_PHONE,
        },
        {
            id: CERT_PERSON_B_PARENT,
            org_id: CERT_ORG_B,
            first_name: "Existing",
            last_name: "ParentB",
            email: "parent-b@test.local",
        },
    ]);

    await admin.from("customers").upsert([
        { id: CERT_CUSTOMER_A, org_id: CERT_ORG_A, name: "Existing Family A", customer_type: "household" },
        { id: CERT_CUSTOMER_B, org_id: CERT_ORG_B, name: "Existing Family B", customer_type: "household" },
    ]);

    await admin.from("customer_persons").upsert({
        org_id: CERT_ORG_A,
        customer_id: CERT_CUSTOMER_A,
        person_id: CERT_PERSON_A_PARENT,
        role_type: "primary_contact",
    });

    await admin.from("customer_members").upsert([
        {
            id: CERT_CHILD_A,
            org_id: CERT_ORG_A,
            customer_id: CERT_CUSTOMER_A,
            display_name: "Existing Child A",
            first_name: "Existing",
            last_name: "ChildA",
            dob: "2019-03-15",
            relationship: "child",
        },
        {
            id: CERT_CHILD_B,
            org_id: CERT_ORG_B,
            customer_id: CERT_CUSTOMER_B,
            display_name: "Same Name Child",
            first_name: "Jamie",
            last_name: "Cert",
            dob: "2020-01-01",
            relationship: "child",
        },
    ]);

    // Null-org legacy opportunity (diagnostic only — must not appear as cross-tenant candidate)
    await admin.from("opportunities").upsert({
        id: CERT_OPP_NULL_ORG,
        org_id: null,
        vertical_id: verticalId,
        name: "Legacy Null Org Opportunity",
        status_key: "new_lead",
        metadata: { cert_fixture: "null_org_legacy" },
    });

    return { verticalId };
}

export async function signInCertUser(email: string): Promise<SupabaseClient> {
    const anon = createCertAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: CERT_PASSWORD });
    if (error || !data.session) throw new Error(`signIn failed for ${email}: ${error?.message}`);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
}
