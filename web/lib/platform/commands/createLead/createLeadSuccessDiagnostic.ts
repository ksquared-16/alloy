/**
 * Create Lead success diagnostics (dev/test only).
 *
 * Proves, at runtime, whether the just-created lead is a member of the New Leads work-unit lens:
 * the resolved status_key, work unit, and whether the New Leads queue accepts that status. No prod
 * logging — gated to development / vitest so it never adds noise in production.
 */

import { enrollmentPipelineNewLeadsStatusKeys } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

/**
 * True when `statusKey` is accepted by the New Leads lane (canonical `new_inquiry` + legacy
 * `open`/`new` aliases). Derived from the queue definition — never hardcodes a single key.
 */
export function createdLeadStatusIsNewLeadsMember(statusKey: string | null | undefined): boolean {
    const sk = (statusKey ?? "").trim().toLowerCase();
    if (!sk) return false;
    return enrollmentPipelineNewLeadsStatusKeys()
        .map((k) => k.trim().toLowerCase())
        .includes(sk);
}

const DIAG_ENABLED =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.VITEST === "true");

/**
 * Dev/test-only: log the created lead's resolved status/work-unit and whether the New Leads query
 * would include it. Surfaces the exact reason a lead would (or would not) appear in New Leads.
 */
export function logCreateLeadSuccessDiagnostic(input: {
    createdRecordId: string;
    statusKey: string | null;
    workUnitId: string | null;
}): void {
    if (!DIAG_ENABLED || typeof window === "undefined") return;
    // eslint-disable-next-line no-console
    console.info("[diag.create_lead.success]", {
        created_record_id: input.createdRecordId,
        resolved_status_key: input.statusKey,
        resolved_work_unit_id: input.workUnitId,
        new_leads_status_member: createdLeadStatusIsNewLeadsMember(input.statusKey),
    });
}
