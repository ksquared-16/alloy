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
 *   2. keep the ones whose payload configures a process with `key = 'enrollment'`;
 *   3. exactly one survivor -> that is the governing revision.
 *
 * ## Refusing to guess is deliberate
 *
 * Zero survivors means the tenant has never published an Enrollment configuration; there is nothing
 * to pin and the instance is created unpinned, which is a legitimate state.
 *
 * More than one means two departments each publish an Enrollment process, and WHICH governs a given
 * child depends on that child's department — which a context-free start does not have. Picking the
 * most recently published one would silently bind a family to a configuration nobody chose, and the
 * pin is immutable, so the mistake would be unfixable. It reports ambiguity instead.
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

export type EnrollmentBusinessProcessRevision = {
    readonly revisionId: string | null;
    readonly departmentId: string | null;
    readonly outcome: EnrollmentRevisionPinOutcome;
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
 * The org's currently authoritative published Enrollment revision.
 *
 * Memoised under the `dept:` prefix, which `invalidateTenantConfigReadCache` already clears on every
 * publish and rollback — so a newly published revision governs the very next journey rather than
 * whatever the cache remembers. Without the memo this would add two reads to every child created by
 * Create Lead.
 */
export async function resolveCurrentEnrollmentBusinessProcessRevision(
    supabase: SupabaseClient,
    orgId: string,
): Promise<EnrollmentBusinessProcessRevision> {
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

        if (latestByDepartment.size === 0) {
            return {
                revisionId: null,
                departmentId: null,
                outcome: "no_published_enrollment_configuration" as const,
                candidateDepartmentIds: [],
            };
        }

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

        const matches = [...latestByDepartment.entries()].filter(([, revisionId]) =>
            enrollmentRevisionIds.has(revisionId),
        );

        if (matches.length === 0) {
            return {
                revisionId: null,
                departmentId: null,
                outcome: "no_published_enrollment_configuration" as const,
                candidateDepartmentIds: [],
            };
        }
        if (matches.length > 1) {
            return {
                revisionId: null,
                departmentId: null,
                outcome: "ambiguous_multiple_enrollment_departments" as const,
                candidateDepartmentIds: matches.map(([departmentId]) => departmentId).sort(),
            };
        }

        const [departmentId, revisionId] = matches[0]!;
        return {
            revisionId,
            departmentId,
            outcome: "pinned" as const,
            candidateDepartmentIds: [],
        };
    });
}
