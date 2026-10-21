/**
 * BP V2 Slice 4A — LIVE: assignment commands enforce the actor's SITE authority at the shared command
 * boundary (`runRegisteredAction`), whichever caller invokes them. Real execution through
 * `executeCommandInvocation` (the entry `/api/admin/actions/execute` uses) against the local
 * certification stack; refusals are proven by a fingerprint of every table the writers touch.
 *
 * Sites: Riverside (R) and Lakeside (L). Actors: unrestricted (ALL), restricted to R, restricted to L.
 * Fixtures (marked `bpv2_s4a_fixture`, deleted afterwards with every row the commands created): child
 * assignments at R, a child assignment at L (on a temporary L pattern), staff assignments at R.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { ExecuteCommandInvocationRequest } from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { authorizeActionSites } from "@/lib/adminV2/actions/actionExecutor";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const R = "00000000-0000-4000-8000-000000000010";
const L = "00000000-0000-4000-8000-000000000011";
const CHILD_R = "00000000-0000-4000-8000-000050000020"; // agreement …50000050 at R
const AGREEMENT_R = "00000000-0000-4000-8000-000050000050";
const CHILD_L = "00000000-0000-4000-8000-000070000055";
const AGREEMENT_L = "00000000-0000-4000-8000-000070000065";
const STAFF = "00000000-0000-4000-8000-000050000010";
const PATTERN_R = "00000000-0000-4000-8000-000050000040";
const TYPE_CHILD = "00000000-0000-4000-8000-000050000062";
const TYPE_STAFF = "00000000-0000-4000-8000-000050000061";
const ROOM_R = "00000000-0000-4000-8000-000000000012"; // Infant Room A — an operational group at R
const SRC_CHILD_ROW = "5d40ddc4-bb9d-47f9-b370-d5bad5520d4c";
const SRC_STAFF_ROW = "00000000-0000-4000-8000-000050000068";
const FIXTURE = "bpv2_s4a_fixture";

const dims = (sites: string[] | "all"): AdminAccessScopeDimensions =>
    (sites === "all"
        ? { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] }
        : { departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: sites }) as AdminAccessScopeDimensions;
const ALL = dims("all");
const ONLY_R = dims([R]);
const ONLY_L = dims([L]);

let supabase: SupabaseClient;
const created = new Set<string>();
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString(), cases: [] as unknown[] };

const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql], { encoding: "utf8" }).trim();
/** Every table an assignment writer, its trigger or its event touches — for this org / these subjects. */
const fingerprint = () =>
    psql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
        select 'sa:'||to_jsonb(s)::text x from schedule_assignments s where org_id='${ORG}'
        union all select 'awi:'||to_jsonb(a)::text from assignment_weekday_intervals a where org_id='${ORG}'
        union all select 'we:'||to_jsonb(w)::text from workflow_events w where org_id='${ORG}' and (w.payload->>'action_key' like 'assignment.%' or w.payload->>'action_key' like 'schedule.%')
        union all select 'cea:'||to_jsonb(c)::text from child_enrollment_agreements c where org_id='${ORG}' and customer_member_id in ('${CHILD_R}','${CHILD_L}')
        union all select 'pi:'||to_jsonb(p)::text from process_instances p where org_id='${ORG}' and subject_id in ('${CHILD_R}','${CHILD_L}')
        union all select 'sp:'||to_jsonb(sp)::text from schedule_patterns sp where org_id='${ORG}') q`);

function exec(actionKey: string, scope: AdminAccessScopeDimensions, entity: { type: string; id: string }, payload: Record<string, unknown>) {
    return executeCommandInvocation({
        request: {
            invocation: {
                commandKey: actionKey, origin: "operator", operationalContext: "focus_panel", surface: "focus_panel",
                workUnitId: null, processKey: null, providedSubject: { entityType: entity.type, entityId: entity.id }, inputValues: payload,
            } as ExecuteCommandInvocationRequest["invocation"],
            mode: "execute",
            executionSubject: { entityType: entity.type, entityId: entity.id },
            departmentId: null, workUnitId: null,
        },
        server: { orgId: ORG, userId: ADMIN, actorRole: "admin", accessScope: scope, supabase },
    });
}
const refusalCode = (r: Awaited<ReturnType<typeof exec>>) => {
    const raw = JSON.stringify(r);
    return /site_out_of_scope/.test(raw) ? "site_out_of_scope" : /site_unresolved/.test(raw) ? "site_unresolved" : null;
};
const track = (r: Awaited<ReturnType<typeof exec>>) => {
    for (const m of JSON.stringify(r).matchAll(/"(?:affectedId|assignment_id|primary_assignment_id)":"([0-9a-f-]{36})"/g)) created.add(m[1]!);
};

async function clone(sourceId: string, overrides: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.from("schedule_assignments").select("*").eq("id", sourceId).single();
    if (error || !data) throw new Error(`fixture source ${sourceId}: ${error?.message}`);
    const id = randomUUID();
    const ins = await supabase.from("schedule_assignments").insert({
        ...data, id, supersedes_assignment_id: null, source_key: FIXTURE, is_primary: false,
        metadata: { ...(data.metadata ?? {}), [FIXTURE]: true }, created_at: undefined, updated_at: undefined, ...overrides,
    });
    if (ins.error) throw new Error(`fixture insert: ${ins.error.message}`);
    created.add(id);
    return id;
}

let patternL: string | null = null;
afterAll(async () => {
    if (!live) return;
    const ids = [...created];
    if (ids.length) await supabase.from("schedule_assignments").delete().eq("org_id", ORG).in("id", ids);
    await supabase.from("schedule_assignments").delete().eq("org_id", ORG).eq("source_key", FIXTURE);
    if (patternL) await supabase.from("schedule_patterns").delete().eq("id", patternL);
    const { count } = await supabase.from("schedule_assignments").select("id", { count: "exact", head: true }).eq("org_id", ORG).in("id", ids.length ? ids : [randomUUID()]);
    evidence.fixtures_remaining = count ?? null;
    evidence.pattern_fixture_remaining = patternL ? Number(psql(`select count(*) from schedule_patterns where id='${patternL}'`)) : 0;
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — S4A: assignment commands enforce the actor's site authority", () => {
    it("allows in-scope writes, refuses out-of-scope ones before any write, for every command family", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ORG);
        const plus = (n: number) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
        evidence.today = today;

        // A temporary schedule pattern at Lakeside (none exists) so a Lakeside assignment can exist.
        const { data: pr } = await supabase.from("schedule_patterns").select("*").eq("id", PATTERN_R).single();
        patternL = randomUUID();
        const pins = await supabase.from("schedule_patterns").insert({ ...pr, id: patternL, site_location_id: L, key: `${FIXTURE}_${patternL.slice(0, 8)}`, label: "S4A fixture", metadata: { [FIXTURE]: true }, created_at: undefined, updated_at: undefined });
        if (pins.error) throw new Error(`pattern fixture: ${pins.error.message}`);

        const childR1 = await clone(SRC_CHILD_ROW, {});
        const childR2 = await clone(SRC_CHILD_ROW, {});
        const childL = await clone(SRC_CHILD_ROW, { enrollment_agreement_id: AGREEMENT_L, customer_member_id: CHILD_L, site_location_id: L, schedule_pattern_id: patternL, room_location_id: null, program_category_id: null });
        const staffR1 = await clone(SRC_STAFF_ROW, {});
        const staffR2 = await clone(SRC_STAFF_ROW, {});
        const staffR3 = await clone(SRC_STAFF_ROW, {});
        evidence.fixtures = { childR1, childR2, childL, staffR1, staffR2, staffR3, patternL };

        const cases = evidence.cases as unknown[];
        /** A refused case: the runtime refuses by site AND nothing anywhere changed. */
        const refused = async (name: string, actionKey: string, scope: AdminAccessScopeDimensions, entity: { type: string; id: string }, payload: Record<string, unknown>) => {
            const before = fingerprint();
            const r = await exec(actionKey, scope, entity, payload);
            const after = fingerprint();
            const code = refusalCode(r);
            cases.push({ name, actionKey, scope: scope.siteScope === "all" ? "all" : scope.allowedSiteLocationIds, ok: r.ok, refusal: code, unchanged: before === after });
            expect(r.ok, name).toBe(false);
            expect(code, name).not.toBeNull();
            expect(after, `${name}: no write, no event`).toBe(before);
        };
        /** An allowed case: executed for real; the runtime did not refuse by site, and the write landed. */
        const allowed = async (name: string, actionKey: string, scope: AdminAccessScopeDimensions, entity: { type: string; id: string }, payload: Record<string, unknown>) => {
            const before = fingerprint();
            const r = await exec(actionKey, scope, entity, payload);
            track(r);
            const after = fingerprint();
            cases.push({ name, actionKey, scope: scope.siteScope === "all" ? "all" : scope.allowedSiteLocationIds, ok: r.ok, refusal: refusalCode(r), changed: before !== after, error: r.ok ? null : JSON.stringify(r).slice(0, 300) });
            expect(refusalCode(r), name).toBeNull();
            expect(r.ok, `${name}: ${JSON.stringify(r).slice(0, 300)}`).toBe(true);
            expect(after, `${name}: the write landed`).not.toBe(before);
        };

        // 1 — unrestricted operator: allowed.
        await allowed("archive · ALL · R row", "assignment.archive", ALL, { type: "child", id: CHILD_R }, { assignment_id: childR1 });
        // 2/3 — restricted to R: in-site allowed, other site refused.
        await allowed("archive · R-actor · R row", "assignment.archive", ONLY_R, { type: "child", id: CHILD_R }, { assignment_id: childR2 });
        await refused("archive · R-actor · L row", "assignment.archive", ONLY_R, { type: "child", id: CHILD_L }, { assignment_id: childL });
        // 5 — identifier bypass: an in-scope subject id does not authorize an out-of-scope row.
        await refused("archive · R-actor · L row named under an R child", "assignment.archive", ONLY_R, { type: "child", id: CHILD_R }, { assignment_id: childL });
        await refused("archive · L-actor · R row", "assignment.archive", ONLY_L, { type: "child", id: CHILD_R }, { assignment_id: staffR1 });

        // create — committed target site comes from the AGREEMENT, never from the supplied site (5).
        await refused("create · R-actor · L agreement with site=R supplied", "assignment.create", ONLY_R, { type: "child", id: CHILD_L }, { subject_type: "child", enrollment_agreement_id: AGREEMENT_L, customer_member_id: CHILD_L, site_location_id: R, schedule_pattern_id: patternL, start_date: plus(30), assignment_type_id: TYPE_CHILD });
        await allowed("create (proposed) · R-actor · R", "assignment.create", ONLY_R, { type: "child", id: CHILD_R }, { subject_type: "child", customer_member_id: CHILD_R, site_location_id: R, schedule_pattern_id: PATTERN_R, start_date: plus(30), assignment_type_id: TYPE_CHILD });
        await refused("create (proposed) · R-actor · site L", "assignment.create", ONLY_R, { type: "child", id: CHILD_L }, { subject_type: "child", customer_member_id: CHILD_L, site_location_id: L, schedule_pattern_id: patternL, start_date: plus(30), assignment_type_id: TYPE_CHILD });

        // change_room — source AND destination (4).
        await allowed("change_room (staff) · R-actor · R→R", "assignment.change_room", ONLY_R, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: R, schedule_pattern_id: PATTERN_R, room_location_id: ROOM_R, supersedes_assignment_id: staffR2, start_date: plus(10), commitment_kind: "committed", assignment_type_id: TYPE_STAFF });
        await refused("change_room (staff) · R-actor · R→L destination", "assignment.change_room", ONLY_R, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: L, schedule_pattern_id: patternL, supersedes_assignment_id: staffR3, start_date: plus(10), commitment_kind: "committed", assignment_type_id: TYPE_STAFF });
        await refused("change_room (staff) · L-actor · R source→L", "assignment.change_room", ONLY_L, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: L, schedule_pattern_id: patternL, supersedes_assignment_id: staffR3, start_date: plus(10), commitment_kind: "committed", assignment_type_id: TYPE_STAFF });

        // set_time (staff only).
        await refused("set_time · L-actor · R staff row", "assignment.set_time", ONLY_L, { type: "person", id: STAFF }, { assignment_id: staffR3, days: [{ weekday: 2, start_time: "09:00", end_time: "13:00" }] });

        // set_primary — child via agreement site; staff via target site + the primaries it may close.
        await refused("set_primary (child) · R-actor · L agreement", "assignment.set_primary", ONLY_R, { type: "child", id: CHILD_L }, { subject_type: "child", enrollment_agreement_id: AGREEMENT_L, effective_date: plus(40), promote_assignment_id: childL });
        await refused("set_primary (staff) · R-actor · target L", "assignment.set_primary", ONLY_R, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: L, effective_date: plus(40), schedule_pattern_id: patternL, assignment_type_id: TYPE_STAFF });
        await allowed("set_primary (staff) · R-actor · promote R row", "assignment.set_primary", ONLY_R, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: R, effective_date: plus(40), promote_assignment_id: staffR3 });
        // With a live R primary, an L-only actor cannot change the staff primary even when targeting L — it would close an R row.
        await refused("set_primary (staff) · L-actor · target L would close the R primary", "assignment.set_primary", ONLY_L, { type: "person", id: STAFF }, { subject_type: "staff", person_id: STAFF, site_location_id: L, effective_date: plus(50), schedule_pattern_id: patternL, assignment_type_id: TYPE_STAFF });

        // promote_proposed / delete_proposed — the proposed row's site (and the agreement's).
        await refused("promote_proposed · R-actor · L row onto L agreement", "assignment.promote_proposed", ONLY_R, { type: "child", id: CHILD_L }, { assignment_id: childL, enrollment_agreement_id: AGREEMENT_L });
        await refused("delete_proposed · R-actor · L row", "assignment.delete_proposed", ONLY_R, { type: "child", id: CHILD_L }, { assignment_id: childL });
        await refused("delete_proposed · R-actor · L child's participation draft", "assignment.delete_proposed", ONLY_R, { type: "child", id: CHILD_L }, { assignment_id: `proposed:${CHILD_L}` });

        // In-scope admission for the commands whose real execution would rewrite shared cert data
        // (participation clears / child primary): the shared boundary admits them; the domain writer runs as before.
        const admit = async (name: string, actionKey: string, scope: AdminAccessScopeDimensions, entity: { type: string; id: string }, payload: Record<string, unknown>) => {
            const action = getRegisteredAction(actionKey)!;
            const refusal = await authorizeActionSites(action, { supabase, ctx: { orgId: ORG, userId: ADMIN, accessScope: scope }, invocation: { actionKey, entityType: entity.type, entityId: entity.id, payload }, payload });
            cases.push({ name, actionKey, scope: scope.siteScope === "all" ? "all" : scope.allowedSiteLocationIds, admitted: refusal === null, refusal: refusal && !refusal.ok ? refusal.blockers?.[0]?.code : null });
            return refusal;
        };
        expect(await admit("delete_proposed · R-actor · R row (admission)", "assignment.delete_proposed", ONLY_R, { type: "child", id: CHILD_R }, { assignment_id: childR1 })).toBeNull();
        expect(await admit("promote_proposed · R-actor · R row onto R agreement (admission)", "assignment.promote_proposed", ONLY_R, { type: "child", id: CHILD_R }, { assignment_id: childR1, enrollment_agreement_id: AGREEMENT_R })).toBeNull();
        expect(await admit("set_primary (child) · R-actor · R agreement (admission)", "assignment.set_primary", ONLY_R, { type: "child", id: CHILD_R }, { subject_type: "child", enrollment_agreement_id: AGREEMENT_R, effective_date: plus(40) })).toBeNull();
        expect(await admit("delete_proposed · R-actor · R child's draft (admission)", "assignment.delete_proposed", ONLY_R, { type: "child", id: CHILD_R }, { assignment_id: `proposed:${CHILD_R}` })).toBeNull();

        // set_time — the local stack lacks migration 20261014120000 (set_assignment_weekday_intervals), so the
        // in-scope write cannot complete here; its admission is proven, and the refusal above ran for real.
        expect(await admit("set_time · R-actor · R staff row (admission)", "assignment.set_time", ONLY_R, { type: "person", id: STAFF }, { assignment_id: staffR3, days: [{ weekday: 1, start_time: "08:00", end_time: "12:00" }] })).toBeNull();

        // schedule.create — the card's child primary-schedule path (the scheduling route applies the same authority).
        expect(await admit("schedule.create · R-actor · R agreement (admission)", "schedule.create", ONLY_R, { type: "child", id: CHILD_R }, { enrollment_agreement_id: AGREEMENT_R, schedule_pattern_id: PATTERN_R, start_date: plus(60) })).toBeNull();
        const sc = await admit("schedule.create · R-actor · L agreement", "schedule.create", ONLY_R, { type: "child", id: CHILD_L }, { enrollment_agreement_id: AGREEMENT_L, schedule_pattern_id: patternL, start_date: plus(60) });
        expect(sc && !sc.ok ? sc.status : null).toBe(403);
        expect(await admit("schedule.create · ALL · L agreement (admission)", "schedule.create", ALL, { type: "child", id: CHILD_L }, { enrollment_agreement_id: AGREEMENT_L })).toBeNull();
    }, 240_000);
});
