/**
 * Operational Expectations — the ONE authoring intake (P1 · Wave B).
 *
 * `authorOperationalExpectation(input, context, gateway)` is the single supported
 * write path into the authored Expectation ledger. Order of operations:
 *   1. authenticated-actor + trusted-org gate (Wave B security; Standing = Wave C);
 *   2. `oe.ledger.author` flag — OFF ⇒ typed `disabled` result, nothing written;
 *   3. pure frozen-grammar validation (modality closure, tuple, semantic line,
 *      temporal frame, footprint, verb/predecessor shape);
 *   4. predecessor resolution with TENANCY (non-create acts) — existence, same
 *      org, subject/lineage compatibility;
 *   5. provisional Standing clamp — NEVER binding (Wave C resolves Authority→
 *      Standing); a caller cannot select an effective standing;
 *   6. atomic commit via the gateway (row + one Authoring Act, one transaction),
 *      idempotent per (org, key).
 *
 * It NEVER throws to the caller — every outcome is a typed `AuthoringResult`. It
 * does NOT evaluate the Condition, derive Judgment/Gap, resolve final Standing,
 * or implement revision/correction propagation (later waves/packages).
 *
 * The organization and actor come only from the server-trusted `context`, never
 * from `input`.
 */

import { VERB_TRANSITION_MAP } from "@/lib/operationalExpectations/expectationLedgerContract";
import type {
    AuthoringContext,
    AuthoringInput,
    AuthoringResult,
} from "@/lib/operationalExpectations/intake/authoringTypes";
import { validateAuthoringTuple } from "@/lib/operationalExpectations/intake/validateAuthoringTuple";
import { fingerprintAuthoringInput } from "@/lib/operationalExpectations/intake/authoringFingerprint";
import type {
    AuthoringActRecord,
    AuthoringGateway,
} from "@/lib/operationalExpectations/intake/authoringGateway";

/**
 * Provisional standing for Wave B, DERIVED from modality alone — never a caller
 * input. Standing is NOT resolved here (Wave C). A `predicted` expectation imposes
 * no obligation so it may stand at non-binding `model` (System Design §12);
 * everything else lands `proposed` (pending Wave C Authority→Standing resolution).
 * `binding` is unreachable — Wave B grants no effective standing.
 */
function provisionalStanding(input: AuthoringInput): "proposed" | "model" {
    return input.modality === "predicted" ? "model" : "proposed";
}

export async function authorOperationalExpectation(
    input: AuthoringInput,
    context: AuthoringContext,
    gateway: AuthoringGateway,
): Promise<AuthoringResult> {
    // 1. Security gate — server-trusted authenticated actor + org. Reaching the
    //    intake is NOT authorization to bind (that is Wave C); but an
    //    unauthenticated/orgless caller cannot author at all.
    if (!context.actorAuthenticated || !context.orgId) {
        return { status: "rejected", code: "unauthorized", message: "An authenticated org actor is required to author." };
    }

    // 2. Feature flag — OFF ⇒ Facts-only, nothing written.
    const enabled = await gateway.isAuthoringEnabled(context.orgId);
    if (!enabled) return { status: "disabled" };

    // 3. Pure frozen-grammar validation.
    const grammar = validateAuthoringTuple(input);
    if (!grammar.ok) {
        return { status: "rejected", code: grammar.code, message: grammar.message, field: grammar.field };
    }

    // 4. Predecessor resolution with tenancy (non-create acts). The DB no-self-ref
    //    + cross-org lineage trigger are the final guard; we surface distinct,
    //    caller-safe reasons here.
    let supersedesExpectationId: string | null = null;
    if (input.verb !== "create") {
        const predecessorId = (input.predecessorId ?? "").trim();
        const predecessor = await gateway.loadPredecessor(predecessorId);
        if (!predecessor) {
            return { status: "rejected", code: "predecessor_not_found", message: "The referenced predecessor does not exist.", field: "predecessorId" };
        }
        if (predecessor.orgId !== context.orgId) {
            return { status: "rejected", code: "cross_org_predecessor", message: "A predecessor must belong to the same organization.", field: "predecessorId" };
        }
        if (predecessor.subjectKind !== input.subjects[0]?.kind) {
            return { status: "rejected", code: "subject_lineage_mismatch", message: "A supersession must govern the same subject kind as its predecessor.", field: "subjects" };
        }
        supersedesExpectationId = predecessor.id;
    }

    // 5. Provisional standing (clamped) + transition typing (Revision≠Correction).
    const standing = provisionalStanding(input);
    const transitionType = VERB_TRANSITION_MAP[input.verb];

    // 6. Atomic commit (row + one Authoring Act, one transaction), idempotent.
    const act: AuthoringActRecord = {
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: fingerprintAuthoringInput(input),
        authorityKey: input.authority.authorityKey,
        authorClass: input.authority.authorClass,
        modality: input.modality,
        subjectKind: input.subjects[0].kind,
        subjectRef: input.subjects,
        condition: input.condition,
        temporalFrame: input.temporalFrame,
        beneficiary: input.beneficiary ?? null,
        verb: input.verb,
        transitionType,
        supersedesExpectationId,
        standing,
        footprint: input.footprint,
        validFrom: input.temporalFrame.validFrom,
        validTo: input.temporalFrame.validTo ?? null,
        configVersionRef: input.configVersionRef ?? null,
        authoredByLabel: context.actorLabel ?? null,
        // Held-authority resolution: the holder is the trusted actor (human) —
        // the author RPC resolves authority server-side and decides binding.
        authorityHolderId: context.actorUserId,
        authorityScopeType: "subject_type",
        authorityScopeId: input.subjects[0]?.kind ?? null,
    };

    const outcome = await gateway.commit(context.orgId, context.actorUserId, act);
    if (outcome.kind === "conflict") {
        return { status: "conflict", code: "idempotency_conflict", message: "This idempotency key was already used with a different payload." };
    }
    if (outcome.kind === "error") {
        return { status: "failed", message: "The authoring act could not be committed." };
    }

    return {
        status: "authored",
        idempotent: outcome.idempotent,
        authoringActEventId: outcome.authoringActEventId,
        act: {
            id: outcome.expectationId,
            orgId: context.orgId,
            verb: input.verb,
            modality: input.modality,
            transitionType: outcome.transitionType,
            supersedesExpectationId: outcome.supersedesExpectationId,
            lineageRootId: outcome.lineageRootId,
            standing: outcome.standing,
            authoredAt: outcome.authoredAt,
        },
    };
}
