/**
 * Assignments · `current_assignments` — children and staff who hold an assignment that is ACTIVE today.
 *
 * Read-only over `schedule_assignments`, the single ledger for child and staff assignments. "Active
 * today" is NOT decided here: every candidate is passed through `resolveAssignmentLifecycleState`, the
 * canonical operator lifecycle resolver, against the org-local calendar day. The SQL narrows the read
 * only — it is a strict superset of what that resolver can call Active (dates cover today; status not
 * terminal or archived), so the resolver, not this file, owns the meaning.
 *
 * Cardinality (effective-dated-assignment-doctrine § cardinality): a child holds at most one
 * operational primary per agreement; a staff member may hold several non-overlapping primaries
 * (present + future) and any number of secondaries. Rows here are per SUBJECT: the representative
 * source is the subject's Active primary when it has one, else its earliest Active assignment, and
 * `source.count` says how many Active assignments the subject holds. A subject therefore appears once
 * however many assignments put it here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import type {
    DomainProjectionContext,
    DomainProjectionDefinition,
    DomainProjectionRow,
} from "@/lib/businessProcesses/projections/domainProjectionTypes";

/** Rows per PostgREST page — below the 1000-row server cap, so a page is never silently clipped. */
export const ASSIGNMENT_PAGE_SIZE = 500;
/** Hard bound on source rows read. Reaching it marks the cohort truncated; it never guesses a total. */
export const ASSIGNMENT_READ_CAP = 5000;
const NAME_CHUNK = 200;

/** Statuses the canonical resolver can never call Active. Excluding them only narrows the read. */
const NEVER_ACTIVE_STATUSES = ["ended", "canceled", "cancelled", "superseded", "archived"] as const;

type AssignmentRow = {
    id: string;
    subject_type: string | null;
    customer_member_id: string | null;
    subject_person_id: string | null;
    site_location_id: string | null;
    is_primary: boolean | null;
    status: string | null;
    commitment_kind: string | null;
    start_date: string | null;
    end_date: string | null;
};

function chunks<T>(xs: readonly T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
}

function fullName(first: unknown, last: unknown, fallback: string): string {
    const n = [first, last].filter((v) => typeof v === "string" && v.trim()).join(" ").trim();
    return n || fallback;
}

export async function loadCurrentAssignments(
    supabase: SupabaseClient,
    ctx: DomainProjectionContext,
    opts: { todayYmd?: string; pageSize?: number; readCap?: number } = {},
): Promise<
    | { ok: true; rows: DomainProjectionRow[]; truncated: boolean }
    | { ok: false; code: "projection_unavailable"; message: string }
> {
    const pageSize = opts.pageSize ?? ASSIGNMENT_PAGE_SIZE;
    const readCap = opts.readCap ?? ASSIGNMENT_READ_CAP;
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const restricted = ctx.scope.siteScope === "restricted";
    if (restricted && ctx.scope.allowedSiteLocationIds.length === 0) {
        return { ok: true, rows: [], truncated: false };
    }

    const readPage = async (from: number, to: number) => {
        let q = supabase
            .from("schedule_assignments")
            .select(
                "id, subject_type, customer_member_id, subject_person_id, site_location_id, is_primary, "
                + "status, commitment_kind, start_date, end_date",
            )
            .eq("org_id", ctx.orgId)
            .lte("start_date", today)
            .or(`end_date.is.null,end_date.gte.${today}`)
            .not("status", "in", `(${NEVER_ACTIVE_STATUSES.join(",")})`);
        if (restricted) q = q.in("site_location_id", [...ctx.scope.allowedSiteLocationIds]);
        // A total order so pages never overlap or skip within one read.
        return q.order("id", { ascending: true }).range(from, to);
    };

    const source: AssignmentRow[] = [];
    let truncated = false;
    // `from` advances by what was REQUESTED, so the probe below sits exactly at the bound even when
    // the bound is not a multiple of the page size.
    for (let from = 0; ; from += Math.min(pageSize, readCap - from)) {
        const take = Math.min(pageSize, readCap - from);
        if (take <= 0) {
            // At the bound. Truncated only if a row actually lies beyond it — a cohort of exactly the
            // bound is complete, and calling it truncated would hide a total that is known.
            const probe = await readPage(from, from);
            if (probe.error) return { ok: false, code: "projection_unavailable", message: probe.error.message };
            truncated = (probe.data ?? []).length > 0;
            break;
        }
        const { data, error } = await readPage(from, from + take - 1);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        const page = (data ?? []) as unknown as AssignmentRow[];
        source.push(...page);
        if (page.length < take) break;
    }

    // The canonical resolver decides. Anything it does not call Active is not in this cohort.
    const active = source.filter(
        (a) =>
            resolveAssignmentLifecycleState({
                commitmentKind:
                    a.commitment_kind === "proposed" || a.commitment_kind === "committed" ? a.commitment_kind : null,
                status: a.status,
                effectiveFrom: a.start_date,
                effectiveTo: a.end_date,
                openEnded: a.end_date == null,
                asOf: today,
            }).label === "Active",
    );

    // One row per SUBJECT. Child grain = the child record; staff grain = the person record.
    type Group = { type: "child" | "person"; id: string; items: AssignmentRow[] };
    const groups = new Map<string, Group>();
    for (const a of active) {
        const isStaff = a.subject_type === "staff";
        const subjectId = isStaff ? a.subject_person_id : a.customer_member_id;
        // An assignment whose subject cannot be named cannot open a record; it is not shown elsewhere.
        if (!subjectId) continue;
        const type = isStaff ? ("person" as const) : ("child" as const);
        const key = `${type}:${subjectId}`;
        const g = groups.get(key) ?? { type, id: subjectId, items: [] };
        g.items.push(a);
        groups.set(key, g);
    }

    const childIds = [...groups.values()].filter((g) => g.type === "child").map((g) => g.id);
    const personIds = [...groups.values()].filter((g) => g.type === "person").map((g) => g.id);
    const names = new Map<string, string>();
    for (const part of chunks(childIds, NAME_CHUNK)) {
        const { data, error } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name")
            .eq("org_id", ctx.orgId)
            .in("id", part);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        for (const m of data ?? []) {
            const r = m as { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null };
            names.set(`child:${r.id}`, (r.display_name ?? "").trim() || fullName(r.first_name, r.last_name, "Child"));
        }
    }
    for (const part of chunks(personIds, NAME_CHUNK)) {
        const { data, error } = await supabase
            .from("persons")
            .select("id, first_name, last_name, preferred_name")
            .eq("org_id", ctx.orgId)
            .in("id", part);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        for (const p of data ?? []) {
            const r = p as { id: string; first_name?: string | null; last_name?: string | null; preferred_name?: string | null };
            names.set(
                `person:${r.id}`,
                fullName((r.preferred_name ?? "").trim() || r.first_name, r.last_name, "Staff member"),
            );
        }
    }

    const rows: DomainProjectionRow[] = [];
    for (const [key, g] of groups) {
        const ordered = [...g.items].sort(
            (x, y) =>
                Number(Boolean(y.is_primary)) - Number(Boolean(x.is_primary))
                || String(x.start_date ?? "").localeCompare(String(y.start_date ?? ""))
                || x.id.localeCompare(y.id),
        );
        const rep = ordered[0]!;
        rows.push({
            subject: { type: g.type, id: g.id },
            label: names.get(key) ?? (g.type === "child" ? "Child" : "Staff member"),
            source: {
                kind: "schedule_assignment",
                id: rep.id,
                count: ordered.length,
                statusLabel: rep.is_primary ? "Active primary" : "Active",
            },
            siteLocationId: rep.site_location_id,
        });
    }
    return { ok: true, rows, truncated };
}

export const CURRENT_ASSIGNMENTS_PROJECTION: DomainProjectionDefinition = {
    key: "current_assignments",
    domain: "assignments",
    label: "Current assignments",
    subjectTypes: ["child", "person"],
    load: (supabase, ctx) => loadCurrentAssignments(supabase, ctx),
};
