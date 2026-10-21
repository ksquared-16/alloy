/**
 * BP V2 Slice 7 — LIVE: the /workspace tile's Work Items counts (`summarizeOperationalTaskCountsByDepartment`)
 * equal INDEPENDENT SQL over `operational_tasks` on the local certification stack, at org scope, under a
 * site restriction and under a workspace selection. Marked fixture tasks (deleted afterwards) cover open /
 * overdue / future, completed and canceled (excluded), an unlinked department task (org scope only), a
 * second department, and an unattributed task (never given to a process). Reads write nothing.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveTaskSummaryScope, summarizeOperationalTaskCountsByDepartment } from "@/lib/admin/operationalTasksService";
import { applyLandingWorkItems } from "@/lib/admin/landingWorkItems";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const ENROLLMENT_DEPT = "00000000-0000-4000-8000-000000000020";
const OTHER_DEPT = randomUUID();
const R = "00000000-0000-4000-8000-000000000010";
const L = "00000000-0000-4000-8000-000000000011";
const OPP_R = "00000000-0000-4000-8000-000050000030";
const OPP_L = "00000000-0000-4000-8000-000050000032";
const FIX = "bpv2_s7_fixture";

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString() };
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const n = (sql: string) => Number(psql(sql));

afterAll(async () => {
    if (!live) return;
    psql(`delete from operational_tasks where org_id='${ORG}' and metadata ? '${FIX}'`);
    evidence.fixtures_remaining = n(`select count(*) from operational_tasks where metadata ? '${FIX}'`);
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

/** Independent count: open (or overdue) tasks of a department, optionally only through opportunities at given sites. */
const sqlCount = (dept: string | null, overdue: boolean, sites: string[] | null) =>
    n(`select count(*) from operational_tasks t ${sites ? "join opportunities o on o.id=t.entity_id" : ""}
       where t.org_id='${ORG}' and t.status='open'
       and ${dept ? `t.metadata->>'department_id'='${dept}'` : "t.metadata->>'department_id' is null"}
       ${overdue ? "and t.due_at < now()" : ""}
       ${sites ? `and o.location_id in (${sites.map((s) => `'${s}'`).join(",")})` : ""}`);

describe.skipIf(!live)("live — S7: tile Work Items counts = independent SQL", () => {
    it("org scope, restricted sites and a selection; exclusions; unattributed apart; no writes", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const task = (dept: string | null, status: string, dueOffsetHours: number, opp: string | null) =>
            `('${randomUUID()}','${ORG}',${opp ? "'opportunities'" : "null"},${opp ? `'${opp}'` : "null"},'${ADMIN}','S7 fixture','${status}',
              now() + interval '${dueOffsetHours} hours', 'manual',
              jsonb_build_object('${FIX}', true${dept ? `, 'department_id', '${dept}'` : ""}))`;
        psql(`insert into operational_tasks (id, org_id, entity_type, entity_id, created_by, title, status, due_at, source, metadata) values
            ${[
                task(ENROLLMENT_DEPT, "open", -48, OPP_R),     // overdue, Riverside
                task(ENROLLMENT_DEPT, "open", 72, OPP_L),      // open, not overdue, Lakeside
                task(ENROLLMENT_DEPT, "open", -2, null),       // overdue, unlinked (org scope only)
                task(ENROLLMENT_DEPT, "completed", -48, OPP_R), // excluded
                task(ENROLLMENT_DEPT, "canceled", -48, OPP_R),  // excluded
                task(OTHER_DEPT, "open", -24, OPP_R),           // another department
                task(null, "open", -24, OPP_R),                 // unattributed
            ].join(",")}`);

        const fingerprint = () => psql(`select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by id), '')) from operational_tasks t where org_id='${ORG}'`);
        const before = fingerprint();

        const run = async (dims: Parameters<typeof resolveTaskSummaryScope>[0], selected: string | null) => {
            const scope = resolveTaskSummaryScope(dims, [ENROLLMENT_DEPT, OTHER_DEPT], selected);
            const r = await summarizeOperationalTaskCountsByDepartment({ supabase, orgId: ORG, ...scope });
            if (!r.ok) throw new Error(r.message);
            return { scope, r };
        };

        // Org scope.
        const all = await run({ siteScope: "all", departmentScope: "all" }, null);
        expect(all.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: sqlCount(ENROLLMENT_DEPT, false, null), overdue: sqlCount(ENROLLMENT_DEPT, true, null) });
        expect(all.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: 3, overdue: 2 }); // completed / canceled excluded; overdue ⊂ open
        expect(all.r.byDepartment[OTHER_DEPT]).toEqual({ open: 1, overdue: 1 });
        expect(all.r.unattributed?.open).toBe(sqlCount(null, false, null));

        // Restricted to Riverside: only tasks reached through a Riverside opportunity; unlinked tasks invisible.
        const rOnly = await run({ siteScope: "restricted", allowedSiteLocationIds: [R], departmentScope: "all" }, null);
        expect(rOnly.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: sqlCount(ENROLLMENT_DEPT, false, [R]), overdue: sqlCount(ENROLLMENT_DEPT, true, [R]) });
        expect(rOnly.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: 1, overdue: 1 });
        expect(rOnly.r.unattributed).toBeNull();

        // Workspace selection = Lakeside.
        const selL = await run({ siteScope: "all", departmentScope: "all" }, L);
        expect(selL.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: sqlCount(ENROLLMENT_DEPT, false, [L]), overdue: sqlCount(ENROLLMENT_DEPT, true, [L]) });
        expect(selL.r.byDepartment[ENROLLMENT_DEPT]).toEqual({ open: 1, overdue: 0 });

        // Department access: a restricted actor asking for a department outside access gets no answer for it.
        const deptRestricted = await run({ siteScope: "all", departmentScope: "restricted", allowedDepartmentIds: [ENROLLMENT_DEPT] }, null);
        expect(Object.keys(deptRestricted.r.byDepartment)).toEqual([ENROLLMENT_DEPT]);

        // The card states from the real answer.
        const cards = applyLandingWorkItems(
            [{ id: "enrollment", departmentId: ENROLLMENT_DEPT }, { id: "other", departmentId: OTHER_DEPT }],
            { ok: true, by_department: all.r.byDepartment },
        );
        expect(cards.map((c) => c.workItems)).toEqual([{ state: "ok", open: 3, overdue: 2 }, { state: "ok", open: 1, overdue: 1 }]);

        // Cost of the tile line: one summary read for three departments (the /workspace shape), timed warm.
        const timings: number[] = [];
        for (let i = 0; i < 6; i++) {
            const t0 = performance.now();
            await summarizeOperationalTaskCountsByDepartment({ supabase, orgId: ORG, departmentIds: [ENROLLMENT_DEPT, OTHER_DEPT, randomUUID()], siteIds: null });
            timings.push(Math.round(performance.now() - t0));
        }
        const sorted = [...timings.slice(1)].sort((a, b) => a - b);
        evidence.cost = { departments: 3, count_queries: 3 * 2 + 1, warm_ms: sorted, median_ms: sorted[Math.floor(sorted.length / 2)] };

        expect(fingerprint()).toBe(before); // reads wrote nothing
        evidence.org_scope = { enrollment: all.r.byDepartment[ENROLLMENT_DEPT], other_department: all.r.byDepartment[OTHER_DEPT], unattributed_open: all.r.unattributed?.open };
        evidence.restricted_riverside = rOnly.r.byDepartment[ENROLLMENT_DEPT];
        evidence.selected_lakeside = selL.r.byDepartment[ENROLLMENT_DEPT];
        evidence.department_restricted_keys = Object.keys(deptRestricted.r.byDepartment);
        evidence.independent_sql_agrees = true;
        evidence.reads_wrote_nothing = true;
    }, 120_000);
});
