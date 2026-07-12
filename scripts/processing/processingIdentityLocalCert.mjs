#!/usr/bin/env node
/**
 * Processing Identity Resolution — local Postgres certification runner.
 *
 * Requires a migrated local Supabase/Postgres (port 54322 default).
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     node scripts/processing/processingIdentityLocalCert.mjs
 */

import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.PROCESSING_LOCAL_CERT_DATABASE_URL?.trim() ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const results = [];
function pass(name) {
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
}
function fail(name, detail) {
    results.push({ name, ok: false, detail });
    console.error(`FAIL ${name}: ${detail}`);
    process.exitCode = 1;
}

async function main() {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    // --- B0 orphan preflight ---
    const orphan = await client.query(`
        SELECT count(*)::int AS n FROM persons p
        LEFT JOIN orgs o ON o.id = p.org_id WHERE o.id IS NULL
    `);
    if (orphan.rows[0].n === 0) pass("B0 orphan preflight (0 orphan persons)");
    else fail("B0 orphan preflight", `expected 0, got ${orphan.rows[0].n}`);

    // FK prevents invalid org on persons (controlled insert must fail)
    const badOrg = "00000000-0000-4000-8000-000000009999";
    let fkBlocked = false;
    try {
        await client.query(`INSERT INTO persons (org_id, first_name, last_name) VALUES ($1, 'Bad', 'Org')`, [badOrg]);
    } catch (e) {
        fkBlocked = true;
    }
    if (fkBlocked) pass("persons.org_id FK blocks invalid org");
    else fail("persons.org_id FK", "insert with missing org succeeded");

    // --- Processing tables exist ---
    const tables = await client.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'processing_%'
        ORDER BY tablename
    `);
    const expected = [
        "processing_approvals",
        "processing_case_sources",
        "processing_cases",
        "processing_commit_attempts",
        "processing_commit_plans",
        "processing_exceptions",
        "processing_facts",
        "processing_plan_operations",
        "processing_resolutions",
    ];
    const found = tables.rows.map((r) => r.tablename);
    const missing = expected.filter((t) => !found.includes(t));
    if (missing.length === 0) pass("processing identity tables present");
    else fail("processing identity tables", `missing: ${missing.join(", ")}`);

    // --- RPC exists ---
    const rpc = await client.query(`
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'execute_processing_identity_group'
    `);
    if (rpc.rowCount === 1) pass("execute_processing_identity_group RPC exists");
    else fail("RPC", "function not found");

    // --- Seed org A/B for tenant isolation ---
    const orgA = randomUUID();
    const orgB = randomUUID();
    await client.query(`INSERT INTO orgs (id, name, slug) VALUES ($1, 'Cert Org A', $2), ($3, 'Cert Org B', $4)`, [
        orgA,
        `cert-a-${orgA.slice(0, 8)}`,
        orgB,
        `cert-b-${orgB.slice(0, 8)}`,
    ]);

    // --- Atomic identity group success ---
    const idemKey = `cert-${Date.now()}`;
    const ops = [
        { op_id: "p1", command_key: "create_person", payload: { first_name: "Cert", last_name: "Parent", email: "cert-parent@test.local", phone: null } },
        { op_id: "h1", command_key: "create_household", payload: { household_name: "Cert Household" } },
        {
            op_id: "l1",
            command_key: "link_person_to_household",
            payload: { person_id: "@p1", household_id: "@h1", role_type: "primary_contact" },
        },
        {
            op_id: "c1",
            command_key: "create_child",
            payload: { household_id: "@h1", display_name: "Cert Child", first_name: "Cert", last_name: "Child", dob: "2020-01-15" },
        },
    ];
    const rpcOk = await client.query(
        `SELECT public.execute_processing_identity_group($1::uuid, $2, $3, $4::jsonb) AS result`,
        [orgA, "cert-runner", idemKey, JSON.stringify(ops)],
    );
    const refs = rpcOk.rows[0]?.result?.refs;
    if (refs?.p1 && refs?.h1 && refs?.c1) pass("RPC atomic identity group creates person/household/child");
    else fail("RPC atomic success", JSON.stringify(rpcOk.rows[0]?.result));

    // --- Idempotent replay returns same refs shape (second call creates duplicates if not idempotent at app layer; RPC itself creates new rows each call) ---
    const personCountBefore = await client.query(`SELECT count(*)::int AS n FROM persons WHERE org_id = $1`, [orgA]);
    await client.query(`SELECT public.execute_processing_identity_group($1::uuid, $2, $3, $4::jsonb)`, [
        orgA,
        "cert-runner",
        idemKey + "-replay",
        JSON.stringify(ops),
    ]);
    const personCountAfter = await client.query(`SELECT count(*)::int AS n FROM persons WHERE org_id = $1`, [orgA]);
    // Document: RPC is not idempotent at DB layer — app layer owns idempotency via commit attempts
    if (personCountAfter.rows[0].n > personCountBefore.rows[0].n) {
        pass("RPC replay creates new rows (app-layer idempotency required — documented)");
    }

    // --- Atomic rollback: unsupported command rolls back entire group ---
    let rolledBack = false;
    try {
        await client.query(`SELECT public.execute_processing_identity_group($1::uuid, $2, $3, $4::jsonb)`, [
            orgA,
            "cert-runner",
            `rollback-${Date.now()}`,
            JSON.stringify([
                { op_id: "p2", command_key: "create_person", payload: { first_name: "Rollback", last_name: "Test", email: "rb@test.local" } },
                { op_id: "x1", command_key: "create_lead", payload: {} },
            ]),
        ]);
    } catch {
        rolledBack = true;
    }
    const rbPerson = await client.query(`SELECT count(*)::int AS n FROM persons WHERE org_id = $1 AND email = 'rb@test.local'`, [orgA]);
    if (rolledBack && rbPerson.rows[0].n === 0) pass("RPC atomic rollback on unsupported command");
    else fail("RPC rollback", `rolledBack=${rolledBack} orphanPersons=${rbPerson.rows[0].n}`);

    // --- Cross-org isolation: org B cannot read org A processing case ---
    const caseId = randomUUID();
    await client.query(
        `INSERT INTO processing_cases (id, org_id, status, case_type) VALUES ($1, $2, 'received', 'form_submission')`,
        [caseId, orgA],
    );
    await client.query(
        `INSERT INTO processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
         VALUES ($1, $2, 'form_submission', $3, 'primary')`,
        [orgA, caseId, randomUUID()],
    );

    // Service role sees both; authenticated RLS tested via policy existence
    const policies = await client.query(`
        SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('processing_facts', 'processing_resolutions', 'processing_commit_plans')
        AND policyname LIKE '%select_org%'
    `);
    if (policies.rowCount >= 3) pass("processing tables have org-scoped SELECT policies");
    else fail("RLS policies", `expected >=3 select_org policies, got ${policies.rowCount}`);

    // Cross-org fact insert with wrong org_id should fail when using FK (case belongs to orgA)
    const factId = randomUUID();
    let crossOrgFactBlocked = false;
    try {
        await client.query(
            `INSERT INTO processing_facts (id, org_id, case_id, fact_type, raw_value, normalized_value)
             VALUES ($1, $2, $3, 'email', 'x@test.com', 'x@test.com')`,
            [factId, orgB, caseId],
        );
    } catch {
        crossOrgFactBlocked = true;
    }
    if (crossOrgFactBlocked) pass("processing_facts FK blocks cross-org case reference");
    else fail("cross-org fact", "insert succeeded with mismatched org/case");

    // --- create_lead source kind check constraint (separate case — one primary per case) ---
    const caseIdLead = randomUUID();
    await client.query(
        `INSERT INTO processing_cases (id, org_id, status, case_type) VALUES ($1, $2, 'received', 'create_lead')`,
        [caseIdLead, orgA],
    );
    let createLeadKindOk = false;
    try {
        await client.query(
            `INSERT INTO processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
             VALUES ($1, $2, 'create_lead', $3, 'primary')`,
            [orgA, caseIdLead, randomUUID()],
        );
        createLeadKindOk = true;
    } catch (e) {
        fail("create_lead source_kind", e.message);
    }
    if (createLeadKindOk) pass("create_lead source_kind allowed (D4 migration)");

    // Cleanup cert data (customers/persons from RPC before org delete)
    await client.query(`DELETE FROM processing_facts WHERE case_id IN ($1, $2)`, [caseId, caseIdLead]);
    await client.query(`DELETE FROM processing_case_sources WHERE processing_case_id IN ($1, $2)`, [caseId, caseIdLead]);
    await client.query(`DELETE FROM processing_cases WHERE id IN ($1, $2)`, [caseId, caseIdLead]);
    await client.query(`DELETE FROM customer_members WHERE org_id = $1`, [orgA]);
    await client.query(`DELETE FROM customer_persons WHERE org_id = $1`, [orgA]);
    await client.query(`DELETE FROM customers WHERE org_id = $1`, [orgA]);
    await client.query(`DELETE FROM persons WHERE org_id = $1`, [orgA]);
    await client.query(`DELETE FROM orgs WHERE id IN ($1, $2)`, [orgA, orgB]);

    await client.end();
    console.log(`\nCertification complete: ${results.filter((r) => r.ok).length}/${results.length} passed`);
    if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
