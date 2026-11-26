/**
 * BP V2 Slice 4 — LIVE: an Assignments Work View row opens the EXISTING durable record on the EXISTING
 * Scheduling card, targeted at the row's source, over real local-certification data (Northwind).
 *
 * Every step is the production server path the record route takes — `loadSubjectContexts` (with the
 * row's site), `durableRecordContextOptions`, the canonical child/staff scheduling composers — and the
 * card's own resolution (`resolveSchedulingFocus`). The one write is a REGISTERED command executed
 * through `executeCommandInvocation`, the same entry `/api/admin/actions/execute` calls.
 *
 * Fixtures: three assignments cloned from real rows (marked `source_key = bpv2_s4_fixture`), deleted
 * afterwards. Measurements are written to BPV2_LIVE_EVIDENCE.
 */
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionRow, DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { loadSubjectContexts } from "@/lib/context/loadSubjectContexts";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";
import { composeDurableChildScheduling } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildScheduling";
import { composeDurableStaffScheduling } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { ExecuteCommandInvocationRequest } from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { resolveAttentionTarget } from "@/lib/workUnits/operatorFocusTarget";
import { resolveSchedulingFocus, type SchedulingFocusProjection } from "@/lib/runtime/focus/durableRecordFocusSource";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const FIXTURE = "bpv2_s4_fixture";
// Real rows the fixtures are cloned from (two children with 53 live assignments each at Riverside).
const SRC_ENDING = "5d40ddc4-bb9d-47f9-b370-d5bad5520d4c";
const SRC_UPCOMING = "3c8c7869-1a1a-4584-83c3-132fecdc4f4a";
const SRC_PROPOSED = "92e2e44f-ec1c-4efa-ab25-01a83f92bb9e";

const ALL: AdminAccessScopeDimensions = { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } as AdminAccessScopeDimensions;
const ONLY_LAKESIDE: AdminAccessScopeDimensions = { departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: [LAKESIDE] } as AdminAccessScopeDimensions;
const SCOPE_ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };

const addDays = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);

async function clone(sourceId: string, overrides: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.from("schedule_assignments").select("*").eq("id", sourceId).single();
    if (error || !data) throw new Error(`fixture source ${sourceId}: ${error?.message}`);
    const id = randomUUID();
    const row = { ...data, id, supersedes_assignment_id: null, source_key: FIXTURE, metadata: { ...(data.metadata ?? {}), bpv2_s4_fixture: true }, created_at: undefined, updated_at: undefined, ...overrides };
    const ins = await supabase.from("schedule_assignments").insert(row);
    if (ins.error) throw new Error(`fixture insert: ${ins.error.message}`);
    return id;
}

/** The record route's own server path for one row: contexts at the row's site → canonical projection → the card's resolution. */
async function openRow(row: DomainProjectionRow, dims: AdminAccessScopeDimensions = ALL) {
    const grain = row.subject.type === "person" ? "person" : "child";
    const kind = grain === "person" ? "staff" : "child";
    const contexts = await loadSubjectContexts({
        supabase, orgId: ORG, dimensions: dims,
        subject: { grain, id: row.subject.id },
        scheduleSiteId: row.detail?.siteLocationId ?? row.siteLocationId ?? null,
    });
    const options = durableRecordContextOptions(contexts);
    const schedule = options.find((o) => o.surface === "canonical_operational" && o.siteLocationId) ?? null;
    const scheduleCtx = contexts.find((c) => c.kind === "schedule") ?? null;
    const first = schedule?.siteLocationId
        ? grain === "child"
            ? await composeDurableChildScheduling({ supabase, orgId: ORG, memberId: row.subject.id, subjectName: row.label, siteLocationId: schedule.siteLocationId })
            : await composeDurableStaffScheduling({ supabase, orgId: ORG, personId: row.subject.id, subjectName: row.label, siteLocationId: schedule.siteLocationId })
        : null;
    const projection = (first?.byMemberId?.[row.subject.id] ?? null) as (SchedulingFocusProjection & { current?: { assignments: { id: string }[] } | null }) | null;
    const resolution = resolveSchedulingFocus(projection, kind, { kind: row.source.kind, id: row.source.id, reason: row.detail?.reason ?? null });
    return { schedule, scheduleDetail: (scheduleCtx as { detail?: string | null } | null)?.detail ?? null, projection, resolution };
}

const cohort = async (projectionKey: string) => {
    const c = await loadDomainProjectionCohort(supabase, { domain: "assignments", projectionKey, orgId: ORG, userId: null, scope: SCOPE_ALL });
    if (c.status !== "ok") throw new Error(`${projectionKey}: ${JSON.stringify(c)}`);
    return c.rows;
};

afterAll(async () => {
    if (!live) return;
    await supabase.from("schedule_assignments").delete().eq("org_id", ORG).eq("source_key", FIXTURE);
    const { count } = await supabase.from("schedule_assignments").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("source_key", FIXTURE);
    evidence.fixtures_remaining = count ?? null;
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — S4: the five Assignments views open the existing Scheduling card on their source", () => {
    it("targets, refuses, executes through the command runtime, and reports stale context honestly", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ORG);
        evidence.today = today;
        const ending = await clone(SRC_ENDING, { end_date: addDays(today, 5), status: "active" });
        const upcoming = await clone(SRC_UPCOMING, { start_date: addDays(today, 7), end_date: null, status: "planned" });
        const proposed = await clone(SRC_PROPOSED, { start_date: addDays(today, 14), end_date: null, status: "planned", commitment_kind: "proposed", enrollment_agreement_id: null });
        evidence.fixtures = { ending, upcoming, proposed };

        // 1/2 — Current Assignments: a child, and the staff person.
        const current = await cohort("current_assignments");
        const childRow = current.find((r) => r.subject.type === "child" && (r.source.count ?? 0) > 2)!;
        const staffRow = current.find((r) => r.subject.type === "person")!;
        const c1 = await openRow(childRow);
        const c2 = await openRow(staffRow);
        expect(c1.schedule?.key).toBe("schedule");
        expect(c1.schedule?.siteLocationId).toBe(childRow.detail?.siteLocationId);
        expect(c1.resolution).toEqual({ status: "assignment", assignmentId: childRow.source.id, bucket: "current" });
        expect(c2.resolution).toEqual({ status: "assignment", assignmentId: staffRow.source.id, bucket: "current" });
        record("1_current_child", { subject: childRow.subject, source: childRow.source, schedule_site: c1.schedule?.siteLocationId, resolution: c1.resolution, assignments_on_card: c1.projection?.current?.assignments.length });
        record("2_current_staff", { subject: staffRow.subject, source: staffRow.source, schedule_site: c2.schedule?.siteLocationId, resolution: c2.resolution });

        // 7 — many assignments: every id resolves to ITSELF, never by position.
        const siblings = (c1.projection?.current?.assignments ?? []).map((a) => a.id);
        expect(siblings.length).toBeGreaterThan(2);
        const picks = [siblings[siblings.length - 1]!, siblings[Math.floor(siblings.length / 2)]!, siblings[1]!];
        for (const id of picks) {
            expect(resolveSchedulingFocus(c1.projection, "child", { kind: "schedule_assignment", id, reason: null })).toEqual({ status: "assignment", assignmentId: id, bucket: "current" });
        }
        record("7_multiple", { subject: childRow.subject, assignments: siblings.length, probed: picks.length, each_resolved_to_itself: true });

        // 3 — Ending Soon: the fixture row, its end date, the current bucket.
        const endingRow = (await cohort("assignments_ending_soon")).find((r) => r.source.id === ending)!;
        expect(endingRow.detail?.endDate).toBe(addDays(today, 5));
        const e = await openRow(endingRow);
        expect(e.resolution).toEqual({ status: "assignment", assignmentId: ending, bucket: "current" });
        record("3_ending", { source: endingRow.source, end: endingRow.detail?.endDate, reason: endingRow.detail?.reason, resolution: e.resolution });

        // 4 — Upcoming Changes: the FUTURE assignment, found in the projection's upcoming views, not the current list.
        const upRow = (await cohort("assignments_upcoming_changes")).find((r) => r.source.id === upcoming)!;
        const u = await openRow(upRow);
        expect(u.resolution).toEqual({ status: "assignment", assignmentId: upcoming, bucket: "upcoming" });
        expect((u.projection?.current?.assignments ?? []).some((a) => a.id === upcoming)).toBe(false);
        record("4_upcoming", { source: upRow.source, start: upRow.detail?.startDate, reason: upRow.detail?.reason, resolution: u.resolution });

        // 6 — Proposed / Incomplete: the proposed row.
        const propRow = (await cohort("assignments_proposed_incomplete")).find((r) => r.source.id === proposed)!;
        const pr = await openRow(propRow);
        expect(pr.resolution).toEqual({ status: "assignment", assignmentId: proposed, bucket: "proposed" });
        record("6_proposed", { source: propRow.source, reason: propRow.detail?.reason, resolution: pr.resolution });

        // 5 — Schedule Gaps: the child's agreement, no manufactured assignment; the Assignment context exists AT the agreement's site.
        const gapRow = (await cohort("schedule_gaps"))[0]!;
        const g = await openRow(gapRow);
        expect(gapRow.source.kind).toBe("enrollment_agreement");
        expect(g.schedule?.siteLocationId).toBe(gapRow.detail?.siteLocationId);
        expect(g.scheduleDetail).toBe("Not yet assigned");
        expect(["agreement_unscheduled", "agreement_elsewhere"]).toContain(g.resolution.status);
        record("5_gap", { subject: gapRow.subject, source: gapRow.source, schedule_site: g.schedule?.siteLocationId, schedule_detail: g.scheduleDetail, projection_agreement: g.projection?.enrollmentAgreementId ?? null, resolution: g.resolution });

        // 9 — scope: a requested site outside the actor's scope is ignored (no context invented), and the record itself does not resolve.
        const gapOutside = (await cohort("schedule_gaps")).find((r) => r.detail?.siteLocationId && r.detail.siteLocationId !== LAKESIDE)!;
        const gIn = await openRow(gapOutside, ALL);
        const gOut = await openRow(gapOutside, ONLY_LAKESIDE);
        expect(gIn.schedule?.siteLocationId).toBe(gapOutside.detail?.siteLocationId);
        expect(gOut.schedule?.siteLocationId ?? null).not.toBe(gapOutside.detail?.siteLocationId);
        const target = await resolveAttentionTarget({ supabase, orgId: ORG, dimensions: ONLY_LAKESIDE, entityType: "customer_members", entityId: childRow.subject.id });
        expect(childRow.detail?.siteLocationId).toBe(RIVERSIDE);
        expect(target).toBeNull();
        record("9_scope", { gap_site: gapOutside.detail?.siteLocationId, in_scope_schedule_site: gIn.schedule?.siteLocationId ?? null, out_of_scope_schedule_site: gOut.schedule?.siteLocationId ?? null, riverside_child_resolves_for_lakeside_actor: target !== null });

        // 19 — a refused command changes nothing.
        const exec = (assignmentId: string, entityId: string) =>
            executeCommandInvocation({
                request: {
                    invocation: {
                        commandKey: "assignment.archive", origin: "operator", operationalContext: "focus_panel", surface: "focus_panel",
                        workUnitId: null, processKey: null, providedSubject: { entityType: "child", entityId }, inputValues: { assignment_id: assignmentId },
                    } as ExecuteCommandInvocationRequest["invocation"],
                    mode: "execute",
                    executionSubject: { entityType: "child", entityId },
                    departmentId: null, workUnitId: null,
                },
                server: { orgId: ORG, userId: ADMIN, actorRole: "admin", accessScope: ALL, supabase },
            });
        const before = await supabase.from("schedule_assignments").select("id, status, end_date").eq("id", ending).single();
        const refused = await exec(randomUUID(), endingRow.subject.id);
        const after = await supabase.from("schedule_assignments").select("id, status, end_date").eq("id", ending).single();
        expect(refused.ok).toBe(false);
        expect(after.data).toEqual(before.data);
        record("19_refused", { ok: refused.ok, status: (refused as { status?: string }).status ?? null, fixture_unchanged: true });

        // 17/18 — a safe command through the existing runtime → canonical writer; the view's membership moves; 8 — the stale source is SAID.
        const done = await exec(ending, endingRow.subject.id);
        expect(done.ok).toBe(true);
        const archived = await supabase.from("schedule_assignments").select("status, end_date").eq("id", ending).single();
        expect(archived.data?.status).toBe("ended");
        const endingAfter = await cohort("assignments_ending_soon");
        expect(endingAfter.some((r) => r.source.id === ending)).toBe(false);
        const stale = await openRow(endingRow);
        expect(stale.resolution).toEqual({ status: "assignment_gone", assignmentId: ending });
        record("17_18_8_command", {
            ok: done.ok,
            owner: done.ok ? done.executionOwner : null,
            capability: done.ok ? done.canonicalCapabilityKey : null,
            row_after: archived.data,
            ending_view_still_lists_it: false,
            stale_resolution: stale.resolution,
        });
    }, 180_000);
});
