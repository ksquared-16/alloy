/**
 * Production authoring gateway (P1 · Wave B) — wires the pure intake orchestration
 * to infrastructure: the `oe.ledger.author` flag, a predecessor read, and the
 * atomic commit RPC (`author_operational_expectation`), all through the
 * service-role admin client. A best-effort, NON-FATAL fan-out to the
 * `workflow_events` spine mirrors the house convention (leadStatus.ts) — the
 * authoritative Authoring Act is the outbox row written inside the RPC
 * transaction, never this fan-out.
 *
 * Server-only (service role). Not a product-facing authoring surface.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { isOeLedgerAuthorEnabledForOrg } from "@/lib/operationalExpectations/intake/ledgerAuthoringFeatureFlag";
import { resolveAuthoringContext } from "@/lib/operationalExpectations/intake/authoringServerContext";
import type {
    AuthoringActRecord,
    AuthoringGateway,
    CommitOutcome,
    PredecessorRow,
} from "@/lib/operationalExpectations/intake/authoringGateway";
import type {
    ExpectationTransitionType,
    OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";
import {
    authorOperationalExpectation,
} from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import type {
    AuthoringInput,
    AuthoringResult,
} from "@/lib/operationalExpectations/intake/authoringTypes";

type Admin = ReturnType<typeof createAdminClient>;

function actToRpcPayload(act: AuthoringActRecord): Record<string, unknown> {
    return {
        idempotency_key: act.idempotencyKey,
        payload_fingerprint: act.payloadFingerprint,
        authority_key: act.authorityKey,
        author_class: act.authorClass,
        modality: act.modality,
        subject_kind: act.subjectKind,
        subject_ref: act.subjectRef,
        condition: act.condition,
        temporal_frame: act.temporalFrame,
        beneficiary: act.beneficiary ?? null,
        verb: act.verb,
        transition_type: act.transitionType,
        supersedes_expectation_id: act.supersedesExpectationId,
        standing: act.standing,
        footprint: act.footprint,
        valid_from: act.validFrom,
        valid_to: act.validTo,
        config_version_ref: act.configVersionRef ?? null,
        authored_by_label: act.authoredByLabel,
    };
}

export function createSupabaseAuthoringGateway(admin: Admin = createAdminClient()): AuthoringGateway {
    return {
        async isAuthoringEnabled(orgId: string): Promise<boolean> {
            return isOeLedgerAuthorEnabledForOrg(admin, orgId);
        },

        async loadPredecessor(predecessorId: string): Promise<PredecessorRow | null> {
            const { data, error } = await admin
                .from("operational_expectations")
                .select("id, org_id, subject_kind, lineage_root_id, modality")
                .eq("id", predecessorId)
                .maybeSingle();
            if (error || !data) return null;
            const row = data as {
                id: string;
                org_id: string;
                subject_kind: string;
                lineage_root_id: string | null;
                modality: string;
            };
            return {
                id: row.id,
                orgId: row.org_id,
                subjectKind: row.subject_kind,
                lineageRootId: row.lineage_root_id,
                modality: row.modality as OperationalModality,
            };
        },

        async commit(orgId, actorUserId, act): Promise<CommitOutcome> {
            const { data, error } = await admin.rpc("author_operational_expectation", {
                p_org_id: orgId,
                p_actor_user_id: actorUserId,
                p_act: actToRpcPayload(act),
            });

            if (error) {
                if ((error.message ?? "").includes("oe_idempotency_conflict")) {
                    return { kind: "conflict" };
                }
                return { kind: "error", message: error.message ?? "rpc_error" };
            }

            const r = (data ?? {}) as Record<string, unknown>;
            const expectationId = String(r.expectation_id ?? "");
            const authoringActEventId = String(r.authoring_act_event_id ?? "");
            if (!expectationId) return { kind: "error", message: "empty_rpc_result" };

            // The ONE authoritative Authoring Act is the mutation_events outbox row
            // written inside the RPC transaction. No second event is emitted here —
            // a workflow_events fan-out would be an unregistered, duplicate
            // vocabulary with no current consumer, so it is deliberately omitted.
            return {
                kind: "committed",
                idempotent: r.idempotent === true,
                expectationId,
                authoringActEventId,
                transitionType: (r.transition_type as ExpectationTransitionType | null) ?? null,
                supersedesExpectationId: (r.supersedes_expectation_id as string | null) ?? null,
                lineageRootId: (r.lineage_root_id as string | null) ?? null,
                standing: (r.standing as "proposed" | "binding" | "model") ?? "proposed",
                authoredAt: String(r.authored_at ?? ""),
            };
        },
    };
}

/**
 * The canonical server entry point. Supported callers pass ONLY `input`; the org,
 * actor, and authoring capability are resolved server-side from the canonical admin
 * access context — a caller can never supply org identity, actor identity, or
 * permission grants. API routes / server actions / imports / future AI proposals
 * all delegate here — no duplicate write path, no manufacturable context.
 */
export async function authorOperationalExpectationServer(
    input: AuthoringInput,
): Promise<AuthoringResult> {
    const resolved = resolveAuthoringContext(await getAdminAccessContextCached());
    if (!resolved.ok) return resolved.result;
    return authorOperationalExpectation(input, resolved.context, createSupabaseAuthoringGateway());
}
