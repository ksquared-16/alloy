/**
 * Production ratification gateway (P1 · Wave C · C2) — wires the pure ratification
 * orchestration to infrastructure: the `oe.ledger.author` (P1) flag, a tenant-
 * checked expectation read, and the atomic `ratify_operational_expectation` RPC,
 * all through the service-role admin client. The authoritative Ratification Act is
 * the outbox row written inside the RPC transaction (no separate event bus).
 *
 * Server-only (service role). Not a product-facing surface.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { isOeLedgerAuthorEnabledForOrg } from "@/lib/operationalExpectations/intake/ledgerAuthoringFeatureFlag";
import { resolveRatificationContext } from "@/lib/operationalExpectations/ratification/ratificationServerContext";
import type { OperationalModality } from "@/lib/operationalExpectations/expectationLedgerContract";
import type {
    RatificationCommitOutcome,
    RatificationGateway,
    RatificationRecord,
    RatificationTargetRow,
} from "@/lib/operationalExpectations/ratification/ratificationGateway";
import { ratifyOperationalExpectation } from "@/lib/operationalExpectations/ratification/ratifyOperationalExpectation";
import type {
    RatificationResult,
    RatifyInput,
} from "@/lib/operationalExpectations/ratification/ratificationTypes";

type Admin = ReturnType<typeof createAdminClient>;

export function createSupabaseRatificationGateway(admin: Admin = createAdminClient()): RatificationGateway {
    return {
        async isRatificationEnabled(orgId: string): Promise<boolean> {
            return isOeLedgerAuthorEnabledForOrg(admin, orgId);
        },

        async loadExpectation(expectationId: string): Promise<RatificationTargetRow | null> {
            const { data, error } = await admin
                .from("operational_expectations")
                .select("id, org_id, modality, standing")
                .eq("id", expectationId)
                .maybeSingle();
            if (error || !data) return null;
            const row = data as { id: string; org_id: string; modality: string; standing: string };
            return {
                id: row.id,
                orgId: row.org_id,
                modality: row.modality as OperationalModality,
                standing: row.standing as RatificationTargetRow["standing"],
            };
        },

        async commit(orgId, actorUserId, record): Promise<RatificationCommitOutcome> {
            const { data, error } = await admin.rpc("ratify_operational_expectation", {
                p_org_id: orgId,
                p_actor_user_id: actorUserId,
                p_ratification: recordToRpcPayload(record),
            });

            if (error) {
                if ((error.message ?? "").includes("oe_ratification_conflict")) return { kind: "conflict" };
                return { kind: "error", message: error.message ?? "rpc_error" };
            }
            const r = (data ?? {}) as Record<string, unknown>;
            const ratificationId = String(r.ratification_id ?? "");
            if (!ratificationId) return { kind: "error", message: "empty_rpc_result" };
            return {
                kind: "committed",
                idempotent: r.idempotent === true,
                ratificationId,
                ratificationActEventId: String(r.authoring_act_event_id ?? ""),
                ratifiedAt: String(r.ratified_at ?? ""),
            };
        },
    };
}

function recordToRpcPayload(record: RatificationRecord): Record<string, unknown> {
    return {
        idempotency_key: record.idempotencyKey,
        payload_fingerprint: record.payloadFingerprint,
        expectation_id: record.expectationId,
        ratifier_authority_key: record.ratifierAuthorityKey,
        ratified_by_label: record.ratifiedByLabel,
        rationale: record.rationale,
    };
}

/**
 * The canonical server entry point. Supported callers pass ONLY `input`; the org,
 * actor, and the `operational_expectations.ratify` capability are resolved server-
 * side. A caller can never supply org/actor/permission. AI cannot reach this path.
 */
export async function ratifyOperationalExpectationServer(input: RatifyInput): Promise<RatificationResult> {
    const resolved = resolveRatificationContext(await getAdminAccessContextCached());
    if (!resolved.ok) return resolved.result;
    return ratifyOperationalExpectation(input, resolved.context, createSupabaseRatificationGateway());
}
