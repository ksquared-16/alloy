/**
 * The certification execution adapter — TypeScript → Supabase RPC → atomic transaction.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * Extracted from the execute script so the SUBJECT UNDER TEST is the same code that runs against
 * hosted Firefly. The previous slice certified the database function standalone and left this seam
 * — payload shape, invocation, response parsing — unexercised. That is the seam that has failed
 * before: a wrong column name and a wrong table name both reached a destructive hosted run because
 * nothing between the plan and the database was ever executed.
 *
 * Storage is deliberately NOT handled here. It cannot join the Postgres transaction, so it is
 * sequenced by the caller strictly after a committed, verified database result.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import type { DemoCleanupScope, ResolvedDemoIds } from "./demoRuntimeCleanupScope";
import { CERTIFICATION_RESET_PURPOSE } from "./certificationPlanIdentity";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const CERTIFICATION_RESET_RPC = "certification_reset_execute";

/** Exactly the arrays the RPC destructures. Pinned so a rename cannot pass silently. */
export const CERTIFICATION_GRAPH_FIELDS = [
    "opportunity_ids",
    "customer_ids",
    "person_ids",
    "customer_member_ids",
    "thread_ids",
    "document_ids",
    "form_submission_ids",
    "form_packet_session_ids",
    "contact_ids",
    "operational_task_ids",
    "workflow_event_ids",
    "processing_case_ids",
    "processing_plan_ids",
] as const;

export type CertificationGraph = Record<(typeof CERTIFICATION_GRAPH_FIELDS)[number], string[]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build the RPC payload from a resolved graph. Pure — testable without a database. */
export function buildCertificationGraph(ids: ResolvedDemoIds): CertificationGraph {
    return {
        opportunity_ids: ids.opportunityIds,
        customer_ids: ids.customerIds,
        person_ids: ids.personIds,
        customer_member_ids: ids.customerMemberIds,
        thread_ids: ids.threadIds,
        document_ids: ids.documentIds,
        form_submission_ids: ids.formSubmissionIds,
        form_packet_session_ids: ids.residue?.formPacketSessionIds ?? [],
        contact_ids: ids.residue?.contactIds ?? [],
        operational_task_ids: ids.residue?.operationalTaskIds ?? [],
        workflow_event_ids: ids.residue?.workflowEventIds ?? [],
        processing_case_ids: ids.processingCaseIds ?? [],
        processing_plan_ids: ids.processingPlanIds ?? [],
    };
}

/** Every field present, every value a uuid. Checked BEFORE the call, never inside it. */
export function validateCertificationGraph(graph: CertificationGraph): string[] {
    const problems: string[] = [];
    for (const field of CERTIFICATION_GRAPH_FIELDS) {
        const values = (graph as Record<string, unknown>)[field];
        if (!Array.isArray(values)) {
            problems.push(`${field} is missing or not an array`);
            continue;
        }
        for (const v of values) {
            if (typeof v !== "string" || !UUID.test(v)) {
                problems.push(`${field} contains a non-uuid value`);
                break;
            }
        }
    }
    for (const key of Object.keys(graph)) {
        if (!(CERTIFICATION_GRAPH_FIELDS as readonly string[]).includes(key)) {
            problems.push(`unexpected graph field "${key}"`);
        }
    }
    return problems;
}

export type CertificationResetResult = {
    deleted: Record<string, number>;
    totalDeleted: number;
};

/**
 * Invoke the governed reset authority.
 *
 * Every failure mode throws. The caller may only proceed to storage after this returns, which is
 * what makes "database failure ⇒ zero storage deletions" a structural property rather than a
 * discipline the caller has to remember.
 */
export async function executeCertificationResetAtomically(
    supabase: SupabaseAdmin,
    scope: DemoCleanupScope,
    ids: ResolvedDemoIds,
    options: { actor?: string; log?: (msg: string) => void } = {},
): Promise<CertificationResetResult> {
    const log = options.log ?? (() => {});
    if (!scope.certificationBaseline) {
        throw new Error("executeCertificationResetAtomically called outside certification mode");
    }

    const graph = buildCertificationGraph(ids);
    const problems = validateCertificationGraph(graph);
    if (problems.length) {
        throw new Error(`Refusing to invoke the reset authority — malformed graph: ${problems.join("; ")}`);
    }

    log(`invoking ${CERTIFICATION_RESET_RPC} for org ${scope.orgId}`);
    for (const f of CERTIFICATION_GRAPH_FIELDS) if (graph[f].length) log(`  ${f}: ${graph[f].length}`);

    const { data, error } = await supabase.rpc(CERTIFICATION_RESET_RPC, {
        p_org_id: scope.orgId,
        p_purpose: CERTIFICATION_RESET_PURPOSE,
        p_actor: options.actor ?? process.env.ALLOY_RESET_ACTOR?.trim() ?? "certification-reset-utility",
        p_graph: graph,
    });

    if (error) {
        throw new Error(
            `${CERTIFICATION_RESET_RPC} FAILED — database rolled back, zero rows deleted, ` +
                `zero storage objects touched: ${error.message}`,
        );
    }

    // Fail closed on anything that is not the shape we certified. A null or a bare `true` must not
    // be read as "nothing needed deleting".
    if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(`${CERTIFICATION_RESET_RPC} returned a malformed response; treating as failure`);
    }
    const result = data as { ok?: unknown; deleted?: unknown };
    if (result.ok !== true) {
        throw new Error(`${CERTIFICATION_RESET_RPC} returned a non-ok result; treating as failure`);
    }
    if (result.deleted === null || typeof result.deleted !== "object" || Array.isArray(result.deleted)) {
        throw new Error(`${CERTIFICATION_RESET_RPC} returned no deletion counts; treating as failure`);
    }

    const deleted: Record<string, number> = {};
    for (const [table, n] of Object.entries(result.deleted as Record<string, unknown>)) {
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
            throw new Error(`${CERTIFICATION_RESET_RPC} returned a non-numeric count for "${table}"`);
        }
        deleted[table] = n;
    }

    return { deleted, totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0) };
}
