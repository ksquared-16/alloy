/**
 * Consumer adapter — participant conversational interpretation (V1.1).
 *
 * The narrowest seam. It assembles the bounded current-turn facts, submits a Decision Contract, and
 * receives a Decision Package. It names no strategy, no provider and no model, and it mutates
 * nothing.
 *
 * ## What comes out, and what does not
 *
 * A `StructuredCandidate` — the same type the deterministic interpreter returns. Nothing downstream
 * can tell which produced it, and that is the design: provider participation changes interpretation
 * QUALITY, never authority. The candidate still passes Participant Runtime's own validation before
 * any command runs.
 *
 * ## Failing to a candidate, not to an exception
 *
 * Every failure — unauthorized, unconfigured, refused, timed out, malformed, validation-refused —
 * returns `null` so the caller falls back to the deterministic interpreter. A participant must be
 * able to finish Enrollment while the provider is down, so an error thrown from here would convert
 * an advisory enhancement into a hard dependency.
 *
 * @see lib/enrollment/participantRuntime/turnInterpretationEligibility.ts — what may be interpreted
 * @see lib/trust/capabilities/participantConversationInterpretation/informationSpec.ts — what is sent
 */

import { PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY } from "@/lib/trust/capabilities/participantConversationInterpretation/keys";
import { PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY } from "@/lib/trust/capabilities/participantConversationInterpretation/keys";
import {
    participantInterpretationInformationSpec,
    type ParticipantInterpretationSource,
} from "@/lib/trust/capabilities/participantConversationInterpretation/informationSpec";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { resolvePrivacyPolicy } from "@/lib/trust/privacy/privacyEngine";
import { turnIsEligibleForProviderInterpretation } from "@/lib/enrollment/participantRuntime/turnInterpretationEligibility";
import type { ParticipantTurn, StructuredCandidate } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import { parseStructuredCandidate } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import type { FormField } from "@/lib/forms/schema";

export type ParticipantInterpretationRequest = {
    readonly org_id: string;
    readonly turn: ParticipantTurn;
    /** The participant's own words. Admitted under D-101/D-102, and nothing else is. */
    readonly response_text: string;
    /** The authored control, for the value type and any closed vocabulary. */
    readonly field: FormField | null;
    readonly correlation_id: string;
    readonly initiating_actor: TrustInitiatingActor;
    readonly channel: TrustChannel;
    /** Affirmative provider permission. Absent or false keeps the deterministic path. */
    readonly provider_reasoning_permitted: boolean;
    readonly repository?: TrustRepository;
    readonly nowIso: string;
};

export type ParticipantInterpretationOutcome = {
    /** Null whenever the provider path did not produce a usable candidate, for ANY reason. */
    readonly candidate: StructuredCandidate | null;
    /** Present whenever execution reached Trust, success or failure. The audit trail. */
    readonly decision_package: DecisionPackageV1 | null;
    /** Why the provider path was not used. Null on success. */
    readonly skipped_reason: string | null;
};

const NOT_ATTEMPTED = (reason: string): ParticipantInterpretationOutcome => ({
    candidate: null,
    decision_package: null,
    skipped_reason: reason,
});

/** A human-readable statement of the value's shape, for the model. Closed vocabulary only. */
function valueConstraintFor(field: FormField | null): string | null {
    switch (field?.type) {
        case "date":
            return "ISO calendar date (YYYY-MM-DD)";
        case "number":
            return "a number";
        case "boolean":
            return "yes or no";
        case "select":
        case "multiselect":
            return "one of the listed choices";
        default:
            return null;
    }
}

function allowedValuesFor(field: FormField | null): readonly (string | null)[] | null {
    if (field?.type !== "select" && field?.type !== "multiselect") return null;
    const options = field.static_options ?? [];
    return options.length ? options.map((o) => o.value) : null;
}

export async function interpretParticipantResponseViaTrust(
    request: ParticipantInterpretationRequest,
): Promise<ParticipantInterpretationOutcome> {
    // 1. Affirmative permission. The absence of a denial is not a permission (D-42).
    if (!request.provider_reasoning_permitted) {
        return NOT_ATTEMPTED("Provider reasoning is not permitted for this organization.");
    }

    // 2. ELIGIBILITY. The D-101 allow-list, unchanged and checked before anything is assembled —
    //    so an ineligible turn's text is never even placed in a package, let alone transmitted.
    const eligibility = turnIsEligibleForProviderInterpretation(request.turn);
    if (!eligibility.eligible) return NOT_ATTEMPTED(eligibility.reason);

    const text = (request.response_text ?? "").trim();
    if (!text) return NOT_ATTEMPTED("The participant supplied no response text to interpret.");

    // 3. The bounded current-turn facts. Assembled HERE from the deterministic turn, never from a
    //    request body: the client supplies words, and the platform supplies everything they mean.
    const source: ParticipantInterpretationSource = {
        turn_kind: request.turn.kind,
        need_field_key: eligibility.field_key,
        value_type: request.field?.type ?? "text",
        allowed_values: allowedValuesFor(request.field),
        proposed_value:
            request.turn.proposed_value === null || request.turn.proposed_value === undefined
                ? null
                : String(request.turn.proposed_value),
        participant_response_text: text,
        allowed_candidate_kinds: [],
        value_constraint: valueConstraintFor(request.field),
    };

    const built = buildInformationPackage({
        spec: participantInterpretationInformationSpec,
        source,
        sourceRefs: { turn_kind: request.turn.kind, need_field_key: eligibility.field_key },
    });
    if (!built.ok) return NOT_ATTEMPTED(`Information package refused: ${built.refusal_code}`);

    const policy = resolvePrivacyPolicy(PARTICIPANT_CONVERSATION_ADMISSION_POLICY_KEY);
    if (!policy) return NOT_ATTEMPTED("The participant conversation privacy policy is not registered.");

    // 4. Privacy runs HERE, under D-101/D-102, and its evidence travels with the input.
    const eligibleInput = buildEligibleReasoningInput({ package: built.package, policy });
    if (!eligibleInput.ok) {
        return NOT_ATTEMPTED(`Privacy refused the participant response: ${eligibleInput.refusal_code}`);
    }

    const contractResult = createDecisionContract({
        org_id: request.org_id,
        decision_class_key: PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,
        intent: "Interpret the participant's response to the current Enrollment turn.",
        // DECLARED operational context — the turn's shape, never the participant's words. The
        // response itself travels only through the governed package, where privacy applies to it.
        context: { turn_kind: request.turn.kind, need_field_key: eligibility.field_key },
        correlation_id: request.correlation_id,
        initiating_actor: request.initiating_actor,
        channel: request.channel,
        nowIso: request.nowIso,
    });
    if (!contractResult.ok) {
        return NOT_ATTEMPTED(`Decision contract refused: ${contractResult.refusal_code}`);
    }

    const decision = await executeDecisionContract({
        contract: contractResult.contract,
        eligibleReasoningInput: eligibleInput.input,
        resolvedInformation: {},
        semanticMap: {},
        nowIso: request.nowIso,
        ...(request.repository ? { repository: request.repository } : {}),
    });

    // 5. Only a VALIDATED recommendation may become a candidate. A package whose outcome is anything
    //    else — refused policy, refused privacy, failed validation, provider failure — yields null,
    //    and the caller falls back. Provider output is never a session command.
    if (decision.outcome !== "accepted") {
        return {
            candidate: null,
            decision_package: decision,
            skipped_reason: `Governed interpretation was not accepted (${decision.outcome}).`,
        };
    }

    const recommendation = decision.reasoning?.proposal?.recommendation as
        | { interpretation?: unknown; value?: unknown }
        | undefined;

    // 6. Mapped into the EXISTING candidate type through the EXISTING parser, so the same
    //    structural drop applies to a provider's output as to anything else: a field key, a
    //    command or a requirement id cannot survive the trip.
    const candidate = parseStructuredCandidate({
        kind: recommendation?.interpretation,
        ...(recommendation?.value !== undefined ? { value: recommendation.value } : {}),
    });

    return { candidate, decision_package: decision, skipped_reason: null };
}
