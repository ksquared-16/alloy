/**
 * The public shape of the service-state operations, and the authorization they perform.
 *
 * ── WHAT THIS MODULE OWNS ──
 *
 * Reading the partner's intent out of a request body, proving that intent is inside the
 * installation's authority, and returning the canonical result as a public object. It performs no
 * domain logic: the canonical services decide whether an enrollment may start, whether a placement
 * may be superseded, and on what dates.
 *
 * ── THE AUTHORIZATION THAT MATTERS ──
 *
 * Every operation here names either a CHILD or an ENROLLMENT. Neither is usable as a key on its
 * own: the child must be independently visible under this installation's read authority, and the
 * enrollment must sit at a site inside the boundary. A valid identifier for something outside the
 * boundary is refused exactly as it is on the reads — possessing an id has never been the same as
 * being entitled to it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationContext, OperationRefusal } from "@/lib/platform/external/operationRoute";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Field = { ok: true; value: string } | { ok: false; error: OperationRefusal };

export function requiredId(body: Record<string, unknown>, name: string): Field {
    const raw = body[name];
    if (typeof raw !== "string" || !UUID_RE.test(raw)) {
        return { ok: false, error: { code: "invalid_request", message: `${name} must be a valid identifier.`, status: 400 } };
    }
    return { ok: true, value: raw };
}

export function optionalId(body: Record<string, unknown>, name: string): { ok: true; value: string | null } | { ok: false; error: OperationRefusal } {
    const raw = body[name];
    if (raw === undefined || raw === null) return { ok: true, value: null };
    if (typeof raw !== "string" || !UUID_RE.test(raw)) {
        return { ok: false, error: { code: "invalid_request", message: `${name} must be a valid identifier.`, status: 400 } };
    }
    return { ok: true, value: raw };
}

export function requiredDate(body: Record<string, unknown>, name: string): Field {
    const raw = body[name];
    if (typeof raw !== "string" || !ISO_DATE_RE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
        return { ok: false, error: { code: "invalid_request", message: `${name} must be a date in YYYY-MM-DD form.`, status: 400 } };
    }
    return { ok: true, value: raw };
}

export function optionalDate(body: Record<string, unknown>, name: string): { ok: true; value: string | null } | { ok: false; error: OperationRefusal } {
    const raw = body[name];
    if (raw === undefined || raw === null) return { ok: true, value: null };
    const checked = requiredDate(body, name);
    return checked.ok ? { ok: true, value: checked.value } : checked;
}

const OUTSIDE: OperationRefusal = {
    /*
     * ONE refusal for "you cannot reach this", whether the resource does not exist, belongs to
     * another organization, or sits outside the boundary. Distinguishing them would let a caller
     * enumerate what exists by reading the difference between two errors.
     */
    code: "not_found",
    message: "No such resource is available to this installation.",
    status: 404,
};

/**
 * May this caller act on this child?
 *
 * TWO grants, and the second is not a convenience.
 *
 * The obvious rule — "the child must be visible" — is circular for the operation that matters
 * most. A child is visible only once enrolled at a site inside the boundary, so requiring
 * visibility to START an enrollment means a partner could only ever enroll children who are
 * already enrolled. The flagship operation would be unusable, and the reason would be invisible
 * from the outside: every request would simply 404.
 *
 * So authority over a child is EITHER of:
 *
 *   1. the child is independently visible under this installation's read authority; or
 *   2. this installation holds an active correlation mapping for the child.
 *
 * The second is a real grant rather than a loophole: mappings are established with Alloy during
 * onboarding, they are installation-scoped, and another installation's mapping never satisfies
 * this one. It says "this organization has told us this partner is responsible for this child".
 *
 * Neither grant reaches a site: the enrollment's site is proven against the boundary separately,
 * so a mapped child still cannot be enrolled somewhere the installation may not reach.
 */
export async function assertChildInAuthority(
    ctx: OperationContext,
    childId: string,
): Promise<{ ok: true } | { ok: false; error: OperationRefusal }> {
    const mapped = await ctx.supabase
        .from("integration_resource_refs")
        .select("id")
        .eq("installation_id", ctx.installationId)
        .eq("org_id", ctx.organizationId)
        .eq("resource_type", "child")
        .eq("child_customer_member_id", childId)
        .eq("status", "active")
        .limit(1);
    if (mapped.error) throw new Error("child correlation lookup failed");
    if (((mapped.data ?? []) as unknown[]).length > 0) return { ok: true };

    const { data, error } = await ctx.supabase.rpc("list_external_children", {
        p_org_id: ctx.organizationId,
        p_installation_id: ctx.installationId,
        p_boundary_mode: ctx.boundaryMode,
        p_site_ids: [...ctx.siteIds],
        p_limit: 1,
        p_cursor_sort: null,
        p_cursor_id: null,
        p_updated_since: null,
        p_household_id: null,
        p_child_ids: [childId],
        p_external_id: null,
    });
    if (error) throw new Error("child authority lookup failed");
    return ((data ?? []) as unknown[]).length > 0 ? { ok: true } : { ok: false, error: OUTSIDE };
}

/** Is this site inside the boundary? `org_wide` still requires the site to belong to the org. */
export async function assertSiteInAuthority(
    ctx: OperationContext,
    siteId: string,
): Promise<{ ok: true } | { ok: false; error: OperationRefusal }> {
    if (ctx.boundaryMode !== "org_wide") {
        return ctx.siteIds.includes(siteId) ? { ok: true } : { ok: false, error: OUTSIDE };
    }
    const { data, error } = await ctx.supabase
        .from("locations")
        .select("id")
        .eq("org_id", ctx.organizationId)
        .eq("id", siteId)
        .limit(1);
    if (error) throw new Error("site authority lookup failed");
    return ((data ?? []) as unknown[]).length > 0 ? { ok: true } : { ok: false, error: OUTSIDE };
}

export type EnrollmentRef = { agreementId: string; siteLocationId: string; customerMemberId: string };

/**
 * Resolve an enrollment the caller may act on.
 *
 * Reads the agreement, then proves its SITE is inside the boundary. An agreement id belonging to
 * another organization or another site refuses identically to one that does not exist.
 */
export async function resolveEnrollmentInAuthority(
    ctx: OperationContext,
    enrollmentId: string,
): Promise<{ ok: true; value: EnrollmentRef } | { ok: false; error: OperationRefusal }> {
    const { data, error } = await ctx.supabase
        .from("child_enrollment_agreements")
        .select("id, site_location_id, customer_member_id")
        .eq("org_id", ctx.organizationId)
        .eq("id", enrollmentId)
        .limit(1);
    if (error) throw new Error("enrollment authority lookup failed");
    const row = ((data ?? []) as Array<{ id: string; site_location_id: string; customer_member_id: string }>)[0];
    if (!row) return { ok: false, error: OUTSIDE };

    const site = await assertSiteInAuthority(ctx, row.site_location_id);
    if (!site.ok) return site;

    return { ok: true, value: { agreementId: row.id, siteLocationId: row.site_location_id, customerMemberId: row.customer_member_id } };
}

/**
 * Resolve a placement or schedule-assignment row the caller already holds an id for.
 *
 * Authority is the row's own site, not the caller's claim about it: a partner may name any id, and
 * one outside the boundary must be indistinguishable from one that does not exist. Both tables
 * carry `site_location_id`, so one resolver serves both rather than two that could drift apart.
 */
export async function resolveServiceStateRowInAuthority(
    ctx: OperationContext,
    table: "child_placements" | "schedule_assignments",
    rowId: string,
): Promise<{ ok: true; value: { id: string; siteLocationId: string; status: string } } | { ok: false; error: OperationRefusal }> {
    const { data, error } = await ctx.supabase
        .from(table)
        .select("id, site_location_id, status")
        .eq("org_id", ctx.organizationId)
        .eq("id", rowId)
        .limit(1);
    if (error) throw new Error(`${table} authority lookup failed`);
    const row = ((data ?? []) as Array<{ id: string; site_location_id: string; status: string }>)[0];
    if (!row) return { ok: false, error: OUTSIDE };

    const site = await assertSiteInAuthority(ctx, row.site_location_id);
    if (!site.ok) return site;

    return { ok: true, value: { id: row.id, siteLocationId: row.site_location_id, status: row.status } };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export type PublicEnrollmentResult = {
    id: string; child_id: string; site_location_id: string | null;
    status: string | null; start_date: string | null; end_date: string | null;
};

export function toEnrollmentResult(row: Record<string, unknown>): PublicEnrollmentResult {
    return {
        id: String(row.id),
        child_id: String(row.customer_member_id),
        site_location_id: str(row.site_location_id),
        status: str(row.status),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
    };
}

export type PublicPlacementResult = {
    id: string; enrollment_id: string | null; child_id: string;
    site_location_id: string | null; room_location_id: string | null;
    program_category_id: string | null; status: string | null;
    start_date: string | null; end_date: string | null; supersedes_placement_id: string | null;
};

export function toPlacementResult(row: Record<string, unknown>): PublicPlacementResult {
    return {
        id: String(row.id),
        enrollment_id: str(row.enrollment_agreement_id),
        child_id: String(row.customer_member_id),
        site_location_id: str(row.site_location_id),
        room_location_id: str(row.room_location_id),
        program_category_id: str(row.program_category_id),
        status: str(row.status),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
        supersedes_placement_id: str(row.supersedes_placement_id),
    };
}

export type PublicScheduleResult = {
    id: string; enrollment_id: string | null; child_id: string;
    schedule_pattern_id: string | null; status: string | null;
    start_date: string | null; end_date: string | null; supersedes_assignment_id: string | null;
};

export function toScheduleResult(row: Record<string, unknown>): PublicScheduleResult {
    return {
        id: String(row.id),
        enrollment_id: str(row.enrollment_agreement_id),
        child_id: String(row.customer_member_id),
        schedule_pattern_id: str(row.schedule_pattern_id),
        status: str(row.status),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
        supersedes_assignment_id: str(row.supersedes_assignment_id),
    };
}

export type { SupabaseClient };

/**
 * Create, or converge on whoever created it first.
 *
 * ── THE RACE THESE OPERATIONS HAVE ──
 *
 * Every create here is "read current state, then insert if absent". Two simultaneous requests both
 * read absent, both insert, and the second violates the partial unique index that guarantees one
 * operational record per child — `ux_child_enrollment_agreements_one_operational_per_member_site`
 * and its siblings. The database is right to refuse; the invariant is exactly the one we want.
 *
 * What was wrong was the ANSWER. A partner whose retry raced its own original — or two instances of
 * one partner behind a load balancer — received a 500 for an operation that had, in fact,
 * succeeded. Losing that insert is not a failure: it is evidence that someone else got there first.
 *
 * So on failure we re-read. If the record now exists, the caller learns it exists; if it does not,
 * the original error was real and is rethrown untouched.
 */
export async function createOrConverge<TRow>(
    create: () => Promise<TRow>,
    reread: () => Promise<TRow | null>,
): Promise<{ row: TRow; created: boolean }> {
    try {
        return { row: await create(), created: true };
    } catch (error) {
        const existing = await reread();
        if (existing) return { row: existing, created: false };
        throw error;
    }
}
