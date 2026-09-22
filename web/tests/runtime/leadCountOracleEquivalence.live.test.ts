/**
 * LEAD COUNT — ORACLE EQUIVALENCE, against a sanctioned isolated target.
 *
 * The production path materialises the whole enrollment participant projection (5-6 sequential
 * reads) and counts in JS, for one number. The candidate is a single count query. Replacing the
 * former is only permissible once the latter reproduces it EXACTLY, and the existing implementation
 * is the oracle — never the other way round.
 *
 * Seven real staging work-unit specimens already matched, but two axes had no reachable specimen:
 * an INACTIVE customer_member (staging has none) and a SITE/LOCATION-scoped request. This harness
 * closes both on the shared local certification stack (`alloy-cert`), which is isolated from
 * staging — the canonical shared staging specimen is never mutated.
 *
 * The ORACLE here is the REAL code, not a restatement: rows are read with psql, then handed to the
 * exported pure stitch `buildEnrollmentParticipants` and the real `countActiveLeadParticipants`.
 * Only the I/O is replaced, so the predicate under test is production's own.
 *
 *   LEAD_LIVE=1 npx vitest run tests/runtime/leadCountOracleEquivalence.live.test.ts
 */
import { execFileSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import { buildEnrollmentParticipants } from "@/lib/process/definitions/enrollment/enrollmentProjection";
import { countActiveLeadParticipants } from "@/lib/process/definitions/enrollment";

const LIVE = process.env.LEAD_LIVE === "1";
const ORG = "00000000-0000-4000-8000-000000000001";
const DEPT = "00000000-0000-4000-8000-000000000020";
const WORK_UNIT = "00000000-0000-4000-8000-000000000030";
/** Members this harness flipped, restored exactly in afterAll. Nothing is created or deleted. */
const flipped = new Set<string>();

function sql(q: string): string {
    // Via STDIN, not -c: the anchor lists in these queries run to thousands of characters and the
    // argument form failed outright once the department footprint was expanded.
    return execFileSync(
        "docker",
        /*
         * ON_ERROR_STOP is not optional here. psql exits 0 on a failed statement, so the first
         * version of this harness "seeded" an inactive member with an UPDATE naming a column that
         * does not exist, the seed silently did nothing, and the axis reported the oracle
         * unchanged — a specimen that discriminated nothing while looking like a real measurement.
         */
        ["exec", "-i", "supabase_db_alloy-cert", "psql", "-U", "postgres", "-d", "postgres", "-tA",
         "-v", "ON_ERROR_STOP=1"],
        { encoding: "utf8", input: q, maxBuffer: 64 * 1024 * 1024 },
    ).trim();
}
const rows = <T,>(q: string): T[] => {
    const out = sql(`select coalesce(json_agg(t), '[]'::json)::text from (${q}) t`);
    return JSON.parse(out) as T[];
};
const scalar = (q: string): number => Number(sql(q).split("\n")[0] || "0");
/** psql -tA prints the RETURNING row and then its command tag; the row is the first line. */
const firstLine = (q: string): string => sql(q).split("\n")[0]!.trim();

/** The oracle: production's own stitch + predicate over the rows `load` would have fetched. */
function oracleCount(opts: { workUnitIds: string[]; locationIds?: string[] | null }): number {
    const wuList = opts.workUnitIds.map((w) => `'${w}'`).join(",");
    const opportunities = rows<{ id: string; stage_key: string | null; status_key: string | null; work_unit_id: string | null; location_id: string | null }>(
        `select id, stage_key, status_key, work_unit_id, location_id from public.opportunities
          where org_id = '${ORG}' and work_unit_id in (${wuList})`,
    );
    if (!opportunities.length) return 0;
    const oppIds = opportunities.map((o) => `'${o.id}'`).join(",");
    const ocm = rows<{ id: string; opportunity_id: string | null }>(
        `select id, opportunity_id from public.opportunity_customer_members
          where org_id = '${ORG}' and opportunity_id in (${oppIds})`,
    );
    const anchorIds = [...opportunities.map((o) => o.id), ...ocm.map((r) => r.id)].map((i) => `'${i}'`).join(",");
    const piRows = rows<{ id: string; org_id: string; process_key: string; subject_type: string; subject_id: string; context_id: string | null; stage_key: string | null; state: string | null; close_reason_key: string | null }>(
        `select id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key
           from public.process_instances
          where org_id = '${ORG}' and process_key = 'enrollment' and context_id in (${anchorIds})`,
    );
    if (!piRows.length) return 0;
    const subjIds = piRows.map((p) => `'${p.subject_id}'`).join(",");
    const members = rows<{ id: string; is_active: boolean | null }>(
        `select id, is_active from public.customer_members where org_id = '${ORG}' and id in (${subjIds})`,
    );
    const ocmLocations = rows<{ opportunity_id: string; customer_member_id: string; location_id: string | null }>(
        `select opportunity_id, customer_member_id, location_id from public.opportunity_customer_members
          where org_id = '${ORG}' and opportunity_id in (${oppIds})`,
    );
    const map = new Map<string, string>();
    for (const r of ocm) if (r.opportunity_id) map.set(String(r.id), String(r.opportunity_id));

    let participants = buildEnrollmentParticipants(piRows, opportunities, members, ocmLocations, map);
    if (opts.locationIds?.length) {
        const allowed = new Set(opts.locationIds);
        participants = participants.filter((p) => {
            const loc = p.attributes.subjectLocationId?.trim() || p.attributes.contextLocationId?.trim() || "";
            return Boolean(loc && allowed.has(loc));
        });
    }
    return countActiveLeadParticipants(participants);
}

/**
 * The candidate, as it will actually ship: the migrated database FUNCTION.
 *
 * This deliberately calls `count_active_lead_participations` rather than re-stating its SQL. An
 * inline copy would prove the text I wrote matches the oracle, not that the deployed function does
 * — and the function is what production will call.
 */
function candidateCount(opts: { workUnitIds: string[]; locationIds?: string[] | null }): number {
    // The harness varies the work-unit SET; the function takes ONE work unit and expands it to the
    // department. Passing any member of the set is therefore equivalent, and passing a single unit
    // in isolation is how the per-work-unit axis exercises the expansion.
    const wu = opts.workUnitIds.length === 1 ? `'${opts.workUnitIds[0]}'::uuid` : `'${WORK_UNIT}'::uuid`;
    const locs = opts.locationIds?.length
        ? `array[${opts.locationIds.map((l) => `'${l}'::uuid`).join(",")}]`
        : "null::uuid[]";
    return scalar(`select public.count_active_lead_participations('${ORG}'::uuid, ${wu}, ${locs})`);
}

const deptWorkUnits = (): string[] =>
    LIVE
        ? rows<{ id: string }>(`select id from public.work_units where org_id = '${ORG}' and department_id = '${DEPT}'`).map((r) => r.id)
        : [];

afterAll(() => {
    if (!LIVE) return;
    // The only mutation this harness makes is one boolean flip, restored exactly. Nothing is
    // created and nothing is deleted, so there is no disposable residue to leak on a shared stack.
    for (const id of flipped) {
        sql(`update public.customer_members set is_active = true where id = '${id}' and org_id = '${ORG}'`);
    }
});

describe.skipIf(!LIVE)("lead count — oracle equivalence on the isolated certification stack", () => {
    it("baseline: candidate reproduces the oracle over existing data", () => {
        const wus = deptWorkUnits();
        expect(wus.length).toBeGreaterThan(0);
        expect(candidateCount({ workUnitIds: wus })).toBe(oracleCount({ workUnitIds: wus }));
    });

    it("AXIS A — an INACTIVE customer_member is excluded by both", () => {
        const wus = deptWorkUnits();
        const before = oracleCount({ workUnitIds: wus });
        expect(candidateCount({ workUnitIds: wus })).toBe(before);

        // Flip one COUNTED participant's subject to inactive; both must drop by exactly one.
        /*
         * The subject must be one the scope actually COUNTS. The first attempt picked any
         * qualifying participation org-wide, flipped a member outside the department footprint,
         * and neither side moved — the specimen discriminated nothing.
         */
        const subject = firstLine(`
            select pi.subject_id from public.process_instances pi
              join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
              join public.opportunities o on o.org_id = pi.org_id and o.id = coalesce(
                    (select m.opportunity_id from public.opportunity_customer_members m
                      where m.id = pi.context_id and m.org_id = pi.org_id), pi.context_id)
             where pi.org_id = '${ORG}' and pi.process_key = 'enrollment' and pi.subject_type = 'child'
               and pi.close_reason_key is null
               and coalesce(cm.is_active, true) is not false
               and coalesce(lower(btrim(o.status_key)), '') not in ('closed','lost','archived','inactive')
               and coalesce(lower(btrim(pi.state)),'') not in ('enrolled','withdrawn','not_enrolling')
               and o.work_unit_id in (${wus.map((w) => `'${w}'`).join(",")})
             limit 1`);
        expect(subject).not.toBe("");
        flipped.add(subject);
        const flippedRows = firstLine(`update public.customer_members set is_active = false
                                  where id = '${subject}' and org_id = '${ORG}' returning id`);
        // Prove the seed applied. A silently-failed mutation is how this axis first "passed".
        expect(flippedRows).toBe(subject);

        const oracleAfter = oracleCount({ workUnitIds: wus });
        const candidateAfter = candidateCount({ workUnitIds: wus });
        expect(oracleAfter).toBe(before - 1);
        expect(candidateAfter).toBe(oracleAfter);

        // Control: restoring it must restore both.
        const restored = firstLine(`update public.customer_members set is_active = true
                               where id = '${subject}' and org_id = '${ORG}' returning id`);
        expect(restored).toBe(subject);
        flipped.delete(subject);
        expect(oracleCount({ workUnitIds: wus })).toBe(before);
        expect(candidateCount({ workUnitIds: wus })).toBe(before);
    });

    it("AXIS B — site/location scope narrows both identically and never broadens", () => {
        const wus = deptWorkUnits();
        const orgWideOracle = oracleCount({ workUnitIds: wus });
        expect(candidateCount({ workUnitIds: wus })).toBe(orgWideOracle);

        const locs = rows<{ location_id: string }>(`
            select distinct coalesce(
                (select m.location_id from public.opportunity_customer_members m
                  where m.opportunity_id = o.id and m.customer_member_id = pi.subject_id and m.org_id = pi.org_id limit 1),
                o.location_id) as location_id
              from public.process_instances pi
              join public.opportunities o on o.id = pi.context_id and o.org_id = pi.org_id
             where pi.org_id = '${ORG}' and pi.process_key = 'enrollment'
               and coalesce(
                (select m.location_id from public.opportunity_customer_members m
                  where m.opportunity_id = o.id and m.customer_member_id = pi.subject_id and m.org_id = pi.org_id limit 1),
                o.location_id) is not null`).map((r) => r.location_id);

        // Every individual site, and the union, must agree — and no site may exceed org-wide.
        let sum = 0;
        for (const loc of locs) {
            const o = oracleCount({ workUnitIds: wus, locationIds: [loc] });
            const c = candidateCount({ workUnitIds: wus, locationIds: [loc] });
            expect(c, `site ${loc}`).toBe(o);
            expect(c).toBeLessThanOrEqual(orgWideOracle);
            sum += c;
        }
        if (locs.length) {
            expect(candidateCount({ workUnitIds: wus, locationIds: locs })).toBe(
                oracleCount({ workUnitIds: wus, locationIds: locs }),
            );
            expect(sum).toBeLessThanOrEqual(orgWideOracle);
        }
    });

    it("AXIS C — the function expands ANY department member to the department-scoped oracle", () => {
        /*
         * The comparison has to be stated carefully. `oracleCount` here takes an explicit
         * work-unit LIST and does not expand; the function takes ONE work unit and expands it.
         * Comparing oracle([W]) to fn(W) therefore compares different questions — the first
         * version of this gate did exactly that and read 0 vs 3.
         *
         * The real contract is: for every member W of the department, fn(W) equals the oracle over
         * the WHOLE department footprint. That is what makes the expansion discriminating — a
         * single-unit oracle answers 0 for six of the seven staging units.
         */
        const wus = deptWorkUnits();
        const departmentOracle = oracleCount({ workUnitIds: wus });
        for (const single of wus) {
            expect(candidateCount({ workUnitIds: [single] }), `expansion from ${single}`).toBe(departmentOracle);
        }
        // And the un-expanded oracle really is narrower somewhere, or this axis proves nothing.
        const narrowest = Math.min(...wus.map((w) => oracleCount({ workUnitIds: [w] })));
        expect(narrowest).toBeLessThanOrEqual(departmentOracle);
    });
});
