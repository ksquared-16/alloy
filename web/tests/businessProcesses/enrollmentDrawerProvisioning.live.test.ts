/**
 * BP V2 D1 — LIVE: a NEW org's first Enrollment publication provisions the workflow_v1 opportunity drawer
 * override, and its records then open through the drawer view-model the Focus Panel loads.
 *
 * Real boundaries: the production route handlers (departments, lifecycle-builder, process-work-views,
 * validate, publish, repair-work-units, actions/execute, the drawer view-model, focus-panel-summary), the
 * real `publish_business_process_revision_v1` RPC, the real `record_drawer_layouts` UNIQUE key, a real auth
 * user with a real `admin` membership whose permission keys come from the production grant resolver.
 * Mocked: ONLY the session/cookie boundary (who the caller is) — the routes cannot read a cookie in vitest.
 *
 * Fresh orgs (slug `bpv2-d1-live-*`) are created per run, recorded, and removed afterwards by
 * certification/business-processes-v2/d1/live-fixture-teardown.sql.
 * Gate: BPV2_LIVE_SUPABASE_URL + BPV2_LIVE_SERVICE_KEY (local certification stack). Evidence → BPV2_LIVE_EVIDENCE.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { who } = vi.hoisted(() => ({
    who: { current: null as null | { orgId: string; userId: string; permissionKeys: string[] }, client: null as unknown },
}));

const ctx = () => {
    const w = who.current!;
    return { ok: true as const, orgId: w.orgId, userId: w.userId, role: "admin", roleKeys: ["admin"], permissionKeys: w.permissionKeys };
};
const access = () => ({
    ...ctx(),
    departmentScope: "all" as const,
    allowedDepartmentIds: [] as string[],
    siteScope: "all" as const,
    allowedSiteLocationIds: [] as string[],
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => who.client }));
vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: async () => null, requireAdmin: async () => null };
});
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContext: async () => ctx(), getAdminContextCached: async () => ctx() };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: async () => access(), getAdminAccessContextCached: async () => access() };
});
vi.mock("@/lib/admin/adminRouteGate", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/adminRouteGate")>("@/lib/admin/adminRouteGate");
    const gate = async () => {
        const a = access();
        return { ...a, access: a, dim: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } };
    };
    return { ...actual, loadAdminRouteGate: gate };
});
vi.mock("@/lib/admin/getAdminOrgContextLight", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminOrgContextLight")>("@/lib/admin/getAdminOrgContextLight");
    return { ...actual, requireAdminOrgContextLight: async () => ctx(), getAdminOrgContextLightCached: async () => ctx() };
});
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, revalidatePath: () => undefined, unstable_cache: (fn: unknown) => fn }));

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT,
    ensureEnrollmentOpportunityDrawerOverride,
} from "@/lib/admin/enrollmentDrawerOverrideProvisioning";
import { persistOpportunityDrawerLayoutConfig } from "@/lib/admin/recordDrawerLayoutPersist";
import { loadPublishedConfiguration } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { POST as ACTIONS_EXECUTE } from "@/app/api/admin/actions/execute/route";
import { POST as DEPARTMENTS_POST } from "@/app/api/admin/departments/route";
import { PATCH as BUILDER_PATCH } from "@/app/api/admin/departments/[departmentId]/lifecycle-builder/route";
import { POST as WORK_VIEWS_POST } from "@/app/api/admin/lifecycle-builder/process-work-views/route";
import { POST as VALIDATE_POST } from "@/app/api/admin/business-process/configuration/validate/route";
import { POST as PUBLISH_POST } from "@/app/api/admin/business-process/configuration/publish/route";
import { POST as REPAIR_WORK_UNITS_POST } from "@/app/api/admin/lifecycle-catalog/repair-work-units/route";
import { POST as STAGE_WORK_UNIT_POST } from "@/app/api/admin/enrollment-process/stage-work-unit/route";
import { GET as DRAWER_VM_GET } from "@/app/api/admin/view-models/drawer/opportunity/[id]/route";
import { GET as OPERATIONAL_TASKS_GET } from "@/app/api/admin/operational-tasks/route";
import { POST as COMPLETE_STAGE_WORK_POST } from "@/app/api/admin/lifecycle-builder/complete-stage-work/route";
import { GET as PROVISIONING_ANSWER_GET } from "@/app/api/admin/work-units/[id]/provisioning-answer/route";
import { GET as FOCUS_SUMMARY_GET } from "@/app/api/admin/entity-layouts/focus-panel-summary/route";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const live = Boolean(URL_ && KEY);
const CHILDCARE_INDUSTRY_KEY = "childcare";
const RUN = randomUUID().slice(0, 8);

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { run: RUN, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);
const created = { orgs: [] as string[], users: [] as string[] };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(handler: (req: NextRequest, ctx: any) => Promise<Response>, method: string, path: string, body?: unknown, params?: Record<string, string>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const req = new NextRequest(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const res = await handler(req, { params: Promise.resolve(params ?? {}) });
    let json: Json = {};
    try {
        json = (await res.json()) as Json;
    } catch {
        /* non-JSON */
    }
    return { status: res.status, json };
}

/** A brand-new childcare org with one site and one real admin user; becomes the caller. */
async function newOrg(label: string) {
    const { data: industry } = await supabase.from("industries").select("id").eq("key", CHILDCARE_INDUSTRY_KEY).single();
    const { data: org, error } = await supabase
        .from("orgs")
        .insert({ name: `BP V2 D1 live ${label} ${RUN}`, slug: `bpv2-d1-live-${label}-${RUN}`, industry_id: industry!.id })
        .select("id")
        .single();
    if (error) throw new Error(`org: ${error.message}`);
    created.orgs.push(org.id);
    const email = `bpv2-d1-${label}-${RUN}@example.com`;
    const user = await supabase.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    if (user.error) throw new Error(`user: ${user.error.message}`);
    created.users.push(user.data.user.id);
    // W7-F002: an admin (money-capable) membership requires a link to a named Person first.
    const person = await supabase.from("persons").insert({ org_id: org.id, person_number: 1, first_name: "Live", last_name: `Admin ${RUN}` }).select("id").single();
    if (person.error) throw new Error(`person: ${person.error.message}`);
    const link = await supabase.from("user_person_links").insert({ org_id: org.id, user_id: user.data.user.id, person_id: person.data.id });
    if (link.error) throw new Error(`person link: ${link.error.message}`);
    // A membership must have an access profile at commit.
    const profile = await supabase.from("user_access_profiles").insert({ user_id: user.data.user.id, org_id: org.id, department_scope: "all", site_scope: "all" });
    if (profile.error) throw new Error(`access profile: ${profile.error.message}`);
    const role = await supabase.from("user_roles").insert({ user_id: user.data.user.id, org_id: org.id, role: "admin" });
    if (role.error) throw new Error(`role: ${role.error.message}`);
    const site = await supabase.from("locations").insert({ org_id: org.id, location_number: 1, label: `Site ${RUN}`, location_type: "site", status_key: "active", is_active: true }).select("id").single();
    if (site.error) throw new Error(`site: ${site.error.message}`);
    const grants = await resolveActorPermissionGrants(supabase, org.id, user.data.user.id);
    return { orgId: org.id as string, userId: user.data.user.id, siteId: site.data.id as string, permissionKeys: [...(grants.permissionKeys ?? [])] };
}
const actAs = (o: { orgId: string; userId: string; permissionKeys: string[] }) => (who.current = o);

const draftRev = (j: Json) => j?.draft_revision ?? j?.draft?.draft_revision ?? j?.draftRevision ?? null;

async function department(key: string, name: string) {
    const r = await call(DEPARTMENTS_POST, "POST", "/api/admin/departments", {
        key,
        name,
        metadata: { lifecycle_builder_owned_v1: { source: "lifecycle_builder", created_by: who.current!.userId, created_at: new Date().toISOString(), process_id: null } },
    });
    expect(r.status, JSON.stringify(r.json)).toBeLessThan(300);
    return (r.json.department ?? r.json.item ?? r.json) as { id: string };
}
async function builder(departmentId: string, body: Json) {
    const r = await call(BUILDER_PATCH, "PATCH", `/api/admin/departments/${departmentId}/lifecycle-builder`, body, { departmentId });
    expect(r.status, `${body.action}: ${JSON.stringify(r.json).slice(0, 600)}`).toBe(200);
    return r.json;
}
const publish = (departmentId: string, rev?: number | null) =>
    call(PUBLISH_POST, "POST", "/api/admin/business-process/configuration/publish", { department_id: departmentId, ...(rev != null ? { draft_revision: rev } : {}) });

const stage = (key: string) => [{ field_key: "opportunity_stage", operator: "equals", value: key }];
const ENROLLMENT_VIEWS = [
    { id: "new_leads", label: "New Leads", filters_v1: stage("lead"), row_grain_v1: "family", display_order: 1, visible_in_runtime: true },
    { id: "tours", label: "Tours", filters_v1: stage("tour"), row_grain_v1: "family", display_order: 2, visible_in_runtime: true },
    { id: "decision", label: "Decision", filters_v1: stage("decision"), row_grain_v1: "family", display_order: 3, visible_in_runtime: true },
    { id: "registration", label: "Registration", filters_v1: stage("enrolling"), row_grain_v1: "child", display_order: 4, visible_in_runtime: true },
    { id: "waitlist", label: "Waitlist", filters_v1: stage("waitlist"), row_grain_v1: "child", display_order: 5, visible_in_runtime: true },
    { id: "all", label: "All", filters_v1: [], row_grain_v1: "family", display_order: 6, visible_in_runtime: true },
];

/** The hosted QA configuration sequence, up to (not including) publication. */
async function enrollmentDraft() {
    const d = await department("enrollment", "Enrollment");
    const c = await builder(d.id, { action: "create_process", name: "Enrollment", primary_entity: "opportunity" });
    const processId = (c.active_process?.id ?? c.config?.active_process_id) as string;
    await builder(d.id, { action: "apply_enrollment_v2_template", process_id: processId });
    await builder(d.id, { action: "set_process_entry_point", process_id: processId, intent: "create_lead", stage_key: "lead" });
    const e2 = await builder(d.id, { action: "set_process_entry_point", process_id: processId, intent: "enrollment_start", stage_key: "enrolling" });
    const w = await call(WORK_VIEWS_POST, "POST", "/api/admin/lifecycle-builder/process-work-views", {
        department_id: d.id, process_id: processId, work_views_v1: ENROLLMENT_VIEWS, ...(draftRev(e2) != null ? { draft_revision: draftRev(e2) } : {}),
    });
    expect(w.status, JSON.stringify(w.json).slice(0, 600)).toBe(200);
    return { departmentId: d.id, processId, rev: draftRev(w.json) as number | null };
}

async function projectionDepartment(key: "assignments" | "billing", views: string[]) {
    const d = await department(key, key[0]!.toUpperCase() + key.slice(1));
    const c = await builder(d.id, { action: "create_process", name: key, process_model: { kind: "domain_projection", domain: key } });
    const processId = (c.active_process?.id ?? c.config?.active_process_id) as string;
    const w = await call(WORK_VIEWS_POST, "POST", "/api/admin/lifecycle-builder/process-work-views", {
        department_id: d.id, process_id: processId,
        work_views_v1: views.map((v, i) => ({ id: v, label: v, projection_key: v, display_order: i + 1 })),
        ...(draftRev(c) != null ? { draft_revision: draftRev(c) } : {}),
    });
    expect(w.status, JSON.stringify(w.json).slice(0, 600)).toBe(200);
    return { departmentId: d.id, rev: draftRev(w.json) as number | null };
}

/** Every override row for the org, any is_active — the raw truth, byte-for-byte. */
async function overrideRows(orgId: string) {
    const { data, error } = await supabase
        .from("record_drawer_layouts")
        .select("id, is_active, config_json, created_at, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunity")
        .eq("surface", "drawer")
        .eq("key", "default");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, config_text: JSON.stringify(r.config_json) }));
}

beforeAll(() => {
    if (!live) return;
    supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
    who.client = supabase;
});

afterAll(async () => {
    if (!live) return;
    // An org cannot be deleted through the API while it owns departments, locations, publications, and so on.
    // Fixture orgs are therefore recorded here and removed by
    // certification/business-processes-v2/d1/live-fixture-teardown.sql (slug `bpv2-d1-live-*` only).
    evidence.fixture_orgs_for_teardown = created.orgs;
    evidence.fixture_users_for_teardown = created.users;
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — D1: Enrollment publication provisions the workflow_v1 drawer override", () => {
    let A: Awaited<ReturnType<typeof newOrg>>;
    let enrollment: Awaited<ReturnType<typeof enrollmentDraft>>;
    let opportunityId = "";

    it("1. a new org has no override and resolves the classic global default", async () => {
        A = await newOrg("a");
        actAs(A);
        expect(await overrideRows(A.orgId)).toEqual([]);
        const { data } = await supabase.from("record_layouts").select("config_json").eq("entity_type", "opportunity").eq("is_active", true);
        expect((data ?? []).every((r) => (r.config_json as Json | null)?.inquiry_drawer_mode !== "workflow_v1")).toBe(true);
        record("1_new_org", { org: A.orgId, override_rows: 0, permission_keys: A.permissionKeys.length });
    }, 60_000);

    it("13. Assignments and Billing publications do not provision", async () => {
        const asg = await projectionDepartment("assignments", ["current_assignments", "assignments_ending_soon"]);
        const pa = await publish(asg.departmentId, asg.rev);
        expect(pa.status, JSON.stringify(pa.json).slice(0, 600)).toBe(200);
        const bil = await projectionDepartment("billing", ["charges_needing_review", "payments_due"]);
        const pb = await publish(bil.departmentId, bil.rev);
        expect(pb.status, JSON.stringify(pb.json).slice(0, 600)).toBe(200);
        expect(pa.json.opportunity_drawer_override).toBeUndefined();
        expect(pb.json.opportunity_drawer_override).toBeUndefined();
        expect(await overrideRows(A.orgId)).toEqual([]);
        record("13_projection_publications", { assignments: pa.json.published, billing: pb.json.published, override_rows: 0 });
    }, 120_000);

    it("2-3, 12. Enrollment template applied and validated; a FAILED publish leaves no override", async () => {
        enrollment = await enrollmentDraft();
        const v = await call(VALIDATE_POST, "POST", "/api/admin/business-process/configuration/validate", { department_id: enrollment.departmentId });
        expect(v.status, JSON.stringify(v.json).slice(0, 800)).toBe(200);
        expect(v.json.errors ?? v.json.validation?.errors ?? []).toEqual([]);
        // A stale editor token is refused before anything is written (409): no publication, no override.
        const stale = await publish(enrollment.departmentId, (enrollment.rev ?? 0) + 1000);
        expect(stale.status).toBe(409);
        expect(await overrideRows(A.orgId)).toEqual([]);
        record("12_failed_publish", { status: stale.status, code: stale.json.code, override_rows_after: 0 });
    }, 120_000);

    it("3-4, 12. the retried publish succeeds and provisions exactly the default override", async () => {
        const p = await publish(enrollment.departmentId, enrollment.rev);
        expect(p.status, JSON.stringify(p.json).slice(0, 800)).toBe(200);
        expect(p.json.opportunity_drawer_override).toEqual({ status: "provisioned", processKeys: ["enrollment"] });
        const rows = await overrideRows(A.orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.is_active).toBe(true);
        expect(rows[0]!.config_json).toEqual(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT);
        record("4_provisioned", { published: p.json.published, override_id: rows[0]!.id, config_keys: Object.keys(rows[0]!.config_json as Json).sort() });
        const repair = await call(REPAIR_WORK_UNITS_POST, "POST", "/api/admin/lifecycle-catalog/repair-work-units", { department_id: enrollment.departmentId, process_id: enrollment.processId });
        expect(repair.status, JSON.stringify(repair.json).slice(0, 600)).toBe(200);
    }, 120_000);

    it("9. re-publishing is idempotent: one row, byte-identical, not rewritten", async () => {
        const before = await overrideRows(A.orgId);
        const p = await publish(enrollment.departmentId);
        expect(p.status, JSON.stringify(p.json).slice(0, 600)).toBe(200);
        expect(p.json.opportunity_drawer_override).toEqual({ status: "already_present", processKeys: ["enrollment"], id: before[0]!.id });
        expect(await overrideRows(A.orgId)).toEqual(before);
        record("9_republish", { already_published: p.json.published?.already_published, rows: 1, byte_identical: true });
    }, 60_000);

    it("5-6. Create Lead, then the drawer view-model opens the record (no classic_layout_deferred)", async () => {
        // The entry stage's work unit, as hosted QA configured it (Create Lead places the lead there).
        const wu = await call(STAGE_WORK_UNIT_POST, "POST", "/api/admin/enrollment-process/stage-work-unit", { department_id: enrollment.departmentId, stage: "lead", status_keys: ["open"] });
        expect(wu.status, JSON.stringify(wu.json).slice(0, 600)).toBeLessThan(300);
        const lead = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", {
            action_key: "create_lead", entity_type: "opportunity", confirmation: { confirmed: true }, context: { department_id: enrollment.departmentId },
            payload: { first_name: "Live", last_name: `D1${RUN}`, email: `bpv2-d1-lead-${RUN}@example.com`, location_id: A.siteId, child_first_name: "Ava", child_last_name: `D1${RUN}`, child_date_of_birth: "2021-09-01" },
        });
        expect(lead.status, JSON.stringify(lead.json).slice(0, 800)).toBe(200);
        const er = lead.json.data?.execution_result ?? {};
        opportunityId = er.opportunity_id;
        expect(opportunityId).toBeTruthy();
        expect(er.stage_key).toBe("lead");
        const vm = await call(DRAWER_VM_GET, "GET", `/api/admin/view-models/drawer/opportunity/${opportunityId}?department_id=${enrollment.departmentId}`, undefined, { id: opportunityId });
        const text = JSON.stringify(vm.json);
        expect(vm.status, text.slice(0, 800)).toBe(200);
        expect(text).not.toContain("classic_layout_deferred");
        expect(text).not.toContain("layout_unavailable");
        expect(vm.json.ok ?? true).not.toBe(false);
        record("5_6_create_lead_and_view_model", { opportunity: opportunityId, stage_key: er.stage_key, vm_status: vm.status, vm_keys: Object.keys(vm.json).slice(0, 20) });
    }, 180_000);

    it("D3. a lead closed as Lost lands on the terminal stage with no work templates; both panel reads are measured", async () => {
        const tasks = await call(OPERATIONAL_TASKS_GET, "GET", `/api/admin/operational-tasks?entity_type=opportunities&entity_id=${opportunityId}`);
        expect(tasks.status, JSON.stringify(tasks.json).slice(0, 400)).toBe(200);
        const open = ((tasks.json.tasks ?? tasks.json.items ?? []) as Json[]).find((t) => t.status === "open");
        expect(open, "the Lead stage work Create Lead opens").toBeTruthy();
        const closed = await call(COMPLETE_STAGE_WORK_POST, "POST", "/api/admin/lifecycle-builder/complete-stage-work", {
            department_id: enrollment.departmentId, stage_key: "lead", work_id: open!.id, outcome_key: "not_interested",
            subject: { journey_segment: "family", opportunity_id: opportunityId },
        });
        expect(closed.status, JSON.stringify(closed.json).slice(0, 800)).toBe(200);
        const { data: opp } = await supabase.from("opportunities").select("stage_key, status_key, work_unit_id").eq("id", opportunityId).single();
        expect(opp!.stage_key).toBe("closed");
        const published = await loadPublishedConfiguration(supabase, { orgId: A.orgId, departmentId: enrollment.departmentId });
        const closedStage = ((published as Json)?.processes?.[0]?.stages ?? []).find((st: Json) => st.key === "closed");
        const templates = closedStage?.stage_operating_plan_v1?.work_templates ?? [];
        expect(templates).toEqual([]);

        const vm = await call(DRAWER_VM_GET, "GET", `/api/admin/view-models/drawer/opportunity/${opportunityId}?department_id=${enrollment.departmentId}`, undefined, { id: opportunityId });
        // Work View links route by the work unit's KEY (the route resolves slugs, not ids).
        const { data: wu } = await supabase.from("work_units").select("key").eq("id", opp!.work_unit_id).maybeSingle();
        const slug = String(wu?.key ?? "");
        const answer = slug
            ? await call(PROVISIONING_ANSWER_GET, "GET", `/api/admin/work-units/${slug}/provisioning-answer?work_view_id=all&subject_id=${opportunityId}`, undefined, { id: slug })
            : null;
        const brief = (j: Json | undefined) => JSON.stringify(j ?? null).slice(0, 1200);
        record("D3_closed_record", {
            opportunity: { stage_key: opp!.stage_key, status_key: opp!.status_key, work_unit_id: opp!.work_unit_id },
            closed_stage_work_templates: templates.length,
            drawer_view_model: { status: vm.status, reason: vm.json.reason ?? null, keys: Object.keys(vm.json).slice(0, 14) },
            provisioning_answer: answer && { status: answer.status, body: brief(answer.json) },
        });
        expect(vm.status, brief(vm.json)).toBe(200);

        // Scope: is the refusal per selected subject, or does a closed family poison the whole view?
        const second = await call(ACTIONS_EXECUTE, "POST", "/api/admin/actions/execute", {
            action_key: "create_lead", entity_type: "opportunity", confirmation: { confirmed: true }, context: { department_id: enrollment.departmentId },
            payload: { first_name: "Open", last_name: `D3${RUN}`, email: `bpv2-d1-open-${RUN}@example.com`, location_id: A.siteId, child_first_name: "Ben", child_last_name: `D3${RUN}`, child_date_of_birth: "2022-03-01" },
        });
        expect(second.status, brief(second.json)).toBe(200);
        const openId = second.json.data?.execution_result?.opportunity_id as string;
        const answerFor = async (q: string) => {
            const r = await call(PROVISIONING_ANSWER_GET, "GET", `/api/admin/work-units/${slug}/provisioning-answer?work_view_id=all${q}`, undefined, { id: slug });
            return { status: r.status, terminal: r.json.terminal ?? null, code: r.json.code ?? null, rows: (r.json.queueFrame?.rows ?? []).map((x: Json) => x.stageKey) };
        };
        const scope = {
            closed_subject: await answerFor(`&subject_id=${opportunityId}`),
            open_subject: await answerFor(`&subject_id=${openId}`),
            no_subject: await answerFor(""),
        };
        record("D3_scope", scope);
        // The answer for an OPEN lead in the same view is not refused by the closed row beside it.
        expect(scope.open_subject.code).not.toBe("no_truthful_primary_action");
    }, 180_000);

    it("7-8. the Focus Panel summary (Surfaces) read answers for the same record", async () => {
        const s = await call(FOCUS_SUMMARY_GET, "GET", `/api/admin/entity-layouts/focus-panel-summary?businessProcessKey=enrollment&stageKey=lead`);
        expect(s.status, JSON.stringify(s.json).slice(0, 600)).toBe(200);
        record("7_8_focus_summary", { status: s.status, keys: Object.keys(s.json).slice(0, 12) });
    }, 60_000);

    it("10. a customized workflow_v1 override survives re-publication byte-identical", async () => {
        const custom = { ...structuredClone(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT), overview_section_order: ["inquiry_tuition", "inquiry_children"], operator_note: RUN };
        const w = await persistOpportunityDrawerLayoutConfig(supabase, A.orgId, custom as never);
        expect(w).toEqual({ ok: true, created_org_override: false });
        const before = await overrideRows(A.orgId);
        const p = await publish(enrollment.departmentId);
        expect(p.status).toBe(200);
        expect(p.json.opportunity_drawer_override.status).toBe("already_present");
        expect(await overrideRows(A.orgId)).toEqual(before);
        record("10_customized_preserved", { updated_at: before[0]!.updated_at, byte_identical: true });
    }, 60_000);

    it("11. classic, inactive and malformed overrides are reported, never overwritten", async () => {
        const payload = await loadPublishedConfiguration(supabase, { orgId: A.orgId, departmentId: enrollment.departmentId });
        const cases: Array<[string, { is_active: boolean; config_json: unknown }, string]> = [
            ["classic", { is_active: true, config_json: { version: 2 } }, "conflicting"],
            ["inactive", { is_active: false, config_json: { inquiry_drawer_mode: "workflow_v1" } }, "inactive"],
            ["malformed", { is_active: true, config_json: ["not", "an", "object"] }, "invalid"],
        ];
        const out: Record<string, unknown> = {};
        for (const [label, row, kind] of cases) {
            const o = await newOrg(`c-${label}`);
            const ins = await supabase.from("record_drawer_layouts").insert({ org_id: o.orgId, entity_type: "opportunity", surface: "drawer", key: "default", ...row });
            expect(ins.error).toBeNull();
            const before = await overrideRows(o.orgId);
            const r = await ensureEnrollmentOpportunityDrawerOverride(supabase, { orgId: o.orgId, publishedPayload: payload });
            expect(r.status).toBe("blocked");
            expect((r as { state: { kind: string } }).state.kind).toBe(kind);
            expect(await overrideRows(o.orgId)).toEqual(before);
            out[label] = r;
        }
        record("11_conflicting_reported", out);
    }, 180_000);

    it("14. concurrent provisioning for one org creates exactly one row", async () => {
        const payload = await loadPublishedConfiguration(supabase, { orgId: A.orgId, departmentId: enrollment.departmentId });
        const D = await newOrg("d");
        const outcomes = await Promise.all(Array.from({ length: 6 }, () => ensureEnrollmentOpportunityDrawerOverride(supabase, { orgId: D.orgId, publishedPayload: payload })));
        const statuses = outcomes.map((o) => o.status);
        expect(statuses.filter((s) => s === "provisioned")).toHaveLength(1);
        expect(statuses.every((s) => ["provisioned", "provisioned_concurrently", "already_present"].includes(s))).toBe(true);
        const rows = await overrideRows(D.orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.config_json).toEqual(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT);
        // Retry after the race: still one row, unchanged.
        const retry = await ensureEnrollmentOpportunityDrawerOverride(supabase, { orgId: D.orgId, publishedPayload: payload });
        expect(retry.status).toBe("already_present");
        expect(await overrideRows(D.orgId)).toEqual(rows);
        record("14_concurrency", { statuses, rows: 1 });
    }, 120_000);
});
