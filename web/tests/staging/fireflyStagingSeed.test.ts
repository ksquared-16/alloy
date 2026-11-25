/**
 * Firefly staging seed (ALY-14 E2) — repeatable, realistic, known, and fenced to its own org.
 *
 * These run without a database. The in-database half of "no unintended writes" is the fence the
 * seed carries (renderSql.ts); what is proven here is that the script cannot be anything else:
 * byte-identical on every render, committed exactly as rendered, every write inside the write set,
 * every id inside the seed namespace, and every target other than the two designated ones refused.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { FORBIDDEN_QA_ORG_IDS, QA_IDENTITIES, QA_ORGS, QA_STRUCTURE } from "@/lib/qa/sharedQaRegistry";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { isControlledTestEmail, isControlledTestPhone } from "@/lib/communications/stagingOutboundRecipientGuard";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { activeLifecycleProcess, parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { auditFireflyStagingSeedSql, SEED_WRITE_SET } from "@/lib/staging/fireflyStagingSeed/auditSql";
import { buildSeedLifecycleBuilder } from "@/lib/staging/fireflyStagingSeed/builder";
import {
    buildSeedFamilies,
    expectedSeedCounts,
    SEED_ANCHOR_DATE,
    SEED_OFFERINGS,
    SEED_PROGRAM_CATEGORIES,
    SEED_ROOMS,
    SEED_SITES,
    SEED_VARIANTS,
} from "@/lib/staging/fireflyStagingSeed/dataset";
import { LIVE_FIREFLY_ORG_ID, SEED_ID_PREFIX, SEED_ORG_ID, SEED_ORG_NAME, SEED_ORG_SLUG, seedId } from "@/lib/staging/fireflyStagingSeed/ids";
import { renderFireflyStagingSeedSql } from "@/lib/staging/fireflyStagingSeed/renderSql";
import {
    driftEditSql,
    plantZzFixturesSql,
    scratchCountChecks,
    scratchProofRefusal,
    scratchRelationshipChecks,
    ZZ_QA_ORGS,
    zzSnapshotSql,
} from "@/lib/staging/fireflyStagingSeed/scratchProof";
import {
    LOCAL_STACK_DEFAULT_DATABASE_URL,
    PRODUCTION_PROJECT_REF,
    redactDatabaseUrl,
    resolveSeedTarget,
    STAGING_PROJECT_REF,
} from "@/lib/staging/fireflyStagingSeed/targets";
import {
    buildVerificationChecks,
    parseVerificationOutput,
    renderFireflyStagingVerifySql,
} from "@/lib/staging/fireflyStagingSeed/verifySql";
import WORK_UNIT_QUEUE_DEFINITIONS from "@/lib/staging/fireflyStagingSeed/workUnitQueueDefinitions.json";

const REPO = resolve(__dirname, "../../..");
const COMMITTED_SEED = resolve(REPO, "supabase/seed/firefly_staging_seed.sql");
const COMMITTED_VERIFY = resolve(REPO, "supabase/seed/firefly_staging_verify.sql");
const REPRESENTATIVE_SEED = resolve(REPO, "supabase/seed/local_representative_seed.sql");

const STAGING_URL = `postgresql://postgres:secret@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres`;
const STAGING_POOLER_URL = `postgresql://postgres.${STAGING_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

describe("repeatable", () => {
    it("renders byte-identical SQL every time", () => {
        expect(renderFireflyStagingSeedSql()).toBe(renderFireflyStagingSeedSql());
        expect(renderFireflyStagingVerifySql()).toBe(renderFireflyStagingVerifySql());
    });

    it("the committed seed and verification files are exactly the renderer's output", () => {
        // A hand edit, or a dataset change without `npm run staging:seed:firefly -- render`, fails here.
        expect(readFileSync(COMMITTED_SEED, "utf8")).toBe(renderFireflyStagingSeedSql());
        expect(readFileSync(COMMITTED_VERIFY, "utf8")).toBe(renderFireflyStagingVerifySql());
    });

    it("writes only upserts with fixed values, so a re-run converges instead of duplicating", () => {
        const sql = renderFireflyStagingSeedSql();
        const inserts = sql.match(/\bINSERT INTO public\.[a-z_]+/g) ?? [];
        const conflicts = sql.match(/\bON CONFLICT\b/g) ?? [];
        expect(inserts.length).toBeGreaterThan(10);
        expect(conflicts.length).toBe(inserts.length);
        expect(sql).not.toMatch(/\bnow\(\)|gen_random_uuid|current_date|random\(/);
    });

    it("every id is unique and inside the seed namespace", () => {
        const ids = [...renderFireflyStagingSeedSql().matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((m) => m[1]);
        const seeded = ids.filter((id) => id !== LIVE_FIREFLY_ORG_ID);
        expect(seeded.every((id) => id.startsWith(SEED_ID_PREFIX))).toBe(true);
        expect(() => seedId("customer", 0)).toThrow();
        // Each row's own id (the first value of a VALUES tuple) appears as a row id once.
        const rowIds = [...renderFireflyStagingSeedSql().matchAll(/^\s+\('([0-9a-f-]{36})'::uuid/gm)].map((m) => m[1]);
        expect(new Set(rowIds).size).toBe(rowIds.length);
    });

    it("no clock: every date is anchored to SEED_ANCHOR_DATE", () => {
        expect(SEED_ANCHOR_DATE).toBe("2026-11-02");
        for (const f of buildSeedFamilies()) {
            expect(f.inquired_at.slice(0, 10) <= SEED_ANCHOR_DATE).toBe(true);
            expect(f.last_activity_at.slice(0, 10) <= SEED_ANCHOR_DATE).toBe(true);
        }
    });
});

describe("no unintended writes outside the designated target", () => {
    const sql = renderFireflyStagingSeedSql();

    it("the rendered script passes its own audit", () => {
        const audit = auditFireflyStagingSeedSql(sql);
        expect(audit.failures).toEqual([]);
        expect(new Set(audit.insertTargets.map((t) => t.replace("public.", "")))).toEqual(new Set(SEED_WRITE_SET));
    });

    it("writes no identity: no auth row, no membership, no access profile (E3 owns those)", () => {
        expect(sql).not.toMatch(/INSERT INTO (auth\.|public\.user_roles|public\.user_access_profiles)/);
    });

    it("carries the fence over public, auth and storage, around every write, inside one transaction", () => {
        expect(sql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ;");
        expect(sql).toContain("n.nspname IN ('public', 'auth', 'storage')");
        expect(sql).toMatch(/age\(xmin\) <= 0/);
        expect(sql).toMatch(/RAISE EXCEPTION 'firefly_staging_seed: FENCE/);
        expect(sql.indexOf("$fence_open$")).toBeLessThan(sql.indexOf("INSERT INTO public.orgs"));
        expect(sql.lastIndexOf("INSERT INTO public.")).toBeLessThan(sql.indexOf("$fence_close$"));
        expect(sql.indexOf("$fence_close$")).toBeLessThan(sql.indexOf("COMMIT;"));
    });

    it("refuses to run without a seed_target, and refuses a local target that holds live Firefly", () => {
        expect(sql).toMatch(/\\if :\{\?seed_target\}\n\\else\nDO \$refuse\$/);
        expect(sql).toContain(`v_target = 'local' AND EXISTS (SELECT 1 FROM public.orgs WHERE id = '${LIVE_FIREFLY_ORG_ID}'::uuid)`);
    });

    it.each([
        ["a DELETE", "DELETE FROM public.opportunities WHERE true;"],
        ["an auth write", "INSERT INTO auth.users (id) VALUES ('f17e0000-0000-4000-8000-000000000002'::uuid);"],
        ["a table outside the write set", "INSERT INTO public.user_roles (user_id) VALUES ('f17e0000-0000-4000-8000-000000000002'::uuid);"],
        ["a foreign org id", "SELECT '4acc9386-c485-486f-aa1f-05d83499d142'::uuid;"],
        ["a second live-Firefly mention", `SELECT '${LIVE_FIREFLY_ORG_ID}'::uuid;`],
        ["the production ref", `-- ${PRODUCTION_PROJECT_REF}`],
        ["a clock value", "SELECT now();"],
        ["a bare UPDATE", "UPDATE public.opportunities SET stage_key = 'lead';"],
        ["a psql include", "\\ir ../migrations/x.sql"],
        ["a real-looking email", "SELECT 'someone@gmail.com';"],
    ])("the audit refuses %s", (_label, injected) => {
        const tampered = sql.replace("COMMIT;", `${injected}\nCOMMIT;`);
        expect(auditFireflyStagingSeedSql(tampered).ok).toBe(false);
    });

    it("the audit refuses a write after the fence has closed", () => {
        const tampered = sql.replace(
            "COMMIT;",
            "INSERT INTO public.orgs (id) VALUES ('f17e0000-0000-4000-8000-000000000001'::uuid) ON CONFLICT DO NOTHING;\nCOMMIT;",
        );
        expect(auditFireflyStagingSeedSql(tampered).failures.join()).toMatch(/order must be/);
    });
});

describe("designated targets", () => {
    it("local defaults to the shared stack on loopback", () => {
        const r = resolveSeedTarget({ target: "local", databaseUrl: null });
        expect(r).toMatchObject({ ok: true, target: "local", databaseUrl: LOCAL_STACK_DEFAULT_DATABASE_URL });
    });

    it.each([
        ["no target", { target: null, databaseUrl: null }, "target_required"],
        ["an unknown target", { target: "production", databaseUrl: null }, "unknown_target"],
        ["local pointed at a remote host", { target: "local", databaseUrl: STAGING_URL }, "local_not_loopback"],
        ["production by ref, even as local", { target: "local", databaseUrl: `postgresql://x@127.0.0.1/${PRODUCTION_PROJECT_REF}` }, "production_refused"],
        ["production as staging", { target: "staging", databaseUrl: `postgresql://postgres:x@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`, alloyEnvironment: "staging", confirmProjectRef: STAGING_PROJECT_REF }, "production_refused"],
        ["staging without a URL", { target: "staging", databaseUrl: null }, "database_url_required"],
        ["staging pointed at another project", { target: "staging", databaseUrl: "postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", alloyEnvironment: "staging", confirmProjectRef: STAGING_PROJECT_REF }, "wrong_project"],
        ["staging pointed at loopback", { target: "staging", databaseUrl: LOCAL_STACK_DEFAULT_DATABASE_URL, alloyEnvironment: "staging", confirmProjectRef: STAGING_PROJECT_REF }, "wrong_project"],
        ["staging without ALLOY_ENVIRONMENT", { target: "staging", databaseUrl: STAGING_URL, confirmProjectRef: STAGING_PROJECT_REF }, "environment_not_declared"],
        ["staging declared production", { target: "staging", databaseUrl: STAGING_URL, alloyEnvironment: "production", confirmProjectRef: STAGING_PROJECT_REF }, "environment_not_declared"],
        ["staging without the re-typed ref", { target: "staging", databaseUrl: STAGING_URL, alloyEnvironment: "staging" }, "confirmation_required"],
        ["a non-postgres URL", { target: "local", databaseUrl: "http://127.0.0.1:54422" }, "database_url_malformed"],
    ])("refuses %s", (_label, req, code) => {
        const r = resolveSeedTarget(req);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe(code);
    });

    it.each([
        ["direct", STAGING_URL],
        ["pooler", STAGING_POOLER_URL],
    ])("admits staging only fully declared (%s connection)", (_label, databaseUrl) => {
        const r = resolveSeedTarget({ target: "staging", databaseUrl, alloyEnvironment: "staging", confirmProjectRef: STAGING_PROJECT_REF });
        expect(r).toMatchObject({ ok: true, target: "staging", projectRef: STAGING_PROJECT_REF });
    });

    it("never prints a password", () => {
        expect(redactDatabaseUrl(STAGING_URL)).not.toContain("secret");
    });
});

describe("realistic, known data", () => {
    const families = buildSeedFamilies();
    const children = families.flatMap((f) => f.children);
    const guardians = families.flatMap((f) => f.guardians);

    it("mirrors Firefly's current configuration: 3 campuses, 17 rooms, its programs and rate card", () => {
        expect(SEED_SITES.map((s) => s.label)).toEqual(["North Campus", "South Campus", "West Campus"]);
        expect(SEED_ROOMS).toHaveLength(17);
        expect(SEED_ROOMS.reduce((n, r) => n + r.capacity, 0)).toBe(159); // North 75 · South 50 · West 34
        expect(SEED_PROGRAM_CATEGORIES.filter((c) => c.key === "kindergarten").map((c) => c.site)).toEqual(["north"]);
        const infantFive = SEED_VARIANTS.find((v) => SEED_OFFERINGS[v.offering - 1].program_key === "infant" && v.days === 5);
        expect(infantFive?.rate_cents).toBe(185000);
    });

    it("every person is a controlled test recipient under the ALY-14 staging guard", () => {
        for (const g of guardians) {
            expect(isControlledTestEmail(g.email), g.email).toBe(true);
            expect(isControlledTestPhone(g.phone), g.phone).toBe(true);
        }
        expect(new Set(guardians.map((g) => g.email)).size).toBe(guardians.length);
        expect(new Set(guardians.map((g) => g.phone)).size).toBe(guardians.length);
    });

    it("every child's age matches their program, and the program is offered at their campus", () => {
        const months = (dob: string) => {
            const [y, m, d] = dob.split("-").map(Number);
            const [ay, am, ad] = SEED_ANCHOR_DATE.split("-").map(Number);
            return (ay - y) * 12 + (am - m) - (ad < d ? 1 : 0);
        };
        const band: Record<string, [number, number]> = {
            infant: [2, 15], toddler: [14, 35], preschool: [35, 48], pre_k: [47, 60], kindergarten: [59, 72], school_age: [71, 120],
        };
        for (const c of children) {
            const [lo, hi] = band[c.program];
            expect(months(c.dob), `${c.first_name} ${c.last_name} (${c.program})`).toBeGreaterThanOrEqual(lo);
            expect(months(c.dob)).toBeLessThanOrEqual(hi);
            expect(SEED_PROGRAM_CATEGORIES.some((p) => p.site === c.site && p.key === c.program)).toBe(true);
        }
    });

    it("spans the whole journey with a working school's shape", () => {
        const c = expectedSeedCounts();
        expect(c.customers).toBe(60);
        expect(Object.keys(c.opportunities_by_stage).sort()).toEqual(
            ["closed", "closed_withdrawn", "decision", "enrolled", "enrolling", "lead", "tour", "waitlist"],
        );
        expect(families.some((f) => f.children.length === 2)).toBe(true);
        expect(families.some((f) => f.guardians.length === 1)).toBe(true);
        expect(families.filter((f) => f.stage === "tour").every((f) => f.tour_date! > SEED_ANCHOR_DATE)).toBe(true);
        expect(families.filter((f) => f.status === "closed").every((f) => f.close_reason_key)).toBe(true);
    });

    it("names its known records", () => {
        expect(families[0]).toMatchObject({ surname: "Alder", stage: "lead", status: "open", site: "north" });
        expect(new Set(families.map((f) => f.surname)).size).toBe(families.length);
    });
});

describe("the business process is the platform's own, and publishable", () => {
    const builder = buildSeedLifecycleBuilder();

    it("publishes with no blocking errors", () => {
        const result = validateBusinessProcessForPublish(builder);
        expect(result.errors.map((e) => e.message)).toEqual([]);
    });

    it("round-trips through the builder parser with fixed stage ids", () => {
        const parsed = parseLifecycleBuilderV1(JSON.parse(JSON.stringify(builder)))!;
        const process = activeLifecycleProcess(parsed)!;
        expect(process.id).toBe(buildSeedLifecycleBuilder().processes[0].id);
        expect(process.stages.every((s) => s.id.startsWith(SEED_ID_PREFIX))).toBe(true);
        expect(process.work_views_v1?.map((v) => v.id)).toEqual(["new_leads", "tours", "follow_up", "all_work"]);
    });

    it("every stage a seeded family sits in is a configured stage", () => {
        const keys = new Set(builder.processes[0].stages.map((s) => s.key));
        for (const f of buildSeedFamilies()) expect(keys, f.stage).toContain(f.stage);
        for (const stage of Object.values(builder.processes[0].entry_points_v1!.by_intent)) expect(keys).toContain(stage);
    });

    it("work-unit queue definitions load, and are the representative seed's verbatim", () => {
        const representative = readFileSync(REPRESENTATIVE_SEED, "utf8");
        const section = representative.slice(representative.indexOf("== Section 6"), representative.indexOf("== Section 7"));
        const docs = [...section.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
        const queueDocs = docs.filter((d) => d.version === 2);
        expect(Object.values(WORK_UNIT_QUEUE_DEFINITIONS)).toEqual(queueDocs);
        for (const def of Object.values(WORK_UNIT_QUEUE_DEFINITIONS)) expect(() => loadQueueDefinitionBundle(def)).not.toThrow();
    });
});

describe("verification census", () => {
    it("is read-only", () => {
        const sql = renderFireflyStagingVerifySql();
        expect(sql).toContain("BEGIN READ ONLY;");
        expect(sql).toContain("ROLLBACK;");
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    });

    it("derives every expectation from the dataset", () => {
        const checks = Object.fromEntries(buildVerificationChecks().map((c) => [c.name, String(c.expected)]));
        const counts = expectedSeedCounts();
        expect(checks.households).toBe(String(counts.customers));
        expect(checks.children).toBe(String(counts.children));
        expect(checks.stage_lead).toBe(String(counts.opportunities_by_stage.lead));
        expect(checks.seed_ids_outside_seed_org).toBe("0");
        expect(checks.known_registration_fee_cents).toBe("7500");
    });

    it("parses psql's unaligned output", () => {
        const out = "check|households|60|60|PASS\ncheck|children|75|74|FAIL\nfingerprint|abc123\n";
        expect(parseVerificationOutput(out)).toEqual([
            { kind: "check", name: "households", expected: "60", actual: "60", pass: true },
            { kind: "check", name: "children", expected: "75", actual: "74", pass: false },
            { kind: "fingerprint", value: "abc123" },
        ]);
    });

    it("judges only the seed org", () => {
        expect(renderFireflyStagingVerifySql()).toContain(`'${SEED_ORG_ID}'::uuid`);
    });
});

describe("isolation from the ZZ Alloy QA fixtures", () => {
    const sql = renderFireflyStagingSeedSql();
    const verify = renderFireflyStagingVerifySql();
    const zzIds = [
        ...Object.values(QA_ORGS).map((o) => o.id),
        ...Object.values(QA_STRUCTURE.departments).map((d) => d.id),
        ...Object.values(QA_STRUCTURE.sites).map((s) => s.id),
    ];

    it("the seed and its census name no ZZ org, site, department or QA identity", () => {
        for (const text of [sql, verify]) {
            for (const id of zzIds) expect(text).not.toContain(id);
            for (const o of Object.values(QA_ORGS)) {
                expect(text).not.toContain(o.slug);
                expect(text).not.toContain(o.name);
            }
            for (const i of Object.values(QA_IDENTITIES)) expect(text).not.toContain(i.email);
            expect(text).not.toMatch(/\bZZ\b|zz-alloy-qa/i);
        }
    });

    it("the staging school is a third, distinct org: not a QA org, not the forbidden live tenant", () => {
        expect(zzIds).not.toContain(SEED_ORG_ID);
        expect(FORBIDDEN_QA_ORG_IDS).not.toContain(SEED_ORG_ID);
        expect(Object.values(QA_ORGS).map((o) => o.slug)).not.toContain(SEED_ORG_SLUG);
        expect(SEED_ORG_NAME).toMatch(/\(Staging\)$/);
        for (const id of zzIds) expect(id.startsWith(SEED_ID_PREFIX)).toBe(false);
    });

    it("the seed creates exactly one org", () => {
        expect(sql.match(/INSERT INTO public\.orgs\b/g)).toHaveLength(1);
        expect(sql).toContain(`'${SEED_ORG_ID}'::uuid, '${SEED_ORG_NAME}', '${SEED_ORG_SLUG}'`);
    });
});

describe("the in-database proof (npm run staging:seed:firefly:prove)", () => {
    it.each([
        ["unset", ""],
        ["the shared stack's own database", LOCAL_STACK_DEFAULT_DATABASE_URL],
        ["staging", STAGING_URL],
        ["a non-loopback host", "postgresql://postgres:postgres@10.0.0.5:5432/firefly_seed_scratch"],
        ["a differently named local database", "postgresql://postgres:postgres@127.0.0.1:54422/scratch_firefly"],
        ["not postgres", "mysql://root@127.0.0.1/firefly_seed_scratch"],
    ])("refuses %s", (_label, url) => {
        expect(scratchProofRefusal(url)).not.toBeNull();
    });

    it("accepts a loopback firefly_seed_scratch* database", () => {
        expect(scratchProofRefusal("postgresql://postgres:postgres@127.0.0.1:54422/firefly_seed_scratch")).toBeNull();
        expect(scratchProofRefusal("postgresql://postgres:postgres@localhost:54422/firefly_seed_scratch_2")).toBeNull();
    });

    it("plants the ZZ fixtures by their real registry ids, without overwriting existing ones", () => {
        const plant = plantZzFixturesSql();
        expect(ZZ_QA_ORGS.map((o) => o.id)).toEqual([QA_ORGS.qa_shared.id, QA_ORGS.qa_secondary.id]);
        for (const id of zzIds()) expect(plant).toContain(id);
        expect(plant.match(/ON CONFLICT \(id\) DO NOTHING/g)).toHaveLength(2);
        expect(plant).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
    });

    it("snapshots every given org-scoped table for the ZZ orgs, and refuses an odd table name", () => {
        const snap = zzSnapshotSql(["customers", "locations"]);
        expect(snap).toContain('FROM public."customers" x WHERE x.org_id IN');
        expect(snap).toContain(QA_ORGS.qa_secondary.id);
        expect(() => zzSnapshotSql(['x"; DROP TABLE orgs; --'])).toThrow();
    });

    it("counts every row in the seed org, against expectations derived from the dataset", () => {
        const c = expectedSeedCounts();
        const byName = Object.fromEntries(scratchCountChecks().map((k) => [k.name, k.expected]));
        expect(byName.customers).toBe(c.customers);
        expect(byName.customer_members).toBe(c.children);
        expect(byName.opportunity_customer_members).toBe(c.opportunity_children);
        for (const [stage, n] of Object.entries(c.opportunities_by_stage)) expect(byName[`opportunities_stage_${stage}`]).toBe(n);
        // Table counts judge every row in the org, not only seed ids, so a duplicate cannot hide.
        for (const k of scratchCountChecks().filter((k) => k.name !== "orgs_in_seed_namespace_or_slug")) {
            expect(k.sql).not.toContain("id::text LIKE");
        }
        expect(scratchRelationshipChecks().every((k) => k.expected === 0)).toBe(true);
    });

    it("the drift edit only ever touches a seeded row", () => {
        expect(() => driftEditSql(QA_ORGS.qa_shared.id)).toThrow();
        expect(driftEditSql(seedId("customer", 1))).toContain(`org_id = '${SEED_ORG_ID}'::uuid`);
    });

    function zzIds(): string[] {
        return [...Object.values(QA_ORGS).map((o) => o.id), ...Object.values(QA_STRUCTURE.sites).map((s) => s.id)];
    }
});
