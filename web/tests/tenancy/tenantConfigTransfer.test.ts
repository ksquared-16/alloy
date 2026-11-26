/**
 * Offline tests for the step-16 tenant commands (briefing M5, M8): the target guard, the configuration allowlist,
 * the export's read, and the file gate the import applies. The in-database proof is the B3 rehearsal
 * (docs/platform/runtime/environments-b3-tenant-evidence-2026-11-25/).
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import {
    CONFIG_EXPORT_FORMAT,
    KIND_FIELDS,
    NOT_TRANSFERRED,
    TABLE_CLASSES,
    TRANSFERABLE_KINDS,
    refusalReasonForKind,
} from "@/lib/tenancy/configTransfer/allowlist";
import { buildExportFile, foreignUuidsInProcess, validateExportFile, type RawExport } from "@/lib/tenancy/configTransfer/exportFile";
import { EXPORT_READ_TABLES, renderExportSql } from "@/lib/tenancy/configTransfer/exportSql";
import { canonicalJson, differingPaths } from "@/lib/tenancy/configTransfer/importer";
import { renderRollbackSql } from "@/lib/tenancy/configTransfer/rollbackSql";
import { parseBaselineCounts } from "@/lib/tenancy/configTransfer/verify";
import { resolveOperatorTarget } from "@/lib/tenancy/operatorTarget";

const WEB = join(__dirname, "..", "..");
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
const REF = "abcdefghijklmnopqrst";
const prod = (over: Record<string, unknown> = {}) => ({
    target: "production",
    supabaseUrl: `https://${REF}.supabase.co`,
    projectRef: REF,
    alloyEnvironment: "production",
    serviceRoleKey: jwt({ role: "service_role", ref: REF }),
    ...over,
});

describe("operator target (M5, M8)", () => {
    it("accepts production only as https://<ref>.supabase.co with the ref re-typed and ALLOY_ENVIRONMENT=production", () => {
        expect(resolveOperatorTarget(prod())).toMatchObject({ ok: true, target: "production", projectRef: REF });
    });

    it.each([
        ["staging", { supabaseUrl: "https://ikaxilmwmrmbagoidedu.supabase.co", projectRef: "ikaxilmwmrmbagoidedu" }, "forbidden_project"],
        ["the previous production project", { supabaseUrl: "https://vslwnntzzgpnmrpjipat.supabase.co", projectRef: "vslwnntzzgpnmrpjipat" }, "forbidden_project"],
        ["no target", { target: null }, "target_required"],
        ["no URL", { supabaseUrl: "" }, "supabase_url_required"],
        ["no ref re-typed", { projectRef: null }, "project_ref_required"],
        ["a mistyped ref", { projectRef: "abcdefghijklmnopqrsx" }, "project_ref_mismatch"],
        ["an undeclared environment", { alloyEnvironment: "staging" }, "environment_not_declared"],
        ["a pooler or other host", { supabaseUrl: `https://db.${REF}.supabase.co` }, "production_url_shape"],
        ["a path on the URL", { supabaseUrl: `https://${REF}.supabase.co/rest/v1` }, "production_url_shape"],
        ["plain http", { supabaseUrl: `http://${REF}.supabase.co` }, "production_url_shape"],
        ["no key", { serviceRoleKey: "" }, "service_role_key_required"],
        ["an anon key", { serviceRoleKey: jwt({ role: "anon", ref: REF }) }, "service_role_key_wrong_role"],
        ["another project's key", { serviceRoleKey: jwt({ role: "service_role", ref: "zzzzzzzzzzzzzzzzzzzz" }) }, "service_role_key_other_project"],
    ])("refuses %s", (_label, over, code) => {
        expect(resolveOperatorTarget(prod(over))).toMatchObject({ ok: false, code });
    });

    it("accepts local only on loopback, with no ref", () => {
        const local = { target: "local", supabaseUrl: "http://127.0.0.1:54421", projectRef: null, serviceRoleKey: "sb_secret_x" };
        expect(resolveOperatorTarget(local)).toMatchObject({ ok: true, target: "local" });
        expect(resolveOperatorTarget({ ...local, supabaseUrl: "http://10.0.0.5:54421" })).toMatchObject({ ok: false, code: "local_not_loopback" });
        expect(resolveOperatorTarget({ ...local, projectRef: REF })).toMatchObject({ ok: false, code: "local_takes_no_ref" });
    });

    it("the commands read no .env file and never take the key from argv", () => {
        for (const f of ["scripts/tenantCreate.ts", "scripts/tenantConfigImport.ts", "lib/tenancy/operatorSession.ts"]) {
            const src = readFileSync(join(WEB, f), "utf8");
            expect(src, f).not.toMatch(/dotenv|loadEnv/);
            expect(src, f).not.toMatch(/argValue\(argv, "(service-role-key|key)"\)/);
        }
    });

    it("tenant:create calls the existing helper directly and nothing else under lib/dev, never the dev route or flag", () => {
        const src = readFileSync(join(WEB, "scripts/tenantCreate.ts"), "utf8");
        const devImports = [...src.matchAll(/from "(@\/lib\/dev\/[^"]+)"/g)].map((m) => m[1]);
        expect(devImports).toEqual(["@/lib/dev/createOrgAndAssignAdmin"]);
        expect(src).toMatch(/createOrgAndAssignAdmin\(supabase, \{[\s\S]*org_id: orgId,/);
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(code).not.toMatch(/DEV_TENANT_SPINUP_ENABLED|dev\/create-org|spinChildcareTenantFlow|createChildcareDemoTenant/);
    });
});

describe("configuration allowlist (M8)", () => {
    it("transfers only the reviewed kinds", () => {
        expect([...TRANSFERABLE_KINDS]).toEqual(["sites", "rooms", "household_role_types", "enrollment_process"]);
    });

    it.each([
        "children", "families", "persons", "staff", "messages", "documents", "provider_bindings", "payment_merchants",
        "secrets", "charges", "programs", "charge_templates", "catalog_rates",
    ])("refuses %s with a reason", (kind) => {
        expect(refusalReasonForKind(kind)).toBe(NOT_TRANSFERRED[kind]);
    });

    it("refuses an unknown kind as not on the allowlist", () => {
        expect(refusalReasonForKind("anything_else")).toMatch(/not on the configuration allowlist/);
    });

    it("never lets a record, binding or history table into the import's write set", () => {
        const writes = new Set<string>(TABLE_CLASSES.import_writes);
        for (const t of [...TABLE_CLASSES.record_or_transaction, ...TABLE_CLASSES.never_transferred_bindings, "mutation_events"]) {
            expect(writes.has(t), t).toBe(false);
        }
    });
});

describe("export read (M8)", () => {
    const sql = renderExportSql();

    it("is one read-only transaction that is rolled back", () => {
        expect(sql).toMatch(/BEGIN READ ONLY;/);
        expect(sql.trim().endsWith("ROLLBACK;")).toBe(true);
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|GRANT|COMMIT)\b/);
    });

    it("reads only the allowlisted tables, by named column, for the one org", () => {
        const read = [...sql.matchAll(/\bFROM public\.([a-z_]+)/g)].map((m) => m[1]);
        expect([...new Set(read)].sort()).toEqual([...EXPORT_READ_TABLES].sort());
        expect(sql).not.toMatch(/\*\s+FROM|SELECT \*/i);
        expect(sql).not.toMatch(/auth\.|storage\.|vault\./);
        for (const t of EXPORT_READ_TABLES.filter((x) => x !== "orgs")) {
            expect(sql, t).toMatch(new RegExp(`FROM public\\.${t} [a-z]+\\s+WHERE [a-z]+\\.org_id = :'org_id'::uuid`));
        }
    });

    it("excludes household addresses (customer- or vendor-owned locations)", () => {
        expect(sql).toMatch(/l\.customer_id IS NULL AND l\.vendor_id IS NULL/);
    });
});

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const SITE = "11111111-1111-4111-8111-111111111111";
const process = {
    id: "22222222-2222-4222-8222-222222222222",
    key: "enrollment",
    name: "Enrollment",
    is_active: true,
    stages: [{ id: "33333333-3333-4333-8333-333333333333", key: "lead", label: "Lead" }],
};
const raw = (over: Partial<RawExport> = {}): RawExport => ({
    org: { id: ORG, name: "Firefly Early Learning", status: "active" },
    locations: [
        { id: SITE, label: "North Campus", location_type: "site", parent_location_id: null, is_active: true, city: "Salem", metadata: { site_key: "north", legacy_code: "x" } },
        { id: "44444444-4444-4444-8444-444444444444", label: "Infant A", location_type: "unit", parent_location_id: SITE, is_active: true, metadata: { capacity: 8, qa_note: "y" } },
        { id: "55555555-5555-4555-8555-555555555555", label: "QA Room 7", location_type: "unit", parent_location_id: SITE, is_active: true, metadata: {} },
    ],
    role_types: [
        { id: "66666666-6666-4666-8666-666666666666", key: "parent", label: "Parent", is_system: false, metadata: {} },
        { id: "77777777-7777-4777-8777-777777777777", key: "cert_payer", label: "Cert payer", is_system: false, metadata: {} },
    ],
    departments: [{ id: "88888888-8888-4888-8888-888888888888", key: "lead_management", name: "Enrollment", builder: { version: 1, active_process_id: process.id, processes: [process] }, metadata_keys: ["lifecycle_builder_v1", "lifecycle_activation_v1"] }],
    work_units: [{ department_id: "88888888-8888-4888-8888-888888888888", key: "lifecycle_wu_lead" }],
    ...over,
});
const build = (r: RawExport = raw(), keepSeedConfig = false) =>
    buildExportFile({ raw: r, kinds: TRANSFERABLE_KINDS, environment: "staging", host: "h", projectRef: "ikaxilmwmrmbagoidedu", exportedAt: "t", keepSeedConfig });

describe("export file (M8)", () => {
    it("keys items by ref, carries no source id, and lists what it left behind", () => {
        const res = build();
        if (!res.ok) throw new Error(res.error);
        const f = res.file;
        expect(f.format).toBe(CONFIG_EXPORT_FORMAT);
        expect(f.kinds.sites).toEqual([expect.objectContaining({ ref: "site:north-campus", label: "North Campus", metadata: { site_key: "north" } })]);
        expect(f.kinds.rooms).toEqual([expect.objectContaining({ ref: "room:north-campus/infant-a", site_ref: "site:north-campus", metadata: { capacity: 8 } })]);
        expect(f.kinds.household_role_types!.map((t) => t.key)).toEqual(["parent"]);
        expect(f.kinds.enrollment_process![0].derived_work_unit_keys).toEqual(["lifecycle_wu_lead"]);
        expect(f.left_behind).toEqual([
            { kind: "rooms", label: "QA Room 7", reason: "QA prefix" },
            { kind: "household_role_types", label: "cert_payer", reason: "cert_ key prefix" },
        ]);
        expect(f.dropped_metadata_keys).toEqual(
            expect.arrayContaining([
                { ref: "site:north-campus", keys: ["legacy_code"] },
                { ref: "room:north-campus/infant-a", keys: ["qa_note"] },
                { ref: "process:lead_management/enrollment", keys: ["lifecycle_activation_v1"] },
            ]),
        );
        const outsideProcess = JSON.stringify({ ...f.kinds, enrollment_process: undefined });
        expect(outsideProcess).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
        expect(JSON.stringify(f.kinds)).not.toContain(SITE);
        expect(validateExportFile(JSON.parse(JSON.stringify(f)))).toMatchObject({ ok: true });
    });

    it("leaves seed rows behind unless --keep-seed-config, which is local-only", () => {
        const seeded = raw({ locations: [{ ...raw().locations[0], id: "f17e0000-0000-4000-8000-b00000000001" }] });
        const res = build(seeded);
        expect(res.ok && res.file.kinds.sites).toEqual([]);
        expect(build(seeded, true)).toMatchObject({ ok: false, error: expect.stringMatching(/local-only/) });
    });

    it("refuses a process that carries an id it does not define", () => {
        const leaky = { ...process, stages: [{ ...process.stages[0], work_unit_id: "99999999-9999-4999-8999-999999999999" }] };
        expect(foreignUuidsInProcess(leaky)).toEqual(["99999999-9999-4999-8999-999999999999"]);
        const res = build(raw({ departments: [{ ...raw().departments[0], builder: { version: 1, active_process_id: process.id, processes: [leaky] } }] }));
        expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/ids it does not define/) });
    });

    it("refuses two sites with one label rather than guessing", () => {
        const dup = raw({ locations: [raw().locations[0], { ...raw().locations[0], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] });
        expect(build(dup)).toMatchObject({ ok: false });
    });
});

describe("the import's file gate (M8)", () => {
    const good = () => {
        const res = build();
        if (!res.ok) throw new Error(res.error);
        return JSON.parse(JSON.stringify(res.file));
    };
    const errorsOf = (f: unknown) => {
        const r = validateExportFile(f);
        return r.ok ? [] : r.errors;
    };

    it("refuses a kind outside the allowlist, with its reason", () => {
        const f = good();
        f.kinds.children = [];
        f.kinds.provider_bindings = [];
        expect(errorsOf(f)).toEqual(
            expect.arrayContaining([expect.stringMatching(/kinds\.children: refused — person data/), expect.stringMatching(/kinds\.provider_bindings: refused — environment credentials/)]),
        );
    });

    it("refuses a field outside a kind's field list, and a missing one", () => {
        const f = good();
        f.kinds.sites[0].email = "x@example.invalid";
        delete f.kinds.rooms[0].label;
        expect(errorsOf(f)).toEqual(expect.arrayContaining([expect.stringMatching(/fields outside the allowlist: email/), expect.stringMatching(/missing fields: label/)]));
    });

    it("refuses location metadata outside the kept keys, a marker label, a source id, a dangling ref", () => {
        const f = good();
        f.kinds.rooms[0].metadata.qa_run_id = "qar_1";
        f.kinds.sites[0].label = "QA site";
        f.kinds.household_role_types[0].description = `was ${SITE}`;
        f.kinds.rooms[0].site_ref = "site:nowhere";
        const e = errorsOf(f);
        expect(e).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/metadata: keys outside the allowlist: qa_run_id/),
                expect.stringMatching(/label carries a test-data marker/),
                expect.stringMatching(/carries an id/),
                expect.stringMatching(/site_ref site:nowhere is not a site/),
            ]),
        );
    });

    it.each(["inventory.json", "raw-builder.json", "provenance.json"])(
        "refuses the retired July 2026 capture (%s) as an import source (P3 C14)",
        (name) => {
            const capture = JSON.parse(readFileSync(join(WEB, "..", "docs/sprints/active/assets/firefly-config", name), "utf8"));
            expect(validateExportFile(capture)).toMatchObject({ ok: false });
        },
    );

    it("refuses another format", () => {
        expect(errorsOf({ ...good(), format: "pg_dump" })).toEqual(expect.arrayContaining([expect.stringMatching(/format/)]));
    });

    it("every kind's field list is what the builder writes", () => {
        const f = good();
        for (const k of TRANSFERABLE_KINDS) for (const item of f.kinds[k]) expect(Object.keys(item).sort()).toEqual([...KIND_FIELDS[k]].sort());
    });
});

describe("step-16 removal SQL (briefing §7)", () => {
    const sql = renderRollbackSql();

    it("is one transaction that stops at the first error", () => {
        expect(sql).toMatch(/\\set ON_ERROR_STOP 1\nBEGIN;/);
        expect(sql.trim().endsWith("COMMIT;")).toBe(true);
        expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    });

    it("takes the org only as psql variables, and checks its name before any change", () => {
        expect(sql).toMatch(/set_config\('alloy\.rollback_org_id', :'org_id', true\)/);
        expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
        const firstAlter = sql.indexOf("ALTER TABLE");
        for (const refusal of ["org_not_found", "org_name_mismatch", "org_not_active", "w17_org", "window_closed"]) {
            expect(sql.indexOf(refusal), refusal).toBeGreaterThan(0);
            expect(sql.indexOf(refusal), refusal).toBeLessThan(firstAlter);
        }
    });

    it("refuses once any record or transaction table holds a row for the org", () => {
        for (const t of TABLE_CLASSES.record_or_transaction) expect(sql).toContain(`'${t}'`);
    });

    it("lifts only user triggers, one by one, restores each, and never touches auth, storage or foreign keys", () => {
        expect(sql).toMatch(/NOT tg\.tgisinternal/);
        expect(sql).toMatch(/DISABLE TRIGGER %I/);
        expect(sql).toMatch(/ENABLE TRIGGER %I/);
        expect(sql).not.toMatch(/TRIGGER (ALL|USER)\b|session_replication_role|auth\.|storage\./);
        expect(sql).toMatch(/trigger_not_restored/);
        expect(sql).toMatch(/rollback failed \(incomplete\)/);
    });
});

describe("helpers", () => {
    it("canonical JSON ignores key order and undefined values", () => {
        expect(canonicalJson({ b: 1, a: [{ y: 2, x: undefined }] })).toBe(canonicalJson({ a: [{ y: 2 }], b: 1 }));
        expect(differingPaths({ a: 1, s: [{ k: 1 }] }, { a: 1, s: [{ k: 2 }] })).toEqual(["s[0].k"]);
    });

    it("reads the step-9 census rows", () => {
        expect([...parseBaselineCounts("extension:x|present\nrows:orgs|1\nrows:document_types|13\n")]).toEqual([["orgs", 1], ["document_types", 13]]);
    });
});
