/**
 * BP V2 D2/D5 — LIVE: a two-child family. The family decides as a family; each child gets its own path;
 * a failed outcome never masquerades as completed work.
 *
 * REAL: every route handler (Business Process builder, publish, stage work units, Create Lead, child.add,
 * complete-stage-work, participant-decisions, operational-tasks, provisioning answer), the canonical outcome
 * and participant-decision executors, the transaction contract, and the production access chain (portal
 * admission, grants, work capability) for real users. MOCKED: only WHO IS SIGNED IN (`cachedAuthSession`).
 * A fresh org (slug `bpv2-d25-live-*`), removed by certification/business-processes-v2/d2d5/live-fixture-teardown.sql.
 *
 * Gate: BPV2_LIVE_SUPABASE_URL + BPV2_LIVE_SERVICE_KEY. Evidence → BPV2_LIVE_EVIDENCE.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { who } = vi.hoisted(() => ({ who: { userId: null as string | null, email: "", client: null as unknown } }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => who.client }));
vi.mock("@/lib/admin/cachedAuthSession", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/cachedAuthSession")>("@/lib/admin/cachedAuthSession");
    return {
        ...actual,
        getCachedAuthUserId: async () => who.userId,
        getCachedAuthUser: async () => (who.userId ? ({ id: who.userId, email: who.email } as never) : null),
    };
});
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, revalidatePath: () => undefined, unstable_cache: (fn: unknown) => fn }));

import { POST as DEPARTMENTS_POST } from "@/app/api/admin/departments/route";
import { PATCH as BUILDER_PATCH } from "@/app/api/admin/departments/[departmentId]/lifecycle-builder/route";
import { POST as WORK_VIEWS_POST } from "@/app/api/admin/lifecycle-builder/process-work-views/route";
import { POST as PUBLISH_POST } from "@/app/api/admin/business-process/configuration/publish/route";
import { POST as STAGE_RUNTIME_CONFIG_POST } from "@/app/api/admin/enrollment-process/stage-runtime-config/route";
import { POST as STATUS_DEFINITIONS_POST } from "@/app/api/admin/status-definitions/route";
import { POST as STAGE_WORK_UNIT_POST } from "@/app/api/admin/enrollment-process/stage-work-unit/route";
import { POST as ACTIONS_EXECUTE } from "@/app/api/admin/actions/execute/route";
import { POST as OCM_POST } from "@/app/api/admin/opportunity-customer-members/route";
import { GET as OPERATIONAL_TASKS_GET } from "@/app/api/admin/operational-tasks/route";
import { POST as COMPLETE_STAGE_WORK_POST } from "@/app/api/admin/lifecycle-builder/complete-stage-work/route";
import { GET as PARTICIPANTS_GET, POST as PARTICIPANTS_POST } from "@/app/api/admin/lifecycle-builder/participant-decisions/route";
import { GET as PROVISIONING_ANSWER_GET } from "@/app/api/admin/work-units/[id]/provisioning-answer/route";
import { childOfStageWork } from "@/lib/lifecycle/stageWorkChildSubject";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const live = Boolean(URL_ && KEY);
const RUN = randomUUID().slice(0, 8);

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { run: RUN, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);
const created = { orgs: [] as string[], users: [] as string[] };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type P = { orgId: string; userId: string; email: string; siteId: string };

async function call(handler: (req: NextRequest, ctx: any) => Promise<Response>, method: string, path: string, body?: unknown, params?: Record<string, string>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await handler(
        new NextRequest(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
        { params: Promise.resolve(params ?? {}) },
    );
    let json: Json = {};
    try {
        json = (await res.json()) as Json;
    } catch {
        /* non-JSON */
    }
    return { status: res.status, json };
}
const as = (p: { userId: string; email: string }) => {
    who.userId = p.userId;
    who.email = p.email;
};

/** A real user in `org` holding `role`, with the person link and access profile memberships require. */
async function member(orgId: string, label: string, role: string): Promise<{ userId: string; email: string }> {
    const email = `bpv2-d25-${label}-${RUN}@example.com`;
    const u = await supabase.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    if (u.error) throw new Error(`user ${label}: ${u.error.message}`);
    created.users.push(u.data.user.id);
    const person = await supabase.from("persons").insert({ org_id: orgId, person_number: 700000 + Math.floor(Math.random() * 200000), first_name: "D25", last_name: `${label} ${RUN}` }).select("id").single();
    if (person.error) throw new Error(`person: ${person.error.message}`);
    for (const r of [
        await supabase.from("user_person_links").insert({ org_id: orgId, user_id: u.data.user.id, person_id: person.data.id }),
        await supabase.from("user_access_profiles").insert({ user_id: u.data.user.id, org_id: orgId, department_scope: "all", site_scope: "all" }),
        await supabase.from("user_roles").insert({ user_id: u.data.user.id, org_id: orgId, role }),
    ]) if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return { userId: u.data.user.id, email };
}

async function newOrg(): Promise<P> {
    const { data: industry } = await supabase.from("industries").select("id").eq("key", "childcare").single();
    const { data: org, error } = await supabase.from("orgs").insert({ name: `BP V2 D2D5 live ${RUN}`, slug: `bpv2-d25-live-${RUN}`, industry_id: industry!.id }).select("id").single();
    if (error) throw new Error(`org: ${error.message}`);
    created.orgs.push(org.id);
    const site = await supabase.from("locations").insert({ org_id: org.id, location_number: 1, label: `Site ${RUN}`, location_type: "site", status_key: "active", is_active: true }).select("id").single();
    if (site.error) throw new Error(`site: ${site.error.message}`);
    const admin = await member(org.id, "admin", "admin");
    return { orgId: org.id, siteId: site.data.id, ...admin };
}

const draftRev = (j: Json) => j?.draft_revision ?? j?.draft?.draft_revision ?? null;
const stage = (key: string) => [{ field_key: "opportunity_stage", operator: "equals", value: key }];
const VIEWS = [
    { id: "decision", label: "Decision", filters_v1: stage("decision"), row_grain_v1: "family", display_order: 1, visible_in_runtime: true },
    { id: "registration", label: "Registration", filters_v1: stage("enrolling"), row_grain_v1: "child", display_order: 2, visible_in_runtime: true },
    { id: "waitlist", label: "Waitlist", filters_v1: stage("waitlist"), row_grain_v1: "child", display_order: 3, visible_in_runtime: true },
    { id: "all", label: "All", filters_v1: [], row_grain_v1: "family", display_order: 4, visible_in_runtime: true },
];

let A: P;
let departmentId = "";
let processId = "";
let opportunityId = "";
const kids: Record<"ava" | "ben", { memberId: string; ocmId: string }> = {} as never;

async function openTasks() {
    const r = await call(OPERATIONAL_TASKS_GET, "GET", `/api/admin/operational-tasks?entity_type=opportunities&entity_id=${opportunityId}`);
    return ((r.json.tasks ?? r.json.items ?? []) as Json[]).map((t) => ({ id: t.id as string, title: t.title as string, status: t.status as string, child: childOfStageWork(t.metadata), stage: (t.metadata?.lifecycle_stage_key ?? null) as string | null }));
}
async function childState() {
    const { data: ocms } = await supabase.from("opportunity_customer_members").select("id, customer_member_id, outcome_status_key, stage_key").eq("opportunity_id", opportunityId);
    const { data: journeys } = await supabase.from("process_instances").select("context_id, stage_key, state").eq("org_id", A.orgId).in("context_id", (ocms ?? []).map((o) => o.id));
    // The child's durable state lives on its own journey; the participation row carries the child status.
    const { data: opp } = await supabase.from("opportunities").select("stage_key, status_key").eq("id", opportunityId).single();
    const out: Json = { family: opp };
    for (const [k, v] of Object.entries(kids)) {
        const o = (ocms ?? []).find((x) => x.customer_member_id === v.memberId);
        const js = (journeys ?? []).filter((j) => j.context_id === o?.id);
        out[k] = { status: o?.outcome_status_key ?? null, participation_stage: o?.stage_key ?? null, journeys: js.map((j) => j.stage_key), journey_states: js.map((j) => j.state) };
    }
    return out;
}
const decide = (memberId: string, ocmId: string, decisionKey: string, input_values?: Json) =>
    call(PARTICIPANTS_POST, "POST", "/api/admin/lifecycle-builder/participant-decisions", {
        opportunity_id: opportunityId, department_id: departmentId, stage_key: "decision", template_key: "support_enrollment_decision",
        decision_key: decisionKey, customer_member_id: memberId, opportunity_customer_member_id: ocmId, ...(input_values ? { input_values } : {}),
    });
const viewRows = async (viewId: string, slug = "lifecycle_wu_decision") => {
    const r = await call(PROVISIONING_ANSWER_GET, "GET", `/api/admin/work-units/${slug}/provisioning-answer?work_view_id=${viewId}`, undefined, { id: slug });
    const frame = (r.json.queueFrame ?? {}) as Json;
    // An operational answer carries its rows top-level; `queueFrame` is the refusal path's frame.
    const raw = ((r.json.rows ?? frame.rows ?? []) as Json[]);
    const rows = raw.map((x) => ({ id: x.id ?? x.subjectId ?? null, stage: x.stageKey ?? null, status: x.statusKey ?? null, member: x.customerMemberId ?? x.subject?.customerMemberId ?? null, title: String(x.title ?? x.label ?? "").slice(0, 40) }));
    return { slug, status: r.status, terminal: r.json.terminal ?? null, code: r.json.code ?? null, rowGrain: r.json.rowGrain ?? null, row_keys: raw[0] ? Object.keys(raw[0]).slice(0, 25) : [], rows };
};
beforeAll(() => {
    if (!live) return;
    supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
    who.client = supabase;
});
afterAll(() => {
    if (!live) return;
    evidence.fixture_orgs_for_teardown = created.orgs;
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — D2/D5: family decision vs per-child enrollment on a two-child family", () => {
    it("setup: template applied + published through the routes; a two-child family reaches Decision", async () => {
        A = await newOrg();
        as(A);
        const d = await call(DEPARTMENTS_POST, "POST", "/api/admin/departments", { key: "enrollment", name: "Enrollment", metadata: { lifecycle_builder_owned_v1: { source: "lifecycle_builder", created_by: A.userId, created_at: new Date().toISOString(), process_id: null } } });
        expect(d.status, JSON.stringify(d.json).slice(0, 400)).toBeLessThan(300);
        departmentId = (d.json.department ?? d.json.item ?? d.json).id;
        const b = async (body: Json) => {
            const r = await call(BUILDER_PATCH, "PATCH", `/api/admin/departments/${departmentId}/lifecycle-builder`, body, { departmentId });
            expect(r.status, `${body.action}: ${JSON.stringify(r.json).slice(0, 500)}`).toBe(200);
            return r.json;
        };
        const c = await b({ action: "create_process", name: "Enrollment", primary_entity: "opportunity" });
        processId = c.active_process?.id ?? c.config?.active_process_id;
        await b({ action: "apply_enrollment_v2_template", process_id: processId });
        await b({ action: "set_process_entry_point", process_id: processId, intent: "create_lead", stage_key: "lead" });
        const e2 = await b({ action: "set_process_entry_point", process_id: processId, intent: "enrollment_start", stage_key: "enrolling" });
        const w = await call(WORK_VIEWS_POST, "POST", "/api/admin/lifecycle-builder/process-work-views", { department_id: departmentId, process_id: processId, work_views_v1: VIEWS, draft_revision: draftRev(e2) });
        expect(w.status, JSON.stringify(w.json).slice(0, 500)).toBe(200);
        const p = await call(PUBLISH_POST, "POST", "/api/admin/business-process/configuration/publish", { department_id: departmentId, draft_revision: draftRev(w.json) });
        expect(p.status, JSON.stringify(p.json).slice(0, 800)).toBe(200);
        // Child statuses are their own configuration (not part of the process template) — configured exactly as
        // QA Shared was in S8B-1, with the canonical child vocabulary.
        for (const [status_key, status_label, sort_order] of [["waitlisted", "Waitlisted", 10], ["enrolling", "Enrolling", 20], ["enrolled", "Enrolled", 30], ["withdrawn", "Withdrawn", 40], ["not_enrolling", "Not Enrolling", 50]] as const) {
            const r = await call(STATUS_DEFINITIONS_POST, "POST", "/api/admin/status-definitions", { entity_type: "opportunity_customer_members", status_key, status_label, sort_order });
            expect(r.status, `${status_key}: ${JSON.stringify(r.json).slice(0, 300)}`).toBeLessThan(300);
        }
        for (const [s, keys] of [["lead", ["open"]], ["tour", ["open"]], ["decision", ["open"]], ["waitlist", ["waitlisted"]], ["enrolling", ["enrolling"]]] as const) {
            const r = await call(STAGE_WORK_UNIT_POST, "POST", "/api/admin/enrollment-process/stage-work-unit", { department_id: departmentId, stage: s, status_keys: keys });
            expect(r.status, `${s}: ${JSON.stringify(r.json).slice(0, 300)}`).toBeLessThan(300);
        }
        const lead = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", {
            action_key: "create_lead", entity_type: "opportunity", confirmation: { confirmed: true }, context: { department_id: departmentId },
            payload: { first_name: "Parent", last_name: `D25${RUN}`, email: `bpv2-d25-lead-${RUN}@example.com`, location_id: A.siteId, child_first_name: "Ava", child_last_name: `D25${RUN}`, child_date_of_birth: "2021-09-01" },
        });
        expect(lead.status, JSON.stringify(lead.json).slice(0, 600)).toBe(200);
        opportunityId = lead.json.data.execution_result.opportunity_id;
        const { data: ava } = await supabase.from("opportunity_customer_members").select("id, customer_member_id").eq("opportunity_id", opportunityId).single();
        kids.ava = { memberId: ava!.customer_member_id, ocmId: ava!.id };
        const { data: hh } = await supabase.from("customer_members").select("customer_id").eq("id", kids.ava.memberId).single();
        const add = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", {
            action_key: "child.add", entity_type: "child", entity_id: "__child_add__", confirmation: { confirmed: true },
            payload: { customer_id: hh!.customer_id, first_name: "Ben", last_name: `D25${RUN}`, date_of_birth: "2023-02-10" },
        });
        expect(add.status, JSON.stringify(add.json).slice(0, 600)).toBe(200);
        const benMember = add.json.data?.affected_id as string;
        // `child.add` creates no enrollment participation by design; joining the family's case is its own command.
        const join = await call(OCM_POST, "POST", "/api/admin/opportunity-customer-members", { opportunity_id: opportunityId, customer_member_id: benMember });
        expect(join.status, JSON.stringify(join.json).slice(0, 400)).toBeLessThan(300);
        const { data: ben } = await supabase.from("opportunity_customer_members").select("id").eq("opportunity_id", opportunityId).eq("customer_member_id", benMember).maybeSingle();
        expect(ben, "Ben participates in the family's enrollment case").toBeTruthy();
        kids.ben = { memberId: benMember, ocmId: ben!.id };
        // Lead → Tour → Decision through the stage work's own outcomes.
        for (const [stageKey, outcome] of [["lead", "interested"], ["tour", "tour_completed"]] as const) {
            const open = (await openTasks()).find((t) => t.status === "open" && !t.child);
            const r = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", {
                department_id: departmentId, stage_key: stageKey, work_id: open!.id, outcome_key: outcome, subject: { journey_segment: "family", opportunity_id: opportunityId },
            });
            expect(r.status, `${stageKey}/${outcome}: ${JSON.stringify(r.json).slice(0, 500)}`).toBe(200);
        }
        const s = await childState();
        expect(s.family.stage_key).toBe("decision");
        record("setup", { org: A.orgId, opportunityId, kids, state: s, tasks: await openTasks() });
    }, 300_000);

    it("D2 1-6: Family Enrolling while the children are undecided is REFUSED — work stays open, nothing moves, the reason is shown", async () => {
        const before = { state: await childState(), tasks: await openTasks() };
        const decisionWork = before.tasks.find((t) => t.status === "open" && !t.child)!;
        const r = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", {
            department_id: departmentId, stage_key: "decision", work_id: decisionWork.id, outcome_key: "family_enrolling", subject: { journey_segment: "family", opportunity_id: opportunityId },
        });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.json.ok).not.toBe(true);
        const message = String(r.json.error ?? r.json.message ?? "");
        expect(message.length).toBeGreaterThan(10);
        const after = { state: await childState(), tasks: await openTasks() };
        expect(after.state).toEqual(before.state);
        expect(after.tasks.find((t) => t.id === decisionWork.id)!.status).toBe("open");
        record("d2_family_enrolling_refused", { status: r.status, message, state_unchanged: true, work_open: true });
    }, 120_000);

    it("D5 7-14: Ava waitlisted and Ben begins enrolling, each on their own path; the family stays at Decision", async () => {
        const surface = await call(PARTICIPANTS_GET, "GET", `/api/admin/lifecycle-builder/participant-decisions?opportunity_id=${opportunityId}&department_id=${departmentId}&stage_key=decision&template_key=support_enrollment_decision`);
        expect(surface.status, JSON.stringify(surface.json).slice(0, 600)).toBe(200);
        expect((surface.json.rows as Json[]).length).toBe(2);
        expect(surface.json.configuration_issues ?? []).toEqual([]);
        const offered = (surface.json.rows as Json[])[0]!.decisions.map((d: Json) => d.decision_key);
        expect(offered).toEqual(expect.arrayContaining(["child_begin_enrolling", "child_waitlist", "child_not_enrolling"]));

        const w = await decide(kids.ava.memberId, kids.ava.ocmId, "child_waitlist");
        record("d5_ava_response", { status: w.status, changed: w.json.changed, affected: w.json.affected, degraded: w.json.degraded, family_work_completed: w.json.family_work_completed, progress: w.json.progress });
        expect(w.status, JSON.stringify(w.json).slice(0, 600)).toBe(200);
        expect(w.json.changed).toBe(true);
        const afterAva = await childState();
        expect(afterAva.ava.status).toBe("waitlisted");
        expect(afterAva.ben.status).not.toBe("waitlisted");

        const e = await decide(kids.ben.memberId, kids.ben.ocmId, "child_begin_enrolling");
        expect(e.status, JSON.stringify(e.json).slice(0, 600)).toBe(200);
        expect(e.json.changed).toBe(true);
        const s = await childState();
        expect(s.ben.status).toBe("enrolling");
        expect(s.ben.journeys).toContain("enrolling");
        expect(s.ava.status).toBe("waitlisted");
        expect(s.ava.journeys).not.toContain("enrolling");
        expect(s.family.stage_key).toBe("decision");
        // Child-stage work for the child that moved, and only that child.
        const tasks = await openTasks();
        const childWork = tasks.filter((t) => t.status === "open" && t.child);
        expect(childWork.some((t) => t.child === kids.ben.memberId)).toBe(true);
        expect(childWork.filter((t) => t.child === kids.ben.memberId).every((t) => !/waitlist/i.test(t.title))).toBe(true);
        // Work Views refresh from authoritative state.
        const registration = await viewRows("registration");
        const waitlist = await viewRows("waitlist");
        record("d5_views_probe", {
            registration_via_enrolling_wu: await viewRows("registration", "lifecycle_wu_enrolling"),
            waitlist_via_waitlist_wu: await viewRows("waitlist", "lifecycle_wu_waitlist"),
            all: await viewRows("all"),
        });
        record("d5_per_child", { ava: s.ava, ben: s.ben, family: s.family, family_work_completed_after_last_child: e.json.family_work_completed, child_work: childWork, registration, waitlist });
        expect(registration.rows.length).toBe(1);
        expect(waitlist.rows.length).toBe(1);
    }, 180_000);

    it("D2/D5 15-19: wrong grain, repeats, invalid input and missing capability are refused and change nothing", async () => {
        const before = { state: await childState(), tasks: await openTasks() };
        const benWork = before.tasks.find((t) => t.status === "open" && t.child === kids.ben.memberId);
        const out: Json = {};
        if (benWork) {
            const asFamily = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", {
                department_id: departmentId, stage_key: "enrolling", work_id: benWork.id, outcome_key: "packet_sent", subject: { journey_segment: "family", opportunity_id: opportunityId },
            });
            out.child_work_as_family = { status: asFamily.status, error: asFamily.json.error ?? null };
            expect(asFamily.status).toBeGreaterThanOrEqual(400);
        }
        // Repeat Ben's successful decision: no duplicate journey, no duplicate work.
        const again = await decide(kids.ben.memberId, kids.ben.ocmId, "child_begin_enrolling");
        out.repeat = { status: again.status, changed: again.json.changed ?? null, error: again.json.error ?? null };
        // Not Enrolling without its required reason: refused before anything is written.
        const noReason = await decide(kids.ava.memberId, kids.ava.ocmId, "child_not_enrolling");
        out.missing_input = { status: noReason.status, error: noReason.json.error ?? null };
        expect(noReason.status).toBeGreaterThanOrEqual(400);
        // An unknown decision (an invalid destination) is refused.
        const unknown = await decide(kids.ava.memberId, kids.ava.ocmId, "child_teleport");
        out.unknown_decision = { status: unknown.status, error: unknown.json.error ?? null };
        expect(unknown.status).toBeGreaterThanOrEqual(400);
        // A member without work.operate is refused. The role is one the org was SEEDED with — portal-eligible,
        // lacking work.operate — chosen from the org's own definitions and grants, never invented here.
        const { data: roles } = await supabase.from("role_definitions").select("role_key").eq("org_id", A.orgId).eq("is_active", true);
        const { data: grants } = await supabase.from("role_permission_grants").select("role_key, permission_key").eq("org_id", A.orgId).eq("allowed", true);
        const has = (role: string, perm: string) => (grants ?? []).some((g) => g.role_key === role && g.permission_key === perm);
        const noWork = (roles ?? []).map((r) => r.role_key as string).find((r) => has(r, "portal.access") && !has(r, "work.operate"));
        out.seeded_roles = (roles ?? []).map((r) => r.role_key);
        if (noWork) {
            const viewer = await member(A.orgId, "viewer", noWork);
            as(viewer);
            const denied = await decide(kids.ava.memberId, kids.ava.ocmId, "child_begin_enrolling");
            as(A);
            out.unauthorized = { role: noWork, status: denied.status, error: denied.json.error ?? null };
            expect(denied.status).toBe(403);
        } else {
            // A fresh org seeds only roles that hold work.operate. A real member of another org (Northwind, local
            // certification) whose role is portal-only is refused at the capability gate before anything else.
            const NORTHWIND = "00000000-0000-4000-8000-000000000001";
            const outsider = await member(NORTHWIND, "outsider", "mcert_proc_portal_only");
            as(outsider);
            const denied = await decide(kids.ava.memberId, kids.ava.ocmId, "child_begin_enrolling");
            as(A);
            out.unauthorized = { via: "northwind mcert_proc_portal_only (no work.operate)", status: denied.status, error: denied.json.error ?? null };
            expect(denied.status).toBe(403);
            for (const t of ["user_roles", "user_access_profiles", "user_person_links"]) await supabase.from(t).delete().eq("user_id", outsider.userId);
        }
        const after = { state: await childState(), tasks: await openTasks() };
        expect(after.state).toEqual(before.state);
        expect(after.tasks.filter((t) => t.status === "open").map((t) => t.id).sort()).toEqual(before.tasks.filter((t) => t.status === "open").map((t) => t.id).sort());
        record("refusals", out);
    }, 180_000);

    it("D2 the family outcome is accepted once every child has a path, completes the family work, and moves no child", async () => {
        const before = await childState();
        const familyWork = (await openTasks()).find((t) => t.status === "open" && !t.child);
        if (!familyWork) {
            record("family_completion", { already_completed_by_runtime: true });
            return;
        }
        const r = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", {
            department_id: departmentId, stage_key: "decision", work_id: familyWork.id, outcome_key: "family_enrolling", subject: { journey_segment: "family", opportunity_id: opportunityId },
        });
        expect(r.status, JSON.stringify(r.json).slice(0, 600)).toBe(200);
        expect(await childState()).toEqual(before);
        expect((await openTasks()).find((t) => t.id === familyWork.id)!.status).not.toBe("open");
        record("family_completion", { status: r.status, children_unchanged: true });
    }, 120_000);

    it("D2 executor truthfulness: a configured `enter_child_enrollment` on a two-child family REFUSES and leaves the work open", async () => {
        // Author (through the Stage editor route) a Decision plan whose Family Enrolling carries the child target and
        // no per-child gate — the configuration whose child effect used to vanish and report success. Then publish.
        const { data: dept } = await supabase.from("departments").select("metadata").eq("id", departmentId).single();
        const proc = (dept!.metadata as Json).lifecycle_builder_v1.processes.find((x: Json) => x.id === processId);
        const decisionPlan = structuredClone(proc.stages.find((x: Json) => x.key === "decision").stage_operating_plan_v1);
        decisionPlan.outcome_rules = decisionPlan.outcome_rules.map((r: Json) => r.when_outcome_key === "family_enrolling" ? { ...r, targets: [{ kind: "no_movement" }, { kind: "enter_child_enrollment" }] } : r);
        decisionPlan.work_templates = decisionPlan.work_templates.map((w: Json) => {
            const rest = { ...w };
            delete rest.participant_decisions;
            delete rest.completion_policy;
            return rest;
        });
        const saved = await call(STAGE_RUNTIME_CONFIG_POST, "POST", "/api/admin/enrollment-process/stage-runtime-config", { department_id: departmentId, process_id: processId, stage_key: "decision", stage_operating_plan_v1: decisionPlan });
        expect(saved.status, JSON.stringify(saved.json).slice(0, 500)).toBeLessThan(300);
        const pub = await call(PUBLISH_POST, "POST", "/api/admin/business-process/configuration/publish", { department_id: departmentId });
        expect(pub.status, JSON.stringify(pub.json).slice(0, 600)).toBe(200);

        // A second two-child family reaches Decision.
        const lead = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", {
            action_key: "create_lead", entity_type: "opportunity", confirmation: { confirmed: true }, context: { department_id: departmentId },
            payload: { first_name: "Parent2", last_name: `D25b${RUN}`, email: `bpv2-d25-lead2-${RUN}@example.com`, location_id: A.siteId, child_first_name: "Cleo", child_last_name: `D25b${RUN}`, child_date_of_birth: "2021-05-01" },
        });
        expect(lead.status).toBe(200);
        const opp2 = lead.json.data.execution_result.opportunity_id as string;
        const { data: cleo } = await supabase.from("opportunity_customer_members").select("customer_member_id").eq("opportunity_id", opp2).single();
        const { data: hh } = await supabase.from("customer_members").select("customer_id").eq("id", cleo!.customer_member_id).single();
        const add = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", { action_key: "child.add", entity_type: "child", entity_id: "__child_add__", confirmation: { confirmed: true }, payload: { customer_id: hh!.customer_id, first_name: "Dex", last_name: `D25b${RUN}`, date_of_birth: "2023-03-03" } });
        expect(add.status).toBe(200);
        expect((await call(OCM_POST, "POST", "/api/admin/opportunity-customer-members", { opportunity_id: opp2, customer_member_id: add.json.data.affected_id })).status).toBeLessThan(300);
        const tasksOf = async () => ((await call(OPERATIONAL_TASKS_GET, "GET", `/api/admin/operational-tasks?entity_type=opportunities&entity_id=${opp2}`)).json.tasks as Json[]).map((t) => ({ id: t.id, title: t.title, status: t.status }));
        for (const [stageKey, outcome] of [["lead", "interested"], ["tour", "tour_completed"]] as const) {
            const open = (await tasksOf()).find((t) => t.status === "open")!;
            expect((await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", { department_id: departmentId, stage_key: stageKey, work_id: open.id, outcome_key: outcome, subject: { journey_segment: "family", opportunity_id: opp2 } })).status).toBe(200);
        }
        const kidsState = async () => (await supabase.from("opportunity_customer_members").select("customer_member_id, outcome_status_key").eq("opportunity_id", opp2).order("customer_member_id")).data;
        const journeys = async () => (await supabase.from("process_instances").select("id").eq("org_id", A.orgId).in("subject_id", ((await kidsState()) ?? []).map((k) => k.customer_member_id))).data?.length ?? 0;
        const before = { kids: await kidsState(), journeys: await journeys(), tasks: await tasksOf() };
        const decisionWork = before.tasks.find((t) => t.status === "open")!;
        const r = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", { department_id: departmentId, stage_key: "decision", work_id: decisionWork.id, outcome_key: "family_enrolling", subject: { journey_segment: "family", opportunity_id: opp2 } });
        const message = String(r.json.error ?? "");
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(message).toMatch(/This family has 2 children/);
        expect({ kids: await kidsState(), journeys: await journeys(), tasks: await tasksOf() }).toEqual(before);
        const { data: opp } = await supabase.from("opportunities").select("stage_key").eq("id", opp2).single();
        expect(opp!.stage_key).toBe("decision");
        record("d2_executor_refusal", { status: r.status, message, transaction: r.json.transaction?.outcome ?? null, work_open: true, children_unchanged: true });
    }, 300_000);
});
