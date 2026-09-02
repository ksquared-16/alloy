/**
 * Server-side Enrollment Date stamp onto enrollment process_instances.
 *
 * Authority: process-instance metadata (see effectiveDateAuthority).
 * Trigger: configured paperwork-completion outcome target, or compat approve_enrollment.
 * Does not hardcode form/packet names — callers decide when to invoke.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    ENROLLMENT_SUBJECT_TYPE,
    PROCESS_INSTANCES_TABLE,
} from "@/lib/process/processInstances";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    mergeEnrollmentDateOntoProcessMetadata,
    type EnrollmentDateStamp,
} from "@/lib/enrollment/effectiveDateAuthority";

export type StampEnrollmentDateResultRow = {
    processInstanceId: string;
    subjectId: string;
    wrote: boolean;
    refusedOverwrite: boolean;
    /** Prior metadata document when a write succeeded — for outcome-target undo. */
    priorMetadata?: Record<string, unknown>;
};

export type StampEnrollmentDateResult = {
    stamped: StampEnrollmentDateResultRow[];
    error?: string;
};

function todayYmd(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

type ProcessInstanceMetaRow = {
    id: string;
    subject_id: string;
    metadata: Record<string, unknown> | null;
};

/**
 * Stamp Enrollment Date onto enrollment process instance(s) for a lead (+ optional child).
 * Uses mergeEnrollmentDateOntoProcessMetadata — refuses silent overwrite on reopen.
 */
export async function stampEnrollmentDateOnProcessInstances(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityId: string;
        /** When set, only this child's enrollment instance is considered. */
        customerMemberId?: string | null;
        /** Most specific: stamp exactly this process instance (must match org + opportunity). */
        processInstanceId?: string | null;
        enrollmentDate?: string | null;
        source: EnrollmentDateStamp["source"];
        actorUserId?: string | null;
        reason?: string | null;
        now?: Date;
    },
): Promise<StampEnrollmentDateResult> {
    const now = args.now ?? new Date();
    const enrollmentDate = (args.enrollmentDate ?? todayYmd(now)).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(enrollmentDate)) {
        return { stamped: [], error: "Invalid enrollment date" };
    }

    const stamp: EnrollmentDateStamp = {
        enrollment_date: enrollmentDate.slice(0, 10),
        source: args.source,
        stamped_at: now.toISOString(),
        actor_user_id: args.actorUserId ?? null,
        reason: args.reason ?? null,
    };

    /*
     * THE OPPORTUNITY'S JOURNEYS, UNDER EITHER ANCHOR.
     *
     * This matched `context_type = 'opportunity' AND context_id = <opportunity>`, which is now only
     * the older shape. A journey anchored to its Enrollment Participation would have matched
     * NOTHING — and the failure is silent by construction: stamping reports the rows it stamped, so
     * zero rows reads as "no journeys here" rather than as a defect. An acquisition outcome would
     * have recorded an enrollment date onto nobody.
     *
     * So the participations belonging to this Opportunity are resolved first, and both anchors are
     * accepted. The Opportunity id itself stays in the list: journeys written before the convergence
     * are still stamped by the same call, with no backfill dependency.
     */
    const { data: participationRows, error: participationError } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", args.orgId)
        .eq("opportunity_id", args.opportunityId);
    if (participationError) return { stamped: [], error: participationError.message };
    const contextIds = [
        args.opportunityId,
        ...((participationRows ?? []) as { id: string }[]).map((r) => String(r.id)),
    ];

    let query = supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id, subject_id, metadata")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_type", ENROLLMENT_SUBJECT_TYPE)
        .in("context_id", contextIds);

    const processInstanceId = args.processInstanceId?.trim();
    const customerMemberId = args.customerMemberId?.trim();
    if (processInstanceId) {
        query = query.eq("id", processInstanceId);
    } else if (customerMemberId) {
        query = query.eq("subject_id", customerMemberId);
    }

    const { data, error } = await query;
    if (error) return { stamped: [], error: error.message };

    const rows = (data ?? []) as ProcessInstanceMetaRow[];
    const stamped: StampEnrollmentDateResultRow[] = [];

    for (const row of rows) {
        const prior =
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? { ...(row.metadata as Record<string, unknown>) }
                : {};
        const merged = mergeEnrollmentDateOntoProcessMetadata(prior, stamp);
        if (!merged.wrote) {
            stamped.push({
                processInstanceId: row.id,
                subjectId: row.subject_id,
                wrote: false,
                refusedOverwrite: merged.refusedOverwrite,
            });
            continue;
        }

        const { error: upErr } = await supabase
            .from(PROCESS_INSTANCES_TABLE)
            .update({ metadata: merged.metadata, updated_at: now.toISOString() })
            .eq("id", row.id)
            .eq("org_id", args.orgId);
        if (upErr) return { stamped, error: upErr.message };

        stamped.push({
            processInstanceId: row.id,
            subjectId: row.subject_id,
            wrote: true,
            refusedOverwrite: false,
            priorMetadata: prior,
        });
    }

    return { stamped };
}
