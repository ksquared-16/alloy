/**
 * Firefly staging seed — read-only verification census (ALY-14 E2).
 *
 * Runs in a READ ONLY transaction and prints one line per check:
 *
 *   check|<name>|<expected>|<actual>|PASS|FAIL
 *   fingerprint|<md5>
 *
 * Every expected value is derived from the dataset, never typed. The fingerprint hashes the business
 * columns of every seeded row (timestamps excluded — triggers own `updated_at`), so two runs of the
 * seed against one database must print the same fingerprint: that is the repeatability proof.
 *
 * Only seeded rows are inspected (`id` in the seed namespace). Rows an operator later creates inside
 * the staging school are theirs and are not judged here.
 */

import {
    buildSeedFamilies,
    expectedSeedCounts,
    SEED_CHARGE_TEMPLATES,
    SEED_ROOMS,
    seedIds,
} from "./dataset";
import { LIVE_FIREFLY_ORG_ID, SEED_DEPARTMENT_ID, SEED_ID_PREFIX, SEED_ORG_ID, SEED_ORG_SLUG } from "./ids";

const ORG = `'${SEED_ORG_ID}'::uuid`;
const SEEDED = `id::text LIKE '${SEED_ID_PREFIX}%'`;

type Check = { name: string; expected: string | number; actualSql: string };

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function countIn(table: string, where = ""): string {
    return `(SELECT count(*) FROM public.${table} WHERE org_id = ${ORG} AND ${SEEDED}${where ? ` AND ${where}` : ""})`;
}

export function buildVerificationChecks(): Check[] {
    const c = expectedSeedCounts();
    const families = buildSeedFamilies();
    const first = families[0];
    const siblings = families.find((f) => f.children.length === 2)!;
    const enrolled = families.find((f) => f.stage === "enrolled")!;
    const reg = SEED_CHARGE_TEMPLATES.find((t) => t.template_key === "registration_fee")!;
    const giraffe = SEED_ROOMS.find((r) => r.label === "Giraffe")!;

    const checks: Check[] = [
        { name: "org_present", expected: 1, actualSql: `(SELECT count(*) FROM public.orgs WHERE id = ${ORG} AND slug = ${q(SEED_ORG_SLUG)} AND status = 'active')` },
        { name: "live_firefly_untouched_by_seed_ids", expected: 0, actualSql: `(SELECT count(*) FROM public.opportunities WHERE org_id = '${LIVE_FIREFLY_ORG_ID}'::uuid AND ${SEEDED})` },
        { name: "seed_ids_outside_seed_org", expected: 0, actualSql: [
            "customers", "persons", "customer_members", "opportunities", "opportunity_customer_members", "locations",
        ].map((t) => `(SELECT count(*) FROM public.${t} WHERE org_id IS DISTINCT FROM ${ORG} AND ${SEEDED})`).join(" + ") },
        { name: "department_enrollment", expected: 1, actualSql: `(SELECT count(*) FROM public.departments WHERE id = '${SEED_DEPARTMENT_ID}'::uuid AND org_id = ${ORG} AND metadata ? 'lifecycle_builder_v1')` },
        { name: "work_units", expected: c.work_units, actualSql: countIn("work_units") },
        { name: "sites", expected: c.sites, actualSql: countIn("locations", "location_type = 'site'") },
        { name: "rooms", expected: c.rooms, actualSql: countIn("locations", "location_type = 'unit'") },
        { name: "program_categories", expected: c.program_categories, actualSql: countIn("location_program_categories") },
        { name: "program_offerings", expected: c.offerings, actualSql: countIn("program_offerings") },
        { name: "offering_variants", expected: c.variants, actualSql: countIn("program_offering_variants") },
        { name: "tuition_rates", expected: c.tuition_rates, actualSql: countIn("commercial_tuition_rates") },
        { name: "charge_templates", expected: c.charge_templates, actualSql: countIn("financial_charge_templates") },
        // By key: the role vocabulary may pre-exist under another id, and the seed leaves it be.
        { name: "role_type_keys", expected: c.role_types, actualSql: `(SELECT count(DISTINCT key) FROM public.customer_person_role_types WHERE org_id = ${ORG} AND key IN ('child','parent','guardian','emergency_contact','authorized_pickup','payer'))` },
        { name: "households", expected: c.customers, actualSql: countIn("customers") },
        { name: "guardians", expected: c.persons, actualSql: countIn("persons") },
        { name: "household_memberships", expected: c.customer_persons, actualSql: `(SELECT count(*) FROM public.customer_persons WHERE org_id = ${ORG} AND person_id::text LIKE '${SEED_ID_PREFIX}%')` },
        { name: "children", expected: c.children, actualSql: countIn("customer_members") },
        { name: "child_relationships", expected: c.child_relationships, actualSql: countIn("person_child_relationships") },
        { name: "family_cases", expected: c.opportunities, actualSql: countIn("opportunities") },
        { name: "case_contacts", expected: c.opportunity_persons, actualSql: `(SELECT count(*) FROM public.opportunity_persons WHERE org_id = ${ORG} AND opportunity_id::text LIKE '${SEED_ID_PREFIX}%')` },
        { name: "child_participations", expected: c.opportunity_children, actualSql: countIn("opportunity_customer_members") },
        ...Object.entries(c.opportunities_by_stage)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([stage, n]) => ({ name: `stage_${stage}`, expected: n, actualSql: countIn("opportunities", `stage_key = ${q(stage)}`) })),
        // Synthetic only: every seeded guardian is a reserved test recipient under the ALY-14 guard.
        { name: "guardian_email_not_reserved", expected: 0, actualSql: countIn("persons", `email NOT LIKE '%.invalid'`) },
        { name: "guardian_phone_not_fictional", expected: 0, actualSql: countIn("persons", `phone !~ '^\\+1[0-9]{3}55501[0-9]{2}$'`) },
        // Known records a test or a person can name.
        { name: "known_first_family", expected: `${first.surname} Family/${first.stage}/open`, actualSql: `(SELECT c.name || '/' || o.stage_key || '/' || o.status_key FROM public.opportunities o JOIN public.customers c ON c.id = o.customer_id WHERE o.id = '${seedIds.opportunity(first.n)}'::uuid)` },
        { name: "known_sibling_family_children", expected: 2, actualSql: `(SELECT count(*) FROM public.opportunity_customer_members WHERE opportunity_id = '${seedIds.opportunity(siblings.n)}'::uuid)` },
        { name: "known_enrolled_child_stage", expected: "enrolled/enrolled", actualSql: `(SELECT outcome_status_key || '/' || stage_key FROM public.opportunity_customer_members WHERE id = '${seedIds.opportunityChild(enrolled.children[0].n)}'::uuid)` },
        { name: "known_registration_fee_cents", expected: reg.amount_cents ?? 0, actualSql: `(SELECT amount_cents FROM public.financial_charge_templates WHERE id = '${seedIds.chargeTemplate(reg.n)}'::uuid)` },
        { name: "known_room_giraffe_capacity", expected: giraffe.capacity, actualSql: `(SELECT (metadata->>'capacity')::int FROM public.locations WHERE id = '${seedIds.room(giraffe.n)}'::uuid)` },
    ];
    return checks;
}

const FINGERPRINT_SQL = `(SELECT md5(string_agg(line, E'\\n' ORDER BY line)) FROM (
    SELECT 'org|' || id || '|' || name || '|' || slug || '|' || status FROM public.orgs WHERE id = ${ORG}
    UNION ALL SELECT 'dept|' || id || '|' || key || '|' || md5(metadata::text) FROM public.departments WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'wu|' || id || '|' || key || '|' || md5(queue_definition::text) || '|' || md5(metadata::text) FROM public.work_units WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'loc|' || id || '|' || label || '|' || location_type || '|' || coalesce(parent_location_id::text, '') || '|' || md5(metadata::text) FROM public.locations WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'lpc|' || id || '|' || location_id || '|' || key FROM public.location_program_categories WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'off|' || id || '|' || program_key || '|' || label || '|' || attendance_type FROM public.program_offerings WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'var|' || id || '|' || offering_id || '|' || quantity_value FROM public.program_offering_variants WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'rate|' || id || '|' || variant_id || '|' || rate_cents || '|' || cadence_key FROM public.commercial_tuition_rates WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'fee|' || id || '|' || template_key || '|' || coalesce(amount_cents::text, '') FROM public.financial_charge_templates WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'cust|' || id || '|' || name FROM public.customers WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'per|' || id || '|' || first_name || '|' || last_name || '|' || email || '|' || phone FROM public.persons WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'kid|' || id || '|' || customer_id || '|' || display_name || '|' || dob FROM public.customer_members WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'opp|' || id || '|' || status_key || '|' || stage_key || '|' || coalesce(close_reason_key, '') || '|' || work_unit_id || '|' || md5(metadata::text) FROM public.opportunities WHERE org_id = ${ORG} AND ${SEEDED}
    UNION ALL SELECT 'ocm|' || id || '|' || coalesce(outcome_status_key, '') || '|' || coalesce(stage_key, '') || '|' || coalesce(program_category_id::text, '') || '|' || start_date FROM public.opportunity_customer_members WHERE org_id = ${ORG} AND ${SEEDED}
) seeded(line))`;

export function renderFireflyStagingVerifySql(): string {
    const checks = buildVerificationChecks();
    const values = checks
        .map((c) => `    (${q(c.name)}, ${q(String(c.expected))}, (${c.actualSql})::text)`)
        .join(",\n");
    return `-- =============================================================================
-- Alloy — Firefly staging seed verification (READ ONLY) — ALY-14 E2
-- GENERATED by web/lib/staging/fireflyStagingSeed/verifySql.ts. Do not edit by hand.
-- Output: check|<name>|<expected>|<actual>|PASS|FAIL, then fingerprint|<md5>.
-- =============================================================================
\\set ON_ERROR_STOP on
\\pset format unaligned
\\pset tuples_only on
\\pset fieldsep '|'

BEGIN READ ONLY;

SELECT 'check', name, expected, coalesce(actual, '<null>'), CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES
${values}
) AS checks(name, expected, actual);

SELECT 'fingerprint', coalesce(${FINGERPRINT_SQL}, '<empty>');

ROLLBACK;
`;
}

export type VerificationLine =
    | { kind: "check"; name: string; expected: string; actual: string; pass: boolean }
    | { kind: "fingerprint"; value: string };

export function parseVerificationOutput(stdout: string): VerificationLine[] {
    const out: VerificationLine[] = [];
    for (const raw of stdout.split(/\r?\n/)) {
        const parts = raw.split("|");
        if (parts[0] === "check" && parts.length >= 5) {
            out.push({ kind: "check", name: parts[1], expected: parts[2], actual: parts.slice(3, -1).join("|"), pass: parts[parts.length - 1] === "PASS" });
        } else if (parts[0] === "fingerprint" && parts.length === 2) {
            out.push({ kind: "fingerprint", value: parts[1] });
        }
    }
    return out;
}
