/**
 * BP V2 D7 — LIVE: a Work View whose declared Row Grain contradicts the stages it filters is refused at
 * publication, through draft → validate → publish.
 *
 * REAL: the Business Process builder, the Work View draft route, validate, publish, the publish validator,
 * and the production access chain for a real admin. MOCKED: only WHO IS SIGNED IN (`cachedAuthSession`).
 * A fresh org (slug `bpv2-d7-live-*`), removed by certification/business-processes-v2/d6d7/live-fixture-teardown.sql.
 * Firefly is never touched; its compatibility is proven read-only (workViewGrainFireflyCompatibility.test.ts).
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
import { POST as VALIDATE_POST } from "@/app/api/admin/business-process/configuration/validate/route";
import { POST as PUBLISH_POST } from "@/app/api/admin/business-process/configuration/publish/route";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const live = Boolean(URL_ && KEY);
const RUN = randomUUID().slice(0, 8);

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { run: RUN, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);
const created = { orgs: [] as string[], users: [] as string[] };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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

async function newOrgAdmin(): Promise<{ orgId: string; userId: string; email: string }> {
    const { data: industry } = await supabase.from("industries").select("id").eq("key", "childcare").single();
    const { data: org, error } = await supabase.from("orgs").insert({ name: `BP V2 D7 live ${RUN}`, slug: `bpv2-d7-live-${RUN}`, industry_id: industry!.id }).select("id").single();
    if (error) throw new Error(`org: ${error.message}`);
    created.orgs.push(org.id);
    const email = `bpv2-d7-admin-${RUN}@example.com`;
    const u = await supabase.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    if (u.error) throw new Error(`user: ${u.error.message}`);
    created.users.push(u.data.user.id);
    const person = await supabase.from("persons").insert({ org_id: org.id, person_number: 700000 + Math.floor(Math.random() * 200000), first_name: "D7", last_name: `admin ${RUN}` }).select("id").single();
    if (person.error) throw new Error(`person: ${person.error.message}`);
    for (const r of [
        await supabase.from("user_person_links").insert({ org_id: org.id, user_id: u.data.user.id, person_id: person.data.id }),
        await supabase.from("user_access_profiles").insert({ user_id: u.data.user.id, org_id: org.id, department_scope: "all", site_scope: "all" }),
        await supabase.from("user_roles").insert({ user_id: u.data.user.id, org_id: org.id, role: "admin" }),
    ]) if (r.error) throw new Error(`admin: ${r.error.message}`);
    return { orgId: org.id, userId: u.data.user.id, email };
}

/** A department with one process, created through the builder exactly as an operator would. */
async function department(key: string, name: string, model: "staged_lifecycle" | "assignments" | "billing") {
    const d = await call(DEPARTMENTS_POST, "POST", "/api/admin/departments", { key, name, metadata: { lifecycle_builder_owned_v1: { source: "lifecycle_builder", created_by: who.userId, created_at: new Date().toISOString(), process_id: null } } });
    expect(d.status, JSON.stringify(d.json).slice(0, 400)).toBeLessThan(300);
    const departmentId = (d.json.department ?? d.json.item ?? d.json).id as string;
    const b = await call(BUILDER_PATCH, "PATCH", `/api/admin/departments/${departmentId}/lifecycle-builder`, {
        action: "create_process", name, ...(model === "staged_lifecycle" ? { primary_entity: "opportunity" } : { process_model: { kind: "domain_projection", domain: model } }),
    }, { departmentId });
    expect(b.status, JSON.stringify(b.json).slice(0, 400)).toBe(200);
    const processId = (b.json.active_process?.id ?? b.json.config?.active_process_id) as string;
    return { departmentId, processId };
}

async function draftRevision(departmentId: string): Promise<number> {
    const { data } = await supabase.from("business_process_drafts").select("draft_revision").eq("department_id", departmentId).single();
    return Number(data!.draft_revision);
}

/** Draft the views, validate, then try to publish. Returns every step's outcome. */
async function draftValidatePublish(dept: { departmentId: string; processId: string }, views: Json[]) {
    const w = await call(WORK_VIEWS_POST, "POST", "/api/admin/lifecycle-builder/process-work-views", { department_id: dept.departmentId, process_id: dept.processId, work_views_v1: views, draft_revision: await draftRevision(dept.departmentId) });
    expect(w.status, `draft: ${JSON.stringify(w.json).slice(0, 500)}`).toBe(200);
    const v = await call(VALIDATE_POST, "POST", "/api/admin/business-process/configuration/validate", { department_id: dept.departmentId });
    expect(v.status, `validate: ${JSON.stringify(v.json).slice(0, 500)}`).toBe(200);
    const p = await call(PUBLISH_POST, "POST", "/api/admin/business-process/configuration/publish", { department_id: dept.departmentId, draft_revision: await draftRevision(dept.departmentId) });
    const grainErrors = (e: Json[] | undefined) => (e ?? []).filter((x) => x.code === "work_view_grain_mismatch");
    return {
        validate: {
            can_publish: v.json.can_publish,
            errors: (v.json.errors as Json[]).map((e) => e.code),
            grain: grainErrors(v.json.errors),
            mixed: ((v.json.warnings ?? []) as Json[]).filter((x) => x.code === "work_view_grain_mixed"),
        },
        publish: { status: p.status, code: p.json.code ?? null, grain: grainErrors(p.json.errors) },
    };
}

const stage = (...keys: string[]) => [{ field_key: "opportunity_stage", operator: keys.length > 1 ? "is_any_of" : "equals", value: keys.length > 1 ? keys : keys[0] }];
const view = (id: string, label: string, filters: Json[], row_grain_v1?: string) => ({ id, label, filters_v1: filters, ...(row_grain_v1 ? { row_grain_v1 } : {}), display_order: 1, visible_in_runtime: true });

let enrollment: { departmentId: string; processId: string };

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

describe.skipIf(!live)("live — D7: Work View Row Grain vs the stages it filters, at publication", () => {
    it("setup: an isolated org whose Enrollment process is the template (family lead/tour/decision, child waitlist/enrolling/enrolled)", async () => {
        const admin = await newOrgAdmin();
        who.userId = admin.userId;
        who.email = admin.email;
        enrollment = await department("enrollment", "Enrollment", "staged_lifecycle");
        const t = await call(BUILDER_PATCH, "PATCH", `/api/admin/departments/${enrollment.departmentId}/lifecycle-builder`, { action: "apply_enrollment_v2_template", process_id: enrollment.processId }, { departmentId: enrollment.departmentId });
        expect(t.status, JSON.stringify(t.json).slice(0, 400)).toBe(200);
        const stages = ((t.json.active_process ?? t.json.config?.processes?.[0])?.stages ?? []) as Json[];
        record("template_stages", stages.map((s) => ({ key: s.key, grain: s.grain ?? null, segment: s.stage_operating_plan_v1?.journey_segment ?? null })));
    });

    const enrollmentCases: [string, Json[], { refused: false; mixed?: { view: string; stages: string[] } } | { refused: true; view: string; stages: string[] }][] = [
        ["1 · valid family-grain view", [view("decision", "Decision", stage("decision"), "family")], { refused: false }],
        ["2 · valid child-grain view", [view("registration", "Registration", stage("enrolling"), "child")], { refused: false }],
        ["3 · family view filtering a child stage", [view("fam_on_child", "Family on Enrolling", stage("enrolling"), "family")], { refused: true, view: "fam_on_child", stages: ["enrolling"] }],
        ["4 · child view filtering a family stage", [view("child_on_fam", "Children in Decision", stage("decision"), "child")], { refused: true, view: "child_on_fam", stages: ["decision"] }],
        ["5 · multiple compatible stages", [view("pipeline", "Pipeline", stage("lead", "tour", "decision"), "family"), view("children", "Children", stage("waitlist", "enrolling", "enrolled"), "child")], { refused: false }],
        ["6a · mixed stages, none holding the declared grain", [view("all_child", "Children's stages as families", stage("waitlist", "enrolling"), "family")], { refused: true, view: "all_child", stages: ["waitlist", "enrolling"] }],
        // The shape of Firefly's published Decision view (decision + offered, family): the runtime serves it, so it
        // publishes — with a warning naming the stages that hold the other subject.
        ["6b · mixed stages, one holding the declared grain", [view("mixed", "Decision to Enrolled", stage("decision", "waitlist", "enrolling"), "family")], { refused: false, mixed: { view: "mixed", stages: ["waitlist", "enrolling"] } }],
        ["7 · legacy Work View defaults (no declared grain)", [
            view("legacy_registration", "Registration", stage("enrolling")),
            view("legacy_waitlist", "Waitlist", stage("waitlist")),
            view("legacy_all", "All", []),
            { id: "legacy_compat", label: "New Leads", compat_queue_key: "new_leads", display_order: 4 },
        ], { refused: false }],
    ];

    for (const [label, views, expected] of enrollmentCases) {
        it(`${label}: ${expected.refused ? "refused" : "publishes"}`, async () => {
            const r = await draftValidatePublish(enrollment, views);
            record(label, r);
            if (!expected.refused) {
                expect(r.validate.grain).toEqual([]);
                expect(r.validate.mixed.map((w: Json) => [w.detail.work_view_id, w.detail.incompatible_stages.map((x: Json) => x.stage_key)]))
                    .toEqual(expected.mixed ? [[expected.mixed.view, expected.mixed.stages]] : []);
                expect(r.validate.can_publish, JSON.stringify(r)).toBe(true);
                expect(r.publish.status, JSON.stringify(r)).toBe(200);
                return;
            }
            expect(r.validate.can_publish).toBe(false);
            expect(r.validate.grain).toHaveLength(1);
            expect(r.validate.grain[0].detail.work_view_id).toBe(expected.view);
            expect(r.validate.grain[0].detail.incompatible_stages.map((s: Json) => s.stage_key)).toEqual(expected.stages);
            expect(r.validate.grain[0].path.endsWith(`.work_views_v1[${expected.view}].row_grain_v1`)).toBe(true);
            expect(r.publish.status).toBe(422);
            expect(r.publish.code).toBe("business_process_publication_blocked");
            expect(r.publish.grain.map((e: Json) => e.detail.work_view_id)).toEqual([expected.view]);
        });
    }

    it("8 · Assignments projection configuration publishes (projection views are not stage lenses)", async () => {
        const dept = await department("assignments", "Assignments", "assignments");
        const r = await draftValidatePublish(dept, [
            { id: "current", label: "Current assignments", projection_key: "current_assignments", display_order: 1, visible_in_runtime: true },
            { id: "ending", label: "Ending soon", projection_key: "assignments_ending_soon", display_order: 2, visible_in_runtime: true },
        ]);
        record("8 · assignments", r);
        expect(r.validate.errors).toEqual([]);
        expect(r.publish.status, JSON.stringify(r)).toBe(200);
    });

    it("9 · Billing projection configuration publishes", async () => {
        const dept = await department("billing", "Billing", "billing");
        const r = await draftValidatePublish(dept, [
            { id: "review", label: "Charges needing review", projection_key: "charges_needing_review", display_order: 1, visible_in_runtime: true },
            { id: "overdue", label: "Overdue payments", projection_key: "overdue_payments", display_order: 2, visible_in_runtime: true },
        ]);
        record("9 · billing", r);
        expect(r.validate.errors).toEqual([]);
        expect(r.publish.status, JSON.stringify(r)).toBe(200);
    });
});
