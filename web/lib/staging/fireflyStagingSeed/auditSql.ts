/**
 * Firefly staging seed — static audit of the rendered script (ALY-14 E2).
 *
 * The in-database fence (renderSql.ts) is the proof that a run wrote nothing outside the seed org.
 * This audit is the cheap, offline half: it refuses a script whose TEXT could not be safe, before
 * anything connects. The CLI runs it before every apply, and the tests run it on every render.
 */

import { PRODUCTION_PROJECT_REF } from "./targets";
import { LIVE_FIREFLY_ORG_ID, SEED_ID_PREFIX } from "./ids";

/** The only tables the seed may write. Anything else is a refusal. */
export const SEED_WRITE_SET = Object.freeze([
    "orgs",
    "customer_person_role_types",
    "departments",
    "work_units",
    "locations",
    "location_program_categories",
    "program_offerings",
    "program_offering_variants",
    "commercial_tuition_rates",
    "financial_charge_templates",
    "customers",
    "persons",
    "customer_persons",
    "customer_members",
    "person_child_relationships",
    "opportunities",
    "opportunity_persons",
    "opportunity_customer_members",
] as const);

export type SeedSqlAudit = { ok: boolean; failures: string[]; insertTargets: string[] };

/** Strip line comments and dollar-quoted JSON bodies, which are data, not statements. */
function executableText(sql: string): string {
    return sql
        .replace(/\$json\$[\s\S]*?\$json\$/g, "'<json>'")
        .split(/\r?\n/)
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n");
}

export function auditFireflyStagingSeedSql(sql: string): SeedSqlAudit {
    const failures: string[] = [];
    const text = executableText(sql);

    const insertTargets = [...text.matchAll(/\bINSERT\s+INTO\s+([a-z_]+)\.([a-z_]+)/gi)].map((m) => `${m[1]}.${m[2]}`);
    for (const target of insertTargets) {
        const [schema, table] = target.split(".");
        if (schema !== "public" || !(SEED_WRITE_SET as readonly string[]).includes(table)) {
            failures.push(`writes ${target}, which is outside the seed's write set`);
        }
    }
    // The fence's own bookkeeping row goes to a TEMP table referenced unqualified.
    for (const m of text.matchAll(/\bINSERT\s+INTO\s+([a-z_]+)\s/gi)) {
        if (m[1] !== "firefly_seed_fence") failures.push(`unqualified INSERT INTO ${m[1]}`);
    }

    for (const [label, re] of [
        ["DELETE", /\bDELETE\s+FROM\b/i],
        ["TRUNCATE", /\bTRUNCATE\b/i],
        ["DROP", /\bDROP\s+(TABLE|SCHEMA|FUNCTION|TRIGGER|INDEX|VIEW|POLICY)\b/i],
        ["ALTER", /\bALTER\s+(TABLE|ROLE|SCHEMA|FUNCTION|DATABASE|SYSTEM)\b/i],
        ["CREATE (non-temp)", /\bCREATE\s+(?!TEMP\s)(OR\s+REPLACE\s+)?(TABLE|FUNCTION|TRIGGER|INDEX|VIEW|POLICY|SCHEMA|ROLE|EXTENSION)\b/i],
        ["GRANT/REVOKE", /\b(GRANT|REVOKE)\b/i],
        ["COPY", /\bCOPY\b/i],
        ["bare UPDATE", /(^|;)\s*UPDATE\s+[a-z_.]+\s+SET\b/im],
        ["psql include", /^\s*\\(i|ir|include|include_relative|copy|!)\b/im],
        ["auth schema write", /\bINSERT\s+INTO\s+auth\./i],
        ["storage schema write", /\bINSERT\s+INTO\s+storage\./i],
        ["clock/random value", /\b(gen_random_uuid|uuid_generate_v4|random|clock_timestamp|statement_timestamp)\s*\(|\bnow\s*\(\)|\bcurrent_date\b|\bcurrent_timestamp\b/i],
    ] as const) {
        if (re.test(text)) failures.push(`contains ${label}`);
    }

    if (sql.toLowerCase().includes(PRODUCTION_PROJECT_REF)) failures.push("names the production project ref");

    // Every uuid literal is a seed id — except the live Firefly org, which may appear only in the
    // preflight refusal that checks a LOCAL target does not hold it.
    for (const m of text.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'::uuid/gi)) {
        const id = m[1].toLowerCase();
        if (id.startsWith(SEED_ID_PREFIX)) continue;
        if (id === LIVE_FIREFLY_ORG_ID) continue;
        failures.push(`uuid ${id} is outside the seed namespace`);
    }
    const liveMentions = text.split(LIVE_FIREFLY_ORG_ID).length - 1;
    const liveRefusal = new RegExp(`v_target = 'local' AND EXISTS \\(SELECT 1 FROM public\\.orgs WHERE id = '${LIVE_FIREFLY_ORG_ID}'::uuid\\)`);
    if (liveMentions !== 1 || !liveRefusal.test(text)) {
        failures.push(`the live Firefly org must appear exactly once, in the local-target refusal (found ${liveMentions})`);
    }

    const begin = text.search(/\bBEGIN ISOLATION LEVEL REPEATABLE READ;/);
    const fenceOpen = text.indexOf("$fence_open$");
    const firstWrite = text.search(/\bINSERT\s+INTO\s+public\./i);
    const fenceClose = text.indexOf("$fence_close$");
    const lastWrite = Math.max(...[...text.matchAll(/\bINSERT\s+INTO\s+public\./gi)].map((m) => m.index ?? -1));
    const commit = text.search(/\bCOMMIT;/);
    if ((text.match(/\bCOMMIT;/g) ?? []).length !== 1) failures.push("must COMMIT exactly once");
    if (!(begin >= 0 && begin < fenceOpen && fenceOpen < firstWrite && lastWrite < fenceClose && fenceClose < commit)) {
        failures.push("order must be BEGIN → fence open → writes → fence close → COMMIT");
    }
    if (!/\\if :\{\?seed_target\}/.test(text)) failures.push("does not refuse an unset seed_target");

    for (const m of sql.matchAll(/'([^'\s]+@[^'\s]+)'/g)) {
        if (!m[1].endsWith(".invalid")) failures.push(`email ${m[1]} is not on the reserved .invalid TLD`);
    }

    return { ok: failures.length === 0, failures, insertTargets };
}
