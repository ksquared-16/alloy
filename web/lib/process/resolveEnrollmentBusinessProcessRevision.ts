/**
 * D-96 — which published Business Process revision governs an Enrollment journey starting NOW.
 *
 * Resolved inside the canonical creator rather than passed in by callers. `createEnrollmentProcessInstance`
 * has three production callers — Start Enrollment, Create Lead child persistence and the Processing
 * identity ports — and none of them holds a department id. Making them supply one would push a
 * governance decision out to three places that would each answer it slightly differently; resolving
 * it once means all three inherit the pin without changing a line.
 *
 * ## What "authoritative" means here
 *
 * The department whose latest publication configures the Enrollment process. Alloy scopes a Business
 * Process to a department, so this is a lookup over publications, not a guess:
 *
 *   1. every `business_process` publication in the org, latest revision per department;
 *   2. keep the ones whose payload configures a process with `key = 'enrollment'`.
 *
 * Which of those governs THIS journey is then answered in a fixed order, most canonical first.
 *
 * ### 1. The journey's own context (Gate 0B)
 *
 * `Org -> Department -> Work unit -> Record` is the platform's own containment doctrine, and it is
 * schema-enforced: `opportunities.work_unit_id` is a real FK (migration 20260427173000, "primary
 * work unit FK") and `work_units.department_id` is NOT NULL. So a journey with an Opportunity
 * context already carries a canonical department identity, and nothing has to be invented to read
 * it. `hostWorkUnitResolver` calls the record's own `work_unit_id` the authoritative answer for
 * exactly this reason.
 *
 * This is used FIRST, ahead of any org-level reasoning, because it is the only source that is right
 * by construction rather than right by the tenant happening to have one department.
 *
 * Sources that were traced and CANNOT answer, so that a later reader does not re-derive them:
 * `opportunities` has no `department_id` column; `opportunities.metadata.enrollment_department_id`
 * is read in two places and written by nothing in this repository (a hosted-data convention only);
 * `departments` has no location binding at all — it is a business function, not a site — so
 * placement cannot select one; the subject is a household membership; and the stage key is
 * per-process, so two Enrollment departments could share it.
 *
 * ### 2. Exactly one Enrollment department in the org
 *
 * Then there is nothing to disambiguate and the context chain is not needed.
 *
 * ### 3. Otherwise: refuse, and say so
 *
 * A context-free journey in an org where two departments each publish an Enrollment process has no
 * canonical selector — there is genuinely no fact in the system that says which one governs. Picking
 * the most recently published one would silently bind a family to a configuration nobody chose, and
 * the pin is immutable, so the mistake would be unfixable.
 *
 * Zero survivors likewise means the tenant has never published an Enrollment configuration; there is
 * nothing to pin and the instance is created unpinned, which is a legitimate state.
 *
 * Neither outcome is SILENT: the result carries an explicit `outcome` the creator surfaces, so
 * "created without a pin" is always an observable fact rather than an absent column nobody noticed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { cachedConfigRead } from "@/lib/runtime/provisioning/configReadCache";

export type EnrollmentRevisionPinOutcome =
    | "pinned"
    | "no_published_enrollment_configuration"
    | "ambiguous_multiple_enrollment_departments";

/** WHICH fact chose the department. Recorded so a pin can be explained after the fact. */
export type EnrollmentRevisionDepartmentSelector =
    | "context_work_unit"
    | "sole_enrollment_department"
    | "none";

export type EnrollmentBusinessProcessRevision = {
    readonly revisionId: string | null;
    readonly departmentId: string | null;
    readonly outcome: EnrollmentRevisionPinOutcome;
    readonly selector: EnrollmentRevisionDepartmentSelector;
    /** Populated only when ambiguous, so the condition can be reported rather than inferred. */
    readonly candidateDepartmentIds: readonly string[];
};

type PublicationRow = { revision_id: string; subject_id: string; revision_number: number };
type RevisionRow = { id: string; payload: unknown };

function configuresEnrollment(payload: unknown): boolean {
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return false;
    const processes = (payload as Record<string, unknown>).processes;
    if (!Array.isArray(processes)) return false;
    return processes.some(
        (p) =>
            p != null &&
            typeof p === "object" &&
            !Array.isArray(p) &&
            (p as Record<string, unknown>).key === ENROLLMENT_PROCESS_KEY,
    );
}

/**
 * The department a journey's Opportunity context belongs to.
 *
 * Exported because the D-96 COMPATIBILITY path needs the same answer: a historical unpinned
 * instance has no revision, so its live configuration has to be found somehow, and the only
 * canonical route is this one. Re-deriving it there would be a second selector.
 *
 * `Org -> Department -> Work unit -> Record`, walked upward. Two indexed point reads, memoised
 * under the `wu:` prefix that `invalidateTenantConfigReadCache` already clears.
 *
 * Null is a real answer, not an error: an Opportunity created before work-unit assignment, or one
 * never assigned, genuinely has no department. The caller falls through rather than guessing.
 */
export async function departmentForOpportunityContext(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
): Promise<string | null> {
    return cachedConfigRead(`wu:${orgId}:opp-dept:${opportunityId}`, async () => {
        const { data: opp, error: oppError } = await supabase
            .from("opportunities")
            .select("work_unit_id")
            .eq("id", opportunityId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (oppError) throw new Error(oppError.message);
        const workUnitId = String((opp as { work_unit_id?: string | null } | null)?.work_unit_id ?? "").trim();
        if (!workUnitId) return null;

        const { data: wu, error: wuError } = await supabase
            .from("work_units")
            .select("department_id")
            .eq("id", workUnitId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (wuError) throw new Error(wuError.message);
        return String((wu as { department_id?: string | null } | null)?.department_id ?? "").trim() || null;
    });
}

/** Latest published revision per department, for departments that configure Enrollment. */
async function enrollmentRevisionByDepartment(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Map<string, string>> {
    return cachedConfigRead(`dept:${orgId}:enrollment-bp-revision`, async () => {
        const { data: pubs, error: pubError } = await supabase
            .from("configuration_publications")
            .select("revision_id, subject_id, revision_number")
            .eq("org_id", orgId)
            .eq("domain_key", "business_process")
            .order("revision_number", { ascending: false });
        if (pubError) throw new Error(pubError.message);

        // Latest publication per department. The query is ordered descending, so the first row seen
        // for a subject is that department's current one.
        const latestByDepartment = new Map<string, string>();
        for (const row of (pubs ?? []) as PublicationRow[]) {
            const departmentId = String(row.subject_id ?? "").trim();
            const revisionId = String(row.revision_id ?? "").trim();
            if (!departmentId || !revisionId || latestByDepartment.has(departmentId)) continue;
            latestByDepartment.set(departmentId, revisionId);
        }
        if (latestByDepartment.size === 0) return new Map<string, string>();

        const { data: revs, error: revError } = await supabase
            .from("business_process_revisions")
            .select("id, payload")
            .eq("org_id", orgId)
            .in("id", [...latestByDepartment.values()]);
        if (revError) throw new Error(revError.message);

        const enrollmentRevisionIds = new Set(
            ((revs ?? []) as RevisionRow[])
                .filter((r) => configuresEnrollment(r.payload))
                .map((r) => String(r.id)),
        );

        const out = new Map<string, string>();
        for (const [departmentId, revisionId] of latestByDepartment) {
            if (enrollmentRevisionIds.has(revisionId)) out.set(departmentId, revisionId);
        }
        return out;
    });
}

const NOTHING_PUBLISHED: EnrollmentBusinessProcessRevision = {
    revisionId: null,
    departmentId: null,
    outcome: "no_published_enrollment_configuration",
    selector: "none",
    candidateDepartmentIds: [],
};

/**
 * The revision that governs an Enrollment journey starting NOW.
 *
 * Memoised reads throughout, under prefixes `invalidateTenantConfigReadCache` already clears on every
 * publish and rollback — so a newly published revision governs the very next journey rather than
 * whatever the cache remembers.
 */
export async function resolveCurrentEnrollmentBusinessProcessRevision(
    supabase: SupabaseClient,
    orgId: string,
    context?: {
        /** `process_instances.context_id` when `context_type = 'opportunity'`. */
        readonly opportunityId?: string | null;
    },
): Promise<EnrollmentBusinessProcessRevision> {
    const byDepartment = await enrollmentRevisionByDepartment(supabase, orgId);
    if (byDepartment.size === 0) return NOTHING_PUBLISHED;

    // 1. The journey's own context. Canonical by construction, so it is consulted before any
    //    org-level reasoning — including before the single-department shortcut, so that a
    //    single-department org exercises the same path a multi-department one does and the chain
    //    cannot rot unnoticed.
    const opportunityId = (context?.opportunityId ?? "").trim();
    if (opportunityId) {
        const departmentId = await departmentForOpportunityContext(supabase, orgId, opportunityId);
        const revisionId = departmentId ? byDepartment.get(departmentId) : undefined;
        if (departmentId && revisionId) {
            return {
                revisionId,
                departmentId,
                outcome: "pinned",
                selector: "context_work_unit",
                candidateDepartmentIds: [],
            };
        }
    }

    // 2. Nothing to disambiguate.
    if (byDepartment.size === 1) {
        const [departmentId, revisionId] = [...byDepartment.entries()][0]!;
        return {
            revisionId,
            departmentId,
            outcome: "pinned",
            selector: "sole_enrollment_department",
            candidateDepartmentIds: [],
        };
    }

    // 3. No fact in the system says which department governs this journey. Refuse rather than pick.
    return {
        revisionId: null,
        departmentId: null,
        outcome: "ambiguous_multiple_enrollment_departments",
        selector: "none",
        candidateDepartmentIds: [...byDepartment.keys()].sort(),
    };
}
