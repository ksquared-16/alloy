/**
 * Assignments — the five registered projections of BP V2 Slice 3, over ONE read path.
 *
 *   current_assignments          who is assigned today, and where
 *   assignments_ending_soon      assignments that end within the next 30 days (today included)
 *   assignments_upcoming_changes assignments that take effect within the next 30 days
 *   schedule_gaps                operational child agreements with no committed schedule in effect or ahead
 *   assignments_proposed_incomplete  proposed assignments awaiting disposition; committed ones missing their type
 *
 * ── AUTHORITY ──
 *
 * `schedule_assignments` is the single ledger for child and staff assignments. No lifecycle meaning is
 * decided here: every row is classified by `resolveAssignmentLifecycleState` (the canonical operator
 * resolver) against the ORG-LOCAL business date. Stored `status` does not advance with the calendar, so
 * SQL only narrows the read — always to a superset of what the resolver can admit — and the resolver
 * decides. Never "latest row"; never status alone.
 *
 * ── CARDINALITY (effective-dated-assignment-doctrine § cardinality) ──
 *
 * Child primary: at most one operational row per agreement (`ux_schedule_assignments_one_operational_
 * primary_child`); a future change supersedes the present row NOW, so the successor is Upcoming and the
 * predecessor is Completed. Staff primary: the overlap trigger only — a current and a future
 * non-overlapping primary coexist, so the future one is Upcoming and the current one stays Active.
 * Secondaries are concurrent by design.
 *
 * ── GRAIN ──
 *
 * Every view's rows are SUBJECTS (a child or a staff person), one row each, so `total` counts people.
 * The assignments behind them are counted separately (`source.count`, cohort `factTotal`) and never
 * called people. The row's representative source is the assignment (or agreement) that explains WHY the
 * subject is in this view.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAssignmentLifecycleState, type AssignmentLifecycleLabel } from "@/lib/operationalAssignments/assignmentLifecycleState";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import {
    effectiveProjectionSiteIds,
    type DomainProjectionContext,
    type DomainProjectionDefinition,
    type DomainProjectionRow,
} from "@/lib/businessProcesses/projections/domainProjectionTypes";

/** Rows per PostgREST page — below the 1000-row server cap, so a page is never silently clipped. */
export const ASSIGNMENT_PAGE_SIZE = 500;
/** Certified bound on source rows read. Beyond it the cohort is TRUNCATED (no total), never guessed. */
export const ASSIGNMENT_READ_CAP = 5000;
/** The forward window of Ending Soon and Upcoming Changes, in calendar days, today included. */
export const ASSIGNMENT_WINDOW_DAYS = 30;
/**
 * Ids per `in()` batch. Bounded by URL length, not row count: 200 UUIDs (~7.4 KB) were refused with
 * "URI too long" on the certification stack's gateway; 100 (~3.7 KB) leaves room for the other filters.
 */
export const ASSIGNMENT_ID_BATCH = 100;
const CHUNK = ASSIGNMENT_ID_BATCH;

/** Statuses the canonical resolver classifies as Completed/Archived whatever the dates. Narrowing only. */
const TERMINAL_STATUSES = ["ended", "canceled", "cancelled", "superseded", "archived"] as const;

type AssignmentRow = {
    id: string;
    subject_type: string | null;
    customer_member_id: string | null;
    subject_person_id: string | null;
    enrollment_agreement_id: string | null;
    site_location_id: string | null;
    room_location_id: string | null;
    operational_assignment_type_id: string | null;
    supersedes_assignment_id: string | null;
    is_primary: boolean | null;
    status: string | null;
    commitment_kind: string | null;
    start_date: string | null;
    end_date: string | null;
};

const ASSIGNMENT_SELECT =
    "id, subject_type, customer_member_id, subject_person_id, enrollment_agreement_id, site_location_id, "
    + "room_location_id, operational_assignment_type_id, supersedes_assignment_id, is_primary, status, "
    + "commitment_kind, start_date, end_date";

type Loaded = { ok: true; rows: DomainProjectionRow[]; truncated: boolean } | { ok: false; code: "projection_unavailable"; message: string };
type Opts = { todayYmd?: string; pageSize?: number; readCap?: number };

// ── date helpers (whole calendar days on YYYY-MM-DD; zone-free by construction) ──────────────────────
export function addDaysYmd(ymd: string, days: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
export function daysBetweenYmd(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatYmd(ymd: string | null | undefined): string {
    if (!ymd) return "";
    const [, m, d] = ymd.slice(0, 10).split("-");
    return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}
function inDays(n: number): string {
    return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export function lifecycleLabelOf(a: AssignmentRow, today: string): AssignmentLifecycleLabel {
    return resolveAssignmentLifecycleState({
        commitmentKind: a.commitment_kind === "proposed" || a.commitment_kind === "committed" ? a.commitment_kind : null,
        status: a.status,
        effectiveFrom: a.start_date,
        effectiveTo: a.end_date,
        openEnded: a.end_date == null,
        asOf: today,
    }).label;
}

function chunks<T>(xs: readonly T[], n = CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
}

/** Date narrowing for the read — always a SUPERSET of what the view's resolver rule can admit. */
type Narrow = {
    startLte?: string;
    startGt?: string;
    endGte?: string;
    endLte?: string;
    /** `end_date IS NULL OR end_date >= x` — in effect on or after x. */
    openOrEndGte?: string;
};

/**
 * THE read. Paged by a total order (`id`) in pages below the PostgREST cap; bounded by `readCap`, and
 * at the bound truncated ONLY if a row actually lies beyond it. Site scope is applied in the query.
 */
async function readAssignments(
    supabase: SupabaseClient,
    ctx: DomainProjectionContext,
    narrow: Narrow,
    opts: Opts,
): Promise<{ ok: true; rows: AssignmentRow[]; truncated: boolean } | { ok: false; message: string }> {
    const pageSize = opts.pageSize ?? ASSIGNMENT_PAGE_SIZE;
    const readCap = opts.readCap ?? ASSIGNMENT_READ_CAP;
    const sites = effectiveProjectionSiteIds(ctx.scope);
    if (sites && sites.length === 0) return { ok: true, rows: [], truncated: false };
    const page = async (from: number, to: number) => {
        let q = supabase
            .from("schedule_assignments")
            .select(ASSIGNMENT_SELECT)
            .eq("org_id", ctx.orgId)
            .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
        if (narrow.startLte) q = q.lte("start_date", narrow.startLte);
        if (narrow.startGt) q = q.gt("start_date", narrow.startGt);
        if (narrow.endGte) q = q.gte("end_date", narrow.endGte);
        if (narrow.endLte) q = q.lte("end_date", narrow.endLte);
        if (narrow.openOrEndGte) q = q.or(`end_date.is.null,end_date.gte.${narrow.openOrEndGte}`);
        if (sites) q = q.in("site_location_id", sites);
        return q.order("id", { ascending: true }).range(from, to);
    };
    const rows: AssignmentRow[] = [];
    for (let from = 0; ; from += Math.min(pageSize, readCap - from)) {
        const take = Math.min(pageSize, readCap - from);
        if (take <= 0) {
            const probe = await page(from, from);
            if (probe.error) return { ok: false, message: probe.error.message };
            return { ok: true, rows, truncated: (probe.data ?? []).length > 0 };
        }
        const { data, error } = await page(from, from + take - 1);
        if (error) return { ok: false, message: error.message };
        const got = (data ?? []) as unknown as AssignmentRow[];
        rows.push(...got);
        if (got.length < take) return { ok: true, rows, truncated: false };
    }
}

/** Display facts for a set of rows, in a bounded number of batched reads (never per row). */
async function readLabels(
    supabase: SupabaseClient,
    orgId: string,
    childIds: string[],
    personIds: string[],
    locationIds: string[],
    typeIds: string[],
): Promise<{ ok: true; name: Map<string, string>; location: Map<string, string>; type: Map<string, string> } | { ok: false; message: string }> {
    const name = new Map<string, string>();
    const location = new Map<string, string>();
    const type = new Map<string, string>();
    const full = (f?: string | null, l?: string | null) => [f, l].filter((v) => v && v.trim()).join(" ").trim();
    for (const part of chunks([...new Set(childIds)])) {
        const { data, error } = await supabase.from("customer_members").select("id, display_name, first_name, last_name").eq("org_id", orgId).in("id", part);
        if (error) return { ok: false, message: error.message };
        for (const r of (data ?? []) as Array<{ id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null }>) {
            name.set(`child:${r.id}`, (r.display_name ?? "").trim() || full(r.first_name, r.last_name) || "Child");
        }
    }
    for (const part of chunks([...new Set(personIds)])) {
        const { data, error } = await supabase.from("persons").select("id, first_name, last_name, preferred_name").eq("org_id", orgId).in("id", part);
        if (error) return { ok: false, message: error.message };
        for (const r of (data ?? []) as Array<{ id: string; first_name?: string | null; last_name?: string | null; preferred_name?: string | null }>) {
            name.set(`person:${r.id}`, full((r.preferred_name ?? "").trim() || r.first_name, r.last_name) || "Staff member");
        }
    }
    for (const part of chunks([...new Set(locationIds)])) {
        const { data, error } = await supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", part);
        if (error) return { ok: false, message: error.message };
        for (const r of (data ?? []) as Array<{ id: string; label?: string | null }>) if (r.label) location.set(r.id, r.label);
    }
    for (const part of chunks([...new Set(typeIds)])) {
        const { data, error } = await supabase.from("operational_assignment_types").select("id, label").eq("org_id", orgId).in("id", part);
        if (error) return { ok: false, message: error.message };
        for (const r of (data ?? []) as Array<{ id: string; label?: string | null }>) if (r.label) type.set(r.id, r.label);
    }
    return { ok: true, name, location, type };
}

function subjectOf(a: AssignmentRow): { type: "child" | "person"; id: string } | null {
    if (a.subject_type === "staff") return a.subject_person_id ? { type: "person", id: a.subject_person_id } : null;
    return a.customer_member_id ? { type: "child", id: a.customer_member_id } : null;
}

type Group = { subject: { type: "child" | "person"; id: string }; items: AssignmentRow[] };
function groupBySubject(rows: readonly AssignmentRow[]): Group[] {
    const groups = new Map<string, Group>();
    for (const a of rows) {
        const s = subjectOf(a);
        // An assignment whose subject cannot be named cannot open a record; it is not shown elsewhere.
        if (!s) continue;
        const key = `${s.type}:${s.id}`;
        const g = groups.get(key) ?? { subject: s, items: [] };
        g.items.push(a);
        groups.set(key, g);
    }
    return [...groups.values()];
}

/** Assemble rows: one per subject, representative chosen by the view, details from the representative. */
async function toRows(
    supabase: SupabaseClient,
    ctx: DomainProjectionContext,
    groups: Group[],
    args: {
        pick: (items: AssignmentRow[]) => AssignmentRow;
        reason: (rep: AssignmentRow, g: Group) => string;
        sortKey?: (rep: AssignmentRow) => string;
        daysUntil?: (rep: AssignmentRow) => number | null;
    },
    truncated: boolean,
): Promise<Loaded> {
    const reps = groups.map((g) => ({ g, rep: args.pick(g.items) }));
    const labels = await readLabels(
        supabase,
        ctx.orgId,
        reps.filter((x) => x.g.subject.type === "child").map((x) => x.g.subject.id),
        reps.filter((x) => x.g.subject.type === "person").map((x) => x.g.subject.id),
        reps.flatMap((x) => [x.rep.site_location_id, x.rep.room_location_id]).filter((v): v is string => Boolean(v)),
        reps.map((x) => x.rep.operational_assignment_type_id).filter((v): v is string => Boolean(v)),
    );
    if (!labels.ok) return { ok: false, code: "projection_unavailable", message: labels.message };
    const rows: DomainProjectionRow[] = reps.map(({ g, rep }) => {
        const reason = args.reason(rep, g);
        return {
            subject: g.subject,
            label: labels.name.get(`${g.subject.type}:${g.subject.id}`) ?? (g.subject.type === "child" ? "Child" : "Staff member"),
            source: { kind: "schedule_assignment", id: rep.id, count: g.items.length, statusLabel: reason },
            siteLocationId: rep.site_location_id,
            sortKey: args.sortKey?.(rep),
            detail: {
                reason,
                startDate: rep.start_date,
                endDate: rep.end_date,
                siteLocationId: rep.site_location_id,
                siteLabel: rep.site_location_id ? labels.location.get(rep.site_location_id) ?? null : null,
                roomLocationId: rep.room_location_id,
                roomLabel: rep.room_location_id ? labels.location.get(rep.room_location_id) ?? null : null,
                assignmentTypeLabel: rep.operational_assignment_type_id ? labels.type.get(rep.operational_assignment_type_id) ?? null : null,
                isPrimary: rep.is_primary ?? null,
                daysUntil: args.daysUntil?.(rep) ?? null,
            },
        };
    });
    return { ok: true, rows, truncated };
}

const byStart = (x: AssignmentRow, y: AssignmentRow) => String(x.start_date ?? "").localeCompare(String(y.start_date ?? "")) || x.id.localeCompare(y.id);
const primaryFirst = (x: AssignmentRow, y: AssignmentRow) => Number(Boolean(y.is_primary)) - Number(Boolean(x.is_primary));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ── A · Current Assignments ──────────────────────────────────────────────────────────────────────────
export async function loadCurrentAssignments(supabase: SupabaseClient, ctx: DomainProjectionContext, opts: Opts = {}): Promise<Loaded> {
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const read = await readAssignments(supabase, ctx, { startLte: today, openOrEndGte: today }, opts);
    if (!read.ok) return { ok: false, code: "projection_unavailable", message: read.message };
    const active = read.rows.filter((a) => lifecycleLabelOf(a, today) === "Active");
    return toRows(supabase, ctx, groupBySubject(active), {
        pick: (items) => [...items].sort((x, y) => primaryFirst(x, y) || byStart(x, y))[0]!,
        reason: (rep, g) =>
            `${rep.is_primary ? "Primary" : "Secondary"} since ${formatYmd(rep.start_date)}`
            + (g.items.length > 1 ? ` · ${plural(g.items.length, "assignment")}` : ""),
    }, read.truncated);
}

// ── B · Ending Soon ──────────────────────────────────────────────────────────────────────────────────
export async function loadAssignmentsEndingSoon(supabase: SupabaseClient, ctx: DomainProjectionContext, opts: Opts = {}): Promise<Loaded> {
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const last = addDaysYmd(today, ASSIGNMENT_WINDOW_DAYS - 1);
    const read = await readAssignments(supabase, ctx, { endGte: today, endLte: last }, opts);
    if (!read.ok) return { ok: false, code: "projection_unavailable", message: read.message };
    // Committed operational truth only: Active or Upcoming. Proposed rows are not yet truth; a superseded
    // child row with a future end date is Completed (its successor carries the truth) and is excluded.
    const qualifying = read.rows.filter((a) => {
        const label = lifecycleLabelOf(a, today);
        return label === "Active" || label === "Upcoming";
    });
    return toRows(supabase, ctx, groupBySubject(qualifying), {
        pick: (items) => [...items].sort((x, y) => String(x.end_date).localeCompare(String(y.end_date)) || primaryFirst(x, y) || x.id.localeCompare(y.id))[0]!,
        reason: (rep, g) => {
            const d = daysBetweenYmd(today, rep.end_date!);
            return `Ends ${formatYmd(rep.end_date)} · ${inDays(d)}` + (g.items.length > 1 ? ` · ${plural(g.items.length, "assignment")} ending` : "");
        },
        sortKey: (rep) => String(rep.end_date),
        daysUntil: (rep) => daysBetweenYmd(today, rep.end_date!),
    }, read.truncated);
}

// ── C · Upcoming Changes ─────────────────────────────────────────────────────────────────────────────
export async function loadAssignmentUpcomingChanges(supabase: SupabaseClient, ctx: DomainProjectionContext, opts: Opts = {}): Promise<Loaded> {
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const last = addDaysYmd(today, ASSIGNMENT_WINDOW_DAYS);
    const read = await readAssignments(supabase, ctx, { startGt: today, startLte: last }, opts);
    if (!read.ok) return { ok: false, code: "projection_unavailable", message: read.message };
    // Upcoming = committed and not yet in effect. A future row is never treated as current.
    const upcoming = read.rows.filter((a) => lifecycleLabelOf(a, today) === "Upcoming");
    const groups = groupBySubject(upcoming);
    const reps = groups.map((g) => [...g.items].sort(byStart)[0]!);

    // Provenance for the classification, in two bounded batch reads:
    //  - the rows a change supersedes (a child primary change supersedes the present row NOW);
    //  - the subjects' current Active primaries (a staff primary change coexists with the current one).
    const supersededIds = [...new Set(reps.map((r) => r.supersedes_assignment_id).filter((v): v is string => Boolean(v)))];
    const superseded = new Map<string, AssignmentRow>();
    for (const part of chunks(supersededIds)) {
        const { data, error } = await supabase.from("schedule_assignments").select(ASSIGNMENT_SELECT).eq("org_id", ctx.orgId).in("id", part);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        for (const r of (data ?? []) as unknown as AssignmentRow[]) superseded.set(r.id, r);
    }
    const staffWithPrimary = new Set<string>();
    const staffIds = reps.filter((r) => r.subject_type === "staff" && r.is_primary && r.subject_person_id).map((r) => r.subject_person_id!);
    for (const part of chunks([...new Set(staffIds)])) {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .select(ASSIGNMENT_SELECT)
            .eq("org_id", ctx.orgId)
            .eq("subject_type", "staff")
            .eq("is_primary", true)
            .in("subject_person_id", part)
            .lte("start_date", today)
            .or(`end_date.is.null,end_date.gte.${today}`)
            .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        for (const r of (data ?? []) as unknown as AssignmentRow[]) {
            if (lifecycleLabelOf(r, today) === "Active" && r.subject_person_id) staffWithPrimary.add(r.subject_person_id);
        }
    }

    return toRows(supabase, ctx, groups, {
        pick: (items) => [...items].sort(byStart)[0]!,
        reason: (rep) => {
            const when = formatYmd(rep.start_date);
            const prior = rep.supersedes_assignment_id ? superseded.get(rep.supersedes_assignment_id) : undefined;
            if (prior) {
                return prior.room_location_id && rep.room_location_id && prior.room_location_id !== rep.room_location_id
                    ? `New room starts ${when}`
                    : `Replacement starts ${when}`;
            }
            if (rep.is_primary && rep.subject_type === "staff" && rep.subject_person_id && staffWithPrimary.has(rep.subject_person_id)) {
                return `Primary change starts ${when}`;
            }
            return `New ${rep.is_primary ? "primary " : ""}assignment starts ${when}`;
        },
        sortKey: (rep) => String(rep.start_date),
        daysUntil: (rep) => daysBetweenYmd(today, rep.start_date!),
    }, read.truncated);
}

// ── E · Proposed / Incomplete ────────────────────────────────────────────────────────────────────────
export async function loadAssignmentsProposedIncomplete(supabase: SupabaseClient, ctx: DomainProjectionContext, opts: Opts = {}): Promise<Loaded> {
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const read = await readAssignments(supabase, ctx, { openOrEndGte: today }, opts);
    if (!read.ok) return { ok: false, code: "projection_unavailable", message: read.message };
    // Two source-backed categories, nothing invented:
    //  - Proposed: `commitment_kind = proposed`, the planning authority awaiting promote/delete.
    //  - Missing assignment type: a committed Active/Upcoming row with no `operational_assignment_type_id`
    //    (the type drives billing, attendance and staffing participation; Scheduling's own attention
    //    counter `missingAssignmentTypes` reports the same condition).
    const proposed = (a: AssignmentRow) => lifecycleLabelOf(a, today) === "Proposed";
    const missingType = (a: AssignmentRow) => {
        const l = lifecycleLabelOf(a, today);
        return (l === "Active" || l === "Upcoming") && !a.operational_assignment_type_id;
    };
    const flagged = read.rows.filter((a) => proposed(a) || missingType(a));
    return toRows(supabase, ctx, groupBySubject(flagged), {
        pick: (items) => [...items].sort((x, y) => Number(proposed(y)) - Number(proposed(x)) || byStart(x, y))[0]!,
        reason: (rep, g) => {
            const p = g.items.filter(proposed).length;
            const m = g.items.filter(missingType).length;
            const parts = [
                p ? (p === 1 ? "Proposed assignment awaiting disposition" : `${p} proposed assignments awaiting disposition`) : null,
                m ? (m === 1 ? "Missing assignment type" : `${m} assignments missing their type`) : null,
            ].filter(Boolean);
            return parts.join(" · ");
        },
    }, read.truncated);
}

// ── D · Schedule Gaps ────────────────────────────────────────────────────────────────────────────────
type AgreementRow = { id: string; customer_member_id: string | null; site_location_id: string | null; start_date: string | null; end_date: string | null; status: string | null };

export async function loadScheduleGaps(supabase: SupabaseClient, ctx: DomainProjectionContext, opts: Opts = {}): Promise<Loaded> {
    const today = opts.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
    const sites = effectiveProjectionSiteIds(ctx.scope);
    if (sites && sites.length === 0) return { ok: true, rows: [], truncated: false };
    const pageSize = opts.pageSize ?? ASSIGNMENT_PAGE_SIZE;
    const readCap = opts.readCap ?? ASSIGNMENT_READ_CAP;

    // Agreements that require scheduling: the operational agreement statuses (the same set the
    // Scheduling unplaced-child detector uses), not ended by date.
    const agreements: AgreementRow[] = [];
    let truncated = false;
    for (let from = 0; ; from += Math.min(pageSize, readCap - from)) {
        const take = Math.min(pageSize, readCap - from);
        let q = supabase
            .from("child_enrollment_agreements")
            .select("id, customer_member_id, site_location_id, start_date, end_date, status")
            .eq("org_id", ctx.orgId)
            .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES])
            .or(`end_date.is.null,end_date.gte.${today}`);
        if (sites) q = q.in("site_location_id", sites);
        if (take <= 0) {
            const probe = await q.order("id", { ascending: true }).range(from, from);
            if (probe.error) return { ok: false, code: "projection_unavailable", message: probe.error.message };
            truncated = (probe.data ?? []).length > 0;
            break;
        }
        const { data, error } = await q.order("id", { ascending: true }).range(from, from + take - 1);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        const got = (data ?? []) as AgreementRow[];
        agreements.push(...got);
        if (got.length < take) break;
    }

    // Coverage: a COMMITTED assignment for the agreement that the canonical resolver calls Active or
    // Upcoming. A superseded or ended row is not coverage; a planned successor is. Batched by agreement.
    const covered = new Set<string>();
    for (const part of chunks(agreements.map((a) => a.id))) {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .select(ASSIGNMENT_SELECT)
            .eq("org_id", ctx.orgId)
            .in("enrollment_agreement_id", part)
            .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
            .or(`end_date.is.null,end_date.gte.${today}`);
        if (error) return { ok: false, code: "projection_unavailable", message: error.message };
        for (const a of (data ?? []) as unknown as AssignmentRow[]) {
            const l = lifecycleLabelOf(a, today);
            if ((l === "Active" || l === "Upcoming") && a.enrollment_agreement_id) covered.add(a.enrollment_agreement_id);
        }
    }
    const gaps = agreements.filter((a) => !covered.has(a.id) && a.customer_member_id);

    const byChild = new Map<string, AgreementRow[]>();
    for (const a of gaps) {
        const list = byChild.get(a.customer_member_id!) ?? [];
        list.push(a);
        byChild.set(a.customer_member_id!, list);
    }
    const labels = await readLabels(supabase, ctx.orgId, [...byChild.keys()], [], gaps.map((a) => a.site_location_id).filter((v): v is string => Boolean(v)), []);
    if (!labels.ok) return { ok: false, code: "projection_unavailable", message: labels.message };
    const rows: DomainProjectionRow[] = [...byChild.entries()].map(([childId, list]) => {
        const rep = [...list].sort((x, y) => String(x.start_date ?? "").localeCompare(String(y.start_date ?? "")) || x.id.localeCompare(y.id))[0]!;
        const starts = rep.start_date && rep.start_date > today ? ` · agreement starts ${formatYmd(rep.start_date)}` : "";
        const reason = `No committed schedule${starts}` + (list.length > 1 ? ` · ${plural(list.length, "agreement")}` : "");
        return {
            subject: { type: "child", id: childId },
            label: labels.name.get(`child:${childId}`) ?? "Child",
            source: { kind: "enrollment_agreement", id: rep.id, count: list.length, statusLabel: reason },
            siteLocationId: rep.site_location_id,
            sortKey: String(rep.start_date ?? ""),
            detail: {
                reason,
                startDate: rep.start_date,
                endDate: rep.end_date,
                siteLocationId: rep.site_location_id,
                siteLabel: rep.site_location_id ? labels.location.get(rep.site_location_id) ?? null : null,
                daysUntil: rep.start_date ? daysBetweenYmd(today, rep.start_date) : null,
            },
        };
    });
    return { ok: true, rows, truncated };
}

export const CURRENT_ASSIGNMENTS_PROJECTION: DomainProjectionDefinition = {
    key: "current_assignments", domain: "assignments", label: "Current assignments", subjectTypes: ["child", "person"],
    load: (s, c) => loadCurrentAssignments(s, c),
};
export const ASSIGNMENTS_ENDING_SOON_PROJECTION: DomainProjectionDefinition = {
    key: "assignments_ending_soon", domain: "assignments", label: "Ending soon", subjectTypes: ["child", "person"],
    load: (s, c) => loadAssignmentsEndingSoon(s, c),
};
export const ASSIGNMENT_UPCOMING_CHANGES_PROJECTION: DomainProjectionDefinition = {
    key: "assignments_upcoming_changes", domain: "assignments", label: "Upcoming changes", subjectTypes: ["child", "person"],
    load: (s, c) => loadAssignmentUpcomingChanges(s, c),
};
export const SCHEDULE_GAPS_PROJECTION: DomainProjectionDefinition = {
    key: "schedule_gaps", domain: "assignments", label: "Schedule gaps", subjectTypes: ["child"],
    load: (s, c) => loadScheduleGaps(s, c),
};
export const ASSIGNMENTS_PROPOSED_INCOMPLETE_PROJECTION: DomainProjectionDefinition = {
    key: "assignments_proposed_incomplete", domain: "assignments", label: "Proposed / incomplete", subjectTypes: ["child", "person"],
    load: (s, c) => loadAssignmentsProposedIncomplete(s, c),
};
