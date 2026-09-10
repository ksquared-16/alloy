/**
 * Production ratification gateway (P1 · Wave C · C2) — wires the pure ratification
 * orchestration to infrastructure: the `oe.ledger.author` (P1) flag or an
 * activated purpose, a tenant-
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

/**
 * `purpose` is the SAME scoped-activation seam the authoring gateway already
 * takes, and it is here for symmetry rather than convenience.
 *
 * Authoring an activated purpose needs no global env flag; ratifying the very
 * same vocabulary did, because this gateway passed no purpose. The consequence
 * was not theoretical: a family could submit a known-away intent through an
 * activated purpose, and nobody could ratify it, because promotion still waited
 * on a rollout control over the GENERIC intake. A door that opens one way is not
 * a workflow.
 *
 * Omitted, behaviour is exactly as before — the env flag decides. Supplied, the
 * caller names a purpose that has already been reviewed and activated for
 * production, which is the same bar authoring clears. It widens nothing: an
 * unactivated purpose still falls back to the env flag, and a tenant's opt-out
 * still wins either way.
 */
export function createSupabaseRatificationGateway(
    admin: Admin = createAdminClient(),
    purpose?: string | null,
): RatificationGateway {
    return {
        async isRatificationEnabled(orgId: string): Promise<boolean> {
            return isOeLedgerAuthorEnabledForOrg(admin, orgId, purpose);
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
                const msg = error.message ?? "";
                if (msg.includes("oe_insufficient_authority")) return { kind: "insufficient_authority" };
                if (msg.includes("oe_ratification_conflict")) return { kind: "conflict" };
                return { kind: "error", message: msg || "rpc_error" };
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
