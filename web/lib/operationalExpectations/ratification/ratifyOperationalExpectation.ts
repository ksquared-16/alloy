/**
 * Operational Expectations — the ONE ratification path (P1 · Wave C · C2).
 *
 * `ratifyOperationalExpectation(input, context, gateway)` promotes a `proposed`
 * deontic expectation to effective `binding` standing via an immutable, lineage-
 * linked Ratification Act. Order:
 *   1. authenticated-actor + ratify-capability gate (context is resolved server-
 *      side; a caller cannot manufacture it);
 *   2. `oe.ledger.author` (P1) flag — OFF ⇒ typed `disabled`, nothing written;
 *   3. tenant-checked target load — the expectation must exist, be same-org, be a
 *      DEONTIC modality, and be currently `proposed` (predicted stands at model and
 *      is not ratifiable; an already-binding one is not re-ratified);
 *   4. atomic commit (ratification record + one Ratification Act), idempotent.
 *
 * NEVER throws — every outcome is a typed `RatificationResult`. It does NOT author
 * a tuple, evaluate, judge, or derive gaps. AI cannot reach this path (it does not
 * hold the ratify capability), so AI can never self-ratify.
 */

import { createHash } from "node:crypto";
import type {
    RatificationContext,
    RatificationResult,
    RatifyInput,
} from "@/lib/operationalExpectations/ratification/ratificationTypes";
import type {
    RatificationGateway,
    RatificationRecord,
} from "@/lib/operationalExpectations/ratification/ratificationGateway";

const DEONTIC = new Set(["required", "prohibited", "intended", "committed"]);

function fingerprint(input: RatifyInput, context: RatificationContext): string {
    const material = {
        expectationId: input.expectationId,
        rationale: input.rationale ?? null,
        ratifierAuthorityKey: context.ratifierAuthorityKey,
    };
    return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export async function ratifyOperationalExpectation(
    input: RatifyInput,
    context: RatificationContext,
    gateway: RatificationGateway,
): Promise<RatificationResult> {
    // 1. Security gate — a trusted authenticated actor holding the ratify capability.
    if (!context.actorAuthenticated || !context.orgId) {
        return { status: "rejected", code: "unauthorized", message: "An authenticated org actor holding the ratify capability is required." };
    }
    if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length === 0) {
        return { status: "rejected", code: "invalid_idempotency_key", message: "An idempotency key is required." };
    }
    if (typeof input.expectationId !== "string" || input.expectationId.trim().length === 0) {
        return { status: "rejected", code: "invalid_expectation_ref", message: "An expectation reference is required." };
    }

    // 2. Feature flag.
    if (!(await gateway.isRatificationEnabled(context.orgId))) {
        return { status: "disabled" };
    }

    // 3. Tenant-checked target load + ratifiability.
    const target = await gateway.loadExpectation(input.expectationId);
    if (!target) {
        return { status: "rejected", code: "expectation_not_found", message: "The referenced expectation does not exist." };
    }
    if (target.orgId !== context.orgId) {
        return { status: "rejected", code: "cross_org_expectation", message: "An expectation must belong to the same organization." };
    }
    if (!DEONTIC.has(target.modality)) {
        return { status: "rejected", code: "not_ratifiable_modality", message: "Only deontic/commissive expectations are ratifiable (predicted stands at model)." };
    }
    if (target.standing !== "proposed") {
        return { status: "rejected", code: "not_proposed", message: "Only a proposed expectation may be ratified." };
    }

    // 4. Atomic commit (ratification record + one Ratification Act), idempotent.
    const record: RatificationRecord = {
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: fingerprint(input, context),
        expectationId: input.expectationId,
        ratifierAuthorityKey: context.ratifierAuthorityKey,
        ratifiedByLabel: context.actorLabel ?? null,
        rationale: input.rationale ?? null,
    };

    const outcome = await gateway.commit(context.orgId, context.actorUserId, record);
    if (outcome.kind === "insufficient_authority") {
        return { status: "rejected", code: "insufficient_authority", message: "The ratifier does not hold sufficient authority for this expectation." };
    }
    if (outcome.kind === "conflict") {
        return { status: "conflict", code: "ratification_conflict", message: "This ratification key was already used with a different payload." };
    }
    if (outcome.kind === "error") {
        return { status: "failed", message: "The ratification could not be committed." };
    }

    return {
        status: "ratified",
        idempotent: outcome.idempotent,
        ratificationActEventId: outcome.ratificationActEventId,
        act: {
            ratificationId: outcome.ratificationId,
            expectationId: input.expectationId,
            newStanding: "binding",
            ratifiedAt: outcome.ratifiedAt,
        },
    };
}
