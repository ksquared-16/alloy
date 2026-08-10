/**
 * Card 3 — Department/site scope helpers for CRM routes (used with `getAdminAccessContext`).
 * Effective visibility = org ∩ department ∩ site (enforced at route/query layer).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";

export type AdminAccessScopeDimensions = Pick<
    AdminAccessContextSuccess,
    "departmentScope" | "allowedDepartmentIds" | "siteScope" | "allowedSiteLocationIds"
>;

/**
 * Stable string for client session cache keys — distinguishes corp vs restricted (site/dept) snapshots for the same principal.
 * Not a security boundary; server routes still enforce scope.
 */
export function buildAccessScopeCacheFingerprint(dim: AdminAccessScopeDimensions): string {
    const deptPart =
        dim.departmentScope === "all"
            ? "dept:all"
            : `dept:r:${[...(dim.allowedDepartmentIds ?? [])].map(String).sort().join("|")}`;
    const sitePart =
        dim.siteScope === "all" ? "site:all" : `site:r:${[...(dim.allowedSiteLocationIds ?? [])].map(String).sort().join("|")}`;
    return `${deptPart};${sitePart}`;
}

export function scopeDimensionsFromAccess(access: AdminAccessContextSuccess): AdminAccessScopeDimensions {
    return {
        departmentScope: access.departmentScope,
        allowedDepartmentIds: access.allowedDepartmentIds,
        siteScope: access.siteScope,
        allowedSiteLocationIds: access.allowedSiteLocationIds,
    };
}

export function departmentIdAllowed(dim: AdminAccessScopeDimensions, departmentId: string | null | undefined): boolean {
    if (dim.departmentScope === "all") return true;
    if (departmentId == null || String(departmentId).trim() === "") return false;
    const allowed = dim.allowedDepartmentIds ?? [];
    return allowed.includes(String(departmentId));
}

/**
 * W-8 (I-20, closes C8) — no role widens a scope dimension.
 *
 * `portalAdminBypassesDepartmentScope` and `effectiveDepartmentScopeDimensions` used to force
 * `departmentScope = "all"` for `admin`/`ops`, which made the department dimension configurable,
 * displayed, and inert: since only `admin`/`ops` reach the portal, *every* principal who could use
 * the product bypassed department scope. Both are deleted rather than neutered — a role must not be
 * an input to the scope branch at all, so there is no parameter left to pass one through.
 *
 * Routes now enforce the stored dimensions via `scopeDimensionsFromAccess(access)` directly. Role
 * governs *admission* to a route; it never widens the scope the route enforces once admitted.
 */

/** True when either dimension uses an explicit allow-list (restricted mode). */
export function accessScopeRestrictsData(dim?: AdminAccessScopeDimensions | null): boolean {
    if (!dim) return false;
    return dim.departmentScope === "restricted" || dim.siteScope === "restricted";
}

/** Household/contact-style entities without dept/site linkage: restricted users cannot resolve scope → deny reads. */
export function recordReadableWithoutDeptSiteLinkage(dim: AdminAccessScopeDimensions): boolean {
    return dim.departmentScope === "all" && dim.siteScope === "all";
}

/** Walk parent_location_id until a row has location_type === 'site'; return that site's id. */
export async function resolveEffectiveSiteLocationId(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null | undefined
): Promise<string | null> {
    if (locationId == null || String(locationId).trim() === "") return null;

    let current: string | null = String(locationId).trim();
    const visited = new Set<string>();
    const MAX_HOPS = 32;

    for (let hop = 0; hop < MAX_HOPS && current; hop++) {
        if (visited.has(current)) return null;
        visited.add(current);

        const locRowRes = await supabase
            .from("locations")
            .select("id, location_type, parent_location_id")
            .eq("id", current)
            .eq("org_id", orgId)
            .maybeSingle();

        const row = locRowRes.data as
            | { id: string; location_type?: unknown; parent_location_id?: string | null }
            | null;
        if (locRowRes.error || !row) return null;

        const lt = String(row.location_type ?? "").trim();
        if (lt === "site") return String(row.id);

        const parent: string | null = row.parent_location_id ?? null;
        if (!parent) return null;
        current = String(parent).trim() || null;
    }

    return null;
}

export async function locationAllowedUnderSiteScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    locationId: string | null | undefined
): Promise<boolean> {
    if (dim.siteScope === "all") return true;
    if (locationId == null || String(locationId).trim() === "") return false;

    const effectiveSite = await resolveEffectiveSiteLocationId(supabase, orgId, locationId);
    if (!effectiveSite) return false;

    const allowedSites = dim.allowedSiteLocationIds ?? [];
    return allowedSites.includes(effectiveSite);
}

/** Includes root site ids plus descendants linked via parent_location_id (same org). */
export async function expandLocationIdsUnderSites(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationIds: string[]
): Promise<string[]> {
    if (!siteLocationIds.length) return [];

    const seen = new Set<string>(siteLocationIds.map(String));
    let frontier = [...seen];
    const MAX_ITER = 64;

    for (let iter = 0; iter < MAX_ITER && frontier.length > 0; iter++) {
        const { data, error } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", orgId)
            .in("parent_location_id", frontier);

        if (error) {
            console.error("[expandLocationIdsUnderSites]", error.message);
            break;
        }

        const next: string[] = [];
        for (const r of data ?? []) {
            const id = String((r as { id: string }).id);
            if (!seen.has(id)) {
                seen.add(id);
                next.push(id);
            }
        }
        frontier = next;
    }

    return [...seen];
}

export type RecordScopeConstraints = {
    workUnitIds: string[] | null;
    locationIds: string[] | null;
    impossible: boolean;
};

/** Shared shape for jobs and opportunities list/query filtering. */
export async function resolveRecordScopeConstraints(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions
): Promise<RecordScopeConstraints> {
    let workUnitIds: string[] | null = null;
    let locationIds: string[] | null = null;

    if (dim.departmentScope === "restricted") {
        const deptIds = dim.allowedDepartmentIds ?? [];
        if (!deptIds.length) {
            return { workUnitIds: null, locationIds: null, impossible: true };
        }
        const { data, error } = await supabase.from("work_units").select("id").eq("org_id", orgId).in("department_id", deptIds);
        if (error) {
            console.error("[resolveRecordScopeConstraints] work_units", error.message);
            return { workUnitIds: null, locationIds: null, impossible: true };
        }
        const ids = (data ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
        if (!ids.length) {
            return { workUnitIds: null, locationIds: null, impossible: true };
        }
        workUnitIds = ids;
    }

    if (dim.siteScope === "restricted") {
        const sites = dim.allowedSiteLocationIds ?? [];
        if (!sites.length) {
            return { workUnitIds, locationIds: null, impossible: true };
        }
        locationIds = await expandLocationIdsUnderSites(supabase, orgId, sites);
        if (!locationIds.length) {
            return { workUnitIds, locationIds: null, impossible: true };
        }
    }

    return { workUnitIds, locationIds, impossible: false };
}

/** Mutates a Supabase opportunities/jobs-style filter builder (caller guards `impossible`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyRecordScopeConstraintsToQuery(q: any, c: RecordScopeConstraints): any {
    let out = q;
    if (c.workUnitIds?.length) {
        out = out.not("work_unit_id", "is", null).in("work_unit_id", c.workUnitIds);
    }
    if (c.locationIds?.length) {
        out = out.not("location_id", "is", null).in("location_id", c.locationIds);
    }
    return out;
}

export async function fetchWorkUnitDepartmentId(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string | null | undefined
): Promise<string | null> {
    if (workUnitId == null || String(workUnitId).trim() === "") return null;
    const { data, error } = await supabase
        .from("work_units")
        .select("department_id")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (error || !data) return null;
    const d = (data as { department_id?: string | null }).department_id;
    return typeof d === "string" && d.length > 0 ? d : null;
}

export async function assertOpportunityInAccessScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    row: { work_unit_id?: string | null; location_id?: string | null }
): Promise<boolean> {
    if (!accessScopeRestrictsData(dim)) return true;

    if (dim.departmentScope === "restricted") {
        const deptId = await fetchWorkUnitDepartmentId(supabase, orgId, row.work_unit_id ?? null);
        if (!departmentIdAllowed(dim, deptId)) return false;
    }

    if (dim.siteScope === "all") return true;
    return locationAllowedUnderSiteScope(supabase, orgId, dim, row.location_id ?? null);
}

export async function assertJobInAccessScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    row: { work_unit_id?: string | null; location_id?: string | null }
): Promise<boolean> {
    if (!accessScopeRestrictsData(dim)) return true;

    if (dim.departmentScope === "restricted") {
        const deptId = await fetchWorkUnitDepartmentId(supabase, orgId, row.work_unit_id ?? null);
        if (!departmentIdAllowed(dim, deptId)) return false;
    }

    if (dim.siteScope === "all") return true;
    return locationAllowedUnderSiteScope(supabase, orgId, dim, row.location_id ?? null);
}

export async function assertScheduleInAccessScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    scheduleRow: { job_id?: string | null; location_id?: string | null }
): Promise<boolean> {
    if (!accessScopeRestrictsData(dim)) return true;

    const jobId = scheduleRow.job_id ?? null;
    if (!jobId) return false;

    const { data: job, error } = await supabase
        .from("jobs")
        .select("work_unit_id, location_id")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (error || !job) return false;

    const j = job as { work_unit_id?: string | null; location_id?: string | null };
    if (!(await assertJobInAccessScope(supabase, orgId, dim, j))) return false;

    const schedLoc = scheduleRow.location_id ?? null;
    const effectiveLoc = schedLoc ?? j.location_id ?? null;

    return locationAllowedUnderSiteScope(supabase, orgId, dim, effectiveLoc);
}

/** Locations are not departmental — restricted department scope denies drawer reads. */
export async function assertLocationDrawerReadable(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    locationId: string
): Promise<boolean> {
    if (dim.departmentScope === "restricted") return false;
    return locationAllowedUnderSiteScope(supabase, orgId, dim, locationId);
}

export async function assertPaymentDrawerReadable(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    paymentId: string
): Promise<boolean> {
    const { data, error } = await supabase.from("payments").select("job_id").eq("id", paymentId).eq("org_id", orgId).maybeSingle();

    if (error || !data) return false;

    const jobId = (data as { job_id?: string | null }).job_id ?? null;
    if (!jobId) {
        return recordReadableWithoutDeptSiteLinkage(dim);
    }

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("work_unit_id, location_id")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (jobErr || !job) return false;
    return assertJobInAccessScope(supabase, orgId, dim, job as { work_unit_id?: string | null; location_id?: string | null });
}

/** Discount redemption rows have no org_id — tenant edge validated via linked FK rows (same rule as drawer route). */
export async function assertDiscountRedemptionDrawerReadable(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    redemptionId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("discount_redemptions")
        .select("opportunity_id, job_id, customer_id, contact_id")
        .eq("id", redemptionId)
        .maybeSingle();

    if (error || !data) return false;

    const r = data as {
        opportunity_id?: string | null;
        job_id?: string | null;
        customer_id?: string | null;
        contact_id?: string | null;
    };

    const paths: Promise<{ ok: boolean }>[] = [];
    if (r.customer_id) paths.push(assertRowOrg(supabase, "customers", r.customer_id, orgId));
    if (r.job_id) paths.push(assertRowOrg(supabase, "jobs", r.job_id, orgId));
    if (r.opportunity_id) paths.push(assertRowOrg(supabase, "opportunities", r.opportunity_id, orgId));
    if (r.contact_id) paths.push(assertRowOrg(supabase, "contacts", r.contact_id, orgId));
    if (!paths.length) return false;

    const results = await Promise.all(paths);
    if (!results.some((x) => x.ok)) return false;

    if (r.opportunity_id) {
        const { data: opp } = await supabase
            .from("opportunities")
            .select("work_unit_id, location_id")
            .eq("id", r.opportunity_id)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!opp) return false;
        return assertOpportunityInAccessScope(supabase, orgId, dim, opp as { work_unit_id?: string | null; location_id?: string | null });
    }

    if (r.job_id) {
        const { data: job } = await supabase
            .from("jobs")
            .select("work_unit_id, location_id")
            .eq("id", r.job_id)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!job) return false;
        return assertJobInAccessScope(supabase, orgId, dim, job as { work_unit_id?: string | null; location_id?: string | null });
    }

    return recordReadableWithoutDeptSiteLinkage(dim);
}

export async function assertDocumentDrawerReadable(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    doc: { entity_type?: unknown; entity_id?: unknown }
): Promise<boolean> {
    const etRaw = doc.entity_type != null ? String(doc.entity_type).trim().toLowerCase() : "";
    const eidRaw = doc.entity_id != null ? String(doc.entity_id).trim() : "";
    if (!etRaw || !eidRaw) {
        return recordReadableWithoutDeptSiteLinkage(dim);
    }

    if (etRaw === "opportunity" || etRaw === "opportunities") {
        const { data } = await supabase
            .from("opportunities")
            .select("work_unit_id, location_id")
            .eq("id", eidRaw)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!data) return false;
        return assertOpportunityInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
    }

    if (etRaw === "job" || etRaw === "jobs") {
        const { data } = await supabase
            .from("jobs")
            .select("work_unit_id, location_id")
            .eq("id", eidRaw)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!data) return false;
        return assertJobInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
    }

    if (etRaw === "schedule" || etRaw === "schedules") {
        const { data } = await supabase
            .from("schedules")
            .select("job_id, location_id")
            .eq("id", eidRaw)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!data) return false;
        return assertScheduleInAccessScope(supabase, orgId, dim, data as { job_id?: string | null; location_id?: string | null });
    }

    return recordReadableWithoutDeptSiteLinkage(dim);
}

/**
 * Entity drawer GET gate: returns false → caller should respond 404 (record exists but out of scope).
 */
export async function assertEntityDrawerRecordReadable(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    entityType: string,
    entityId: string
): Promise<boolean> {
    const t = entityType.trim().toLowerCase();
    const id = entityId.trim();
    if (!id) return false;

    switch (t) {
        case "jobs": {
            const { data } = await supabase
                .from("jobs")
                .select("work_unit_id, location_id")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (!data) return false;
            return assertJobInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
        }
        case "opportunities": {
            const { data } = await supabase
                .from("opportunities")
                .select("work_unit_id, location_id")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (!data) return false;
            return assertOpportunityInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
        }
        case "schedules": {
            const { data } = await supabase
                .from("schedules")
                .select("job_id, location_id")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (!data) return false;
            return assertScheduleInAccessScope(supabase, orgId, dim, data as { job_id?: string | null; location_id?: string | null });
        }
        case "documents": {
            const { data: docRow } = await supabase
                .from("documents")
                .select("entity_type, entity_id")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (!docRow) return false;
            return assertDocumentDrawerReadable(supabase, orgId, dim, docRow as { entity_type?: unknown; entity_id?: unknown });
        }
        case "payments":
            return assertPaymentDrawerReadable(supabase, orgId, dim, id);
        case "locations":
            return assertLocationDrawerReadable(supabase, orgId, dim, id);
        case "discount_redemptions":
            return assertDiscountRedemptionDrawerReadable(supabase, orgId, dim, id);
        case "addons":
            /** Vertical catalog (`pricing_addons`): no org/dept/site linkage — keep readable for authenticated admins. */
            return true;
        case "contacts":
        case "customers":
        case "customer_members":
        case "persons":
        case "vendors":
        case "workflows":
        case "subscriptions":
        case "service_offerings":
        case "service_plan_templates":
            return recordReadableWithoutDeptSiteLinkage(dim);
        default:
            return recordReadableWithoutDeptSiteLinkage(dim);
    }
}

/**
 * Schedule list routes: intersect optional single job filter with jobs visible under dept/site scope.
 * - `"all"` — no scope-based job filter (caller may still filter by query param).
 * - `"none"` — scope excludes all jobs (empty schedule list).
 * - `string[]` — use `.in("job_id", ids)` (never empty).
 */
export async function narrowJobIdsForScheduleList(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    requestedJobId: string | null | undefined
): Promise<"all" | "none" | string[]> {
    const req = requestedJobId?.trim() || null;

    if (!accessScopeRestrictsData(dim)) {
        return req ? [req] : "all";
    }

    const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (c.impossible) return "none";

    let jq = supabase.from("jobs").select("id").eq("org_id", orgId);
    jq = applyRecordScopeConstraintsToQuery(jq, c);
    const { data, error } = await jq.limit(10000);
    if (error) {
        console.error("[narrowJobIdsForScheduleList]", error.message);
        return "none";
    }

    let ids = [...new Set((data ?? []).map((r) => String((r as { id: string }).id)))];
    if (req) {
        ids = ids.filter((jid) => jid === req);
    }
    return ids.length ? ids : "none";
}

/** Mutation routes: fetch job scope columns then apply same checks as reads (404 at caller). */
export async function assertExistingJobMutableInAdminScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    jobId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("jobs")
        .select("work_unit_id, location_id")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return false;
    return assertJobInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
}

export async function assertExistingScheduleMutableInAdminScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    scheduleId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("schedules")
        .select("job_id, location_id")
        .eq("id", scheduleId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return false;
    return assertScheduleInAccessScope(supabase, orgId, dim, data as { job_id?: string | null; location_id?: string | null });
}

export async function assertExistingOpportunityMutableInAdminScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    opportunityId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("work_unit_id, location_id")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return false;
    return assertOpportunityInAccessScope(supabase, orgId, dim, data as { work_unit_id?: string | null; location_id?: string | null });
}

const GL_SCHEDULE_BACKED_SOURCE_TYPES = new Set(["schedule_completed", "customer_payment", "vendor_payout"]);

type GlJournalLineScopeSlice = {
    job_id?: string | null;
    schedule_id?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
};

/**
 * GET journal-entry drawer: restricted users see entries only when schedule/job linkage resolves under scope.
 * Unknown headers without job/schedule lines are denied.
 */
export async function assertGlJournalEntryReadableInAdminScope(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    entry: { source_type?: string | null; source_id?: string | null },
    lines: GlJournalLineScopeSlice[]
): Promise<boolean> {
    if (!accessScopeRestrictsData(dim)) return true;

    const st = entry.source_type != null ? String(entry.source_type).trim().toLowerCase() : "";
    const sidRaw = entry.source_id != null ? String(entry.source_id).trim() : "";
    let resolvedViaHeader = false;

    if (sidRaw && GL_SCHEDULE_BACKED_SOURCE_TYPES.has(st)) {
        const { data: sch, error: schErr } = await supabase
            .from("schedules")
            .select("job_id, location_id")
            .eq("id", sidRaw)
            .eq("org_id", orgId)
            .maybeSingle();
        if (schErr || !sch) return false;
        if (!(await assertScheduleInAccessScope(supabase, orgId, dim, sch as { job_id?: string | null; location_id?: string | null }))) {
            return false;
        }
        resolvedViaHeader = true;
    }

    const lineAnchored = lines.some((l) => {
        const j = l.job_id != null ? String(l.job_id).trim() : "";
        const s = l.schedule_id != null ? String(l.schedule_id).trim() : "";
        return j !== "" || s !== "";
    });

    if (!resolvedViaHeader && !lineAnchored) return false;

    for (const line of lines) {
        const jobId = line.job_id != null ? String(line.job_id).trim() : "";
        if (jobId) {
            if (!(await assertExistingJobMutableInAdminScope(supabase, orgId, dim, jobId))) return false;
        }
        const scheduleId = line.schedule_id != null ? String(line.schedule_id).trim() : "";
        if (scheduleId) {
            if (!(await assertExistingScheduleMutableInAdminScope(supabase, orgId, dim, scheduleId))) return false;
        }

        const hasScopeAnchor = jobId !== "" || scheduleId !== "";
        const cust = line.customer_id != null ? String(line.customer_id).trim() : "";
        const vend = line.vendor_id != null ? String(line.vendor_id).trim() : "";
        const ambiguousOnly = !hasScopeAnchor && (cust !== "" || vend !== "");
        if (ambiguousOnly) return false;
    }

    return true;
}

/**
 * Customers reachable via scoped jobs / opportunities — list routes only (`null` = unrestricted).
 */
export async function fetchScopedCustomerIdsForRestrictedAdmin(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions
): Promise<string[] | null> {
    if (!accessScopeRestrictsData(dim)) return null;

    const out = new Set<string>();
    const BATCH = 500;

    const jobIdsResult = await narrowJobIdsForScheduleList(supabase, orgId, dim, null);
    if (jobIdsResult !== "none" && jobIdsResult !== "all") {
        for (let i = 0; i < jobIdsResult.length; i += BATCH) {
            const slice = jobIdsResult.slice(i, i + BATCH);
            const { data } = await supabase.from("jobs").select("customer_id").eq("org_id", orgId).in("id", slice).not("customer_id", "is", null);
            for (const r of data ?? []) {
                const cid = (r as { customer_id?: string | null }).customer_id;
                if (cid) out.add(cid);
            }
        }
    }

    const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (!c.impossible) {
        let oppQ = supabase.from("opportunities").select("customer_id").eq("org_id", orgId).not("customer_id", "is", null);
        oppQ = applyRecordScopeConstraintsToQuery(oppQ, c);
        const { data: opps } = await oppQ.limit(10000);
        for (const r of opps ?? []) {
            const cid = (r as { customer_id?: string | null }).customer_id;
            if (cid) out.add(cid);
        }
    }

    return [...out];
}

/**
 * Persons tied to scoped customers (memberships) or scoped opportunities (`null` = unrestricted).
 */
export async function fetchScopedPersonIdsForRestrictedAdmin(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions
): Promise<string[] | null> {
    if (!accessScopeRestrictsData(dim)) return null;

    const ids = new Set<string>();
    const BATCH = 500;

    const customerIds = await fetchScopedCustomerIdsForRestrictedAdmin(supabase, orgId, dim);
    const custArr = customerIds ?? [];

    if (custArr.length) {
        for (let i = 0; i < custArr.length; i += BATCH) {
            const slice = custArr.slice(i, i + BATCH);
            const { data } = await supabase.from("customer_persons").select("person_id").in("customer_id", slice);
            for (const r of data ?? []) {
                const pid = (r as { person_id?: string | null }).person_id;
                if (pid) ids.add(pid);
            }
        }
    }

    const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (!c.impossible) {
        let oppQ = supabase.from("opportunities").select("primary_person_id, primary_contact_id").eq("org_id", orgId);
        oppQ = applyRecordScopeConstraintsToQuery(oppQ, c);
        const { data: opps } = await oppQ.limit(10000);
        const primaryContactIds: string[] = [];
        for (const r of opps ?? []) {
            const pp = (r as { primary_person_id?: string | null }).primary_person_id;
            const pc = (r as { primary_contact_id?: string | null }).primary_contact_id;
            if (pp) ids.add(pp);
            if (pc) primaryContactIds.push(pc);
        }
        if (primaryContactIds.length) {
            const { data: contacts } = await supabase
                .from("contacts")
                .select("person_id")
                .eq("org_id", orgId)
                .in("id", [...new Set(primaryContactIds)]);
            for (const row of contacts ?? []) {
                const pid = (row as { person_id?: string | null }).person_id;
                if (pid) ids.add(pid);
            }
        }
    }

    return [...ids];
}
