/**
 * Privacy Engine.
 *
 * Transforms classified information into the minimum trustworthy Reasoning
 * Context. Reasoning never receives raw operational truth — it receives what
 * this module produces, and nothing else.
 *
 * Privacy is achieved by minimization, not by post-processing.
 *
 * @see docs/platform/trust/privacy-runtime.md
 */

import type { ClassificationResult, InformationClass } from "@/lib/trust/classification/informationClasses";
import type { PiiMode, RedactionStep } from "@/lib/privacy/redactObject";
import { redactObjectForAi } from "@/lib/privacy/redactObject";
import type {
    TextMinimizationClass,
    TextMinimizationRecord,
    TextMinimizationRefusalCode,
} from "@/lib/privacy/minimizeTextContent";
import { minimizeTextContent, validateTextMinimizationRequest } from "@/lib/privacy/minimizeTextContent";
import type {
    ParticipantRedactionRecord,
    ParticipantRedactionRefusalCode,
} from "@/lib/privacy/redactKnownParticipants";
import { expandParticipantTokens, redactKnownParticipants } from "@/lib/privacy/redactKnownParticipants";
import type { PrivacyTransformRefusalCode, TransformationRecord } from "@/lib/trust/privacy/transformationDispatch";
import { applyTransformation } from "@/lib/trust/privacy/transformationDispatch";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

export type PrivacyPolicyV1 = {
    readonly key: string;
    readonly pii_mode: PiiMode;
    /** Classes this policy refuses to admit to reasoning at all. */
    readonly prohibited_classes: readonly InformationClass[];
    /**
     * Embedded information classes that must be minimized INSIDE admitted text.
     *
     * Absent or empty means no content-aware minimization runs, which is why
     * every policy registered before Phase 2.2 behaves exactly as it did: the
     * capability is opt-in per policy, not a new default applied to text that
     * was already reviewed under different rules.
     *
     * A class this platform cannot detect deterministically refuses the whole
     * transform — see {@link validateTextMinimizationRequest}.
     */
    readonly required_text_minimizers?: readonly TextMinimizationClass[];
    /**
     * Whether admitted text must have known participant names removed.
     *
     * Absent or false means no participant redaction runs, so every policy
     * registered before Phase 2.9a behaves exactly as it did — the capability is
     * opt-in per policy, never a new default.
     *
     * True makes the caller's roster MANDATORY: a policy that requires this and
     * receives no usable roster refuses the whole transform. That is what stops
     * the requirement from degrading into a no-op on the one thread whose
     * participants failed to resolve.
     *
     * This removes named-roster occurrences ONLY. It is not a person-name
     * detector, and `person_name` remains an unsupported minimization class —
     * see {@link redactKnownParticipants}.
     */
    readonly requires_participant_redaction?: boolean;
    /**
     * D-101. Classes this policy KNOWS it cannot deterministically minimize, declared so the
     * evidence can say so truthfully.
     *
     * ## Why this is not a bypass
     *
     * `required_text_minimizers` refuses an unsupported class, and that stays exactly as it was —
     * a policy claiming a transformation the platform cannot perform is still refused. This field
     * makes a different, narrower statement: *this policy admits text that may contain these
     * classes, no transformation is claimed for them, and the evidence records that.*
     *
     * The distinction matters because the alternative is worse. A policy that simply OMITS
     * `required_text_minimizers` also admits the text unminimized — but records nothing, so the
     * package looks clean and the gap is invisible. Declaring it makes the omission auditable.
     *
     * Opt-in per policy, like every other field here. Absent means absent: no existing policy
     * changes behaviour, and arbitrary application prose keeps refusing under its own policy.
     *
     * A class may never appear in BOTH this list and `required_text_minimizers` — that would claim
     * a transformation and disclaim it at once, and the transform refuses.
     */
    readonly acknowledged_unminimized_classes?: readonly TextMinimizationClass[];
};

/**
 * Re-exported from its platform-owned home. Doctrine places policy ownership
 * with the platform (`privacy-runtime.md` §Privacy Policies), so the definition
 * lives in `lib/trust/platform/` and capabilities reference it by key.
 */
export { ATTENTION_SUGGESTION_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";

/**
 * Absent returns `null`. The runtime turns a missing policy into a
 * `refused_policy` Decision Package rather than throwing — reasoning may not
 * proceed without a policy, and that refusal is auditable.
 *
 * A policy that a registered Decision Class *references* can never be missing
 * in practice: composition refuses a dangling reference at startup.
 */
export function resolvePrivacyPolicy(key: string): PrivacyPolicyV1 | null {
    return TRUST_REGISTRY.getPrivacyPolicy(key);
}

/**
 * What reasoning is allowed to see. Contains only transformed information plus
 * whatever knowledge was authorized — never a raw record, never a raw document.
 */
export type ReasoningContextV1 = {
    readonly transformed: Readonly<Record<string, unknown>>;
    readonly knowledge: readonly KnowledgeReference[];
    readonly redaction_steps: readonly RedactionStep[];
    readonly classes_present: readonly InformationClass[];
    readonly pii_mode: PiiMode;
    /**
     * What each element's transformation actually did — one record per declared
     * element, including withheld ones.
     *
     * This is the auditable half of the privacy claim. Before transformation
     * dispatch existed, the context reported the classes present but nothing
     * about whether their transformations had been performed, so a no-op was
     * indistinguishable from a transformation. A reader of this list can tell
     * `implemented` from `compatibility_preserved` without reading the engine.
     */
    readonly transformations: readonly TransformationRecord[];
    /**
     * What content-aware text minimization removed, per detector.
     *
     * Counts only. The matched substrings are the very thing being removed, so
     * recording one to prove the removal happened would defeat the removal.
     * Empty when the policy requires no text minimization.
     */
    readonly text_minimizations: readonly TextMinimizationRecord[];
    /**
     * What known-participant redaction removed, across all admitted text.
     *
     * Counts only, for the same reason as {@link text_minimizations}: the roster
     * entries and the matched spans are the identities being removed, so
     * recording either to prove the removal happened would defeat it.
     *
     * Empty when the policy requires no participant redaction.
     */
    readonly participant_redactions: readonly ParticipantRedactionRecord[];
    /**
     * D-101. Classes the policy admitted WITHOUT deterministic minimization, declared up front.
     *
     * The honest counterpart to {@link text_minimizations}. That list says what was removed; this
     * one says what the platform cannot remove and did not pretend to. A reader can tell an admitted
     * class from a transformed one without reading the engine, which is the whole point — evidence
     * that only reported successes would make an unminimized admission look identical to a clean one.
     *
     * Empty for every policy that does not declare it, which is every policy but the participant
     * conversation one.
     */
    readonly acknowledged_unminimized_classes: readonly TextMinimizationClass[];
};

export type KnowledgeReference = {
    readonly asset_key: string;
    readonly version: string;
    readonly provider_key: string;
};

export type PrivacyTransformRefusal =
    | "PRIVACY_PROHIBITED_CLASS"
    | "PRIVACY_CONTRADICTORY_MINIMIZATION_DECLARATION"
    | PrivacyTransformRefusalCode
    | TextMinimizationRefusalCode
    | ParticipantRedactionRefusalCode;

export type PrivacyTransformResult =
    | { readonly ok: true; readonly context: ReasoningContextV1 }
    | {
          readonly ok: false;
          readonly refusal_code: PrivacyTransformRefusal;
          readonly detail: string;
          /**
           * The per-element records produced before the refusal. Present so a
           * refusal is diagnosable without re-running the transform.
           */
          readonly transformations: readonly TransformationRecord[];
      };

/**
 * Applies the policy to classified elements and constructs the Reasoning
 * Context.
 *
 * Two refusals, and both refuse the WHOLE transform rather than dropping an
 * element:
 *
 *  - **`PRIVACY_PROHIBITED_CLASS`** — the policy refuses to admit this class of
 *    information at all. Checked first, and unchanged by this slice.
 *  - **`PRIVACY_TRANSFORM_UNSUPPORTED`** — the class's declared transformation
 *    cannot be performed. Admitting the element anyway would attach the name of
 *    a transformation that never ran, which is the precise falsehood this
 *    dispatch exists to prevent.
 *
 * A silent drop is refused in both cases for the same reason it always was:
 * reasoning must never proceed on a context the contract did not declare.
 */
export function transformForReasoning(input: {
    classification: ClassificationResult;
    policy: PrivacyPolicyV1;
    knowledge: readonly KnowledgeReference[];
    /**
     * Known participant display names, supplied by the capability from resolved
     * records. Read ONLY when the policy sets `requires_participant_redaction`;
     * a roster passed to a policy that does not require redaction is ignored
     * rather than silently applied, so the policy stays the authority on what
     * happens to text.
     */
    participants?: readonly string[];
}): PrivacyTransformResult {
    // Policy validity is checked BEFORE any element is examined. A policy asking
    // for a class this platform cannot detect is wrong whether or not a given
    // request happens to contain text — deciding it from the data would make the
    // refusal depend on which message arrived.
    const requestedMinimizers = input.policy.required_text_minimizers ?? [];
    const minimizerCheck = validateTextMinimizationRequest(requestedMinimizers);
    if (!minimizerCheck.ok) {
        return {
            ok: false,
            refusal_code: minimizerCheck.refusal_code,
            detail: `Privacy policy ${input.policy.key}: ${minimizerCheck.detail}`,
            transformations: [],
        };
    }

    // D-101. A class cannot be both transformed and acknowledged-untransformed. Allowing it would
    // let evidence claim a redaction ran and disclaim it in the same package, which is worse than
    // either statement alone.
    const acknowledgedUnminimized = input.policy.acknowledged_unminimized_classes ?? [];
    const contradictory = acknowledgedUnminimized.filter((c) => requestedMinimizers.includes(c));
    if (contradictory.length > 0) {
        return {
            ok: false,
            refusal_code: "PRIVACY_CONTRADICTORY_MINIMIZATION_DECLARATION",
            detail:
                `Privacy policy ${input.policy.key} declares class(es) ${[...new Set(contradictory)].sort().join(", ")} ` +
                `as both required_text_minimizers and acknowledged_unminimized_classes. A policy may claim a ` +
                `transformation or disclaim it, never both.`,
            transformations: [],
        };
    }

    // Roster sufficiency is checked here, before any element is examined, for
    // the same reason the minimizer check is: a policy requiring participant
    // redaction with nothing to redact is wrong whether or not this particular
    // request happens to carry a string element. Deciding it from the data would
    // make the refusal depend on which message arrived.
    const participantRedactionRequired = input.policy.requires_participant_redaction === true;
    if (participantRedactionRequired && expandParticipantTokens(input.participants ?? []).length === 0) {
        return {
            ok: false,
            refusal_code: "PARTICIPANT_REDACTION_EMPTY_ROSTER",
            detail:
                `Privacy policy ${input.policy.key} requires known-participant redaction, but no usable ` +
                `participant roster was supplied. Admitting text unredacted would claim a redaction that never ran.`,
            transformations: [],
        };
    }

    const prohibited = input.classification.elements.filter((e) =>
        input.policy.prohibited_classes.includes(e.information_class),
    );
    if (prohibited.length > 0) {
        return {
            ok: false,
            refusal_code: "PRIVACY_PROHIBITED_CLASS",
            detail: `Privacy policy ${input.policy.key} prohibits information class(es): ${[
                ...new Set(prohibited.map((e) => e.information_class)),
            ].join(", ")}.`,
            transformations: [],
        };
    }

    const admitted: Record<string, unknown> = {};
    const transformations: TransformationRecord[] = [];
    const textMinimizations = new Map<TextMinimizationClass, TextMinimizationRecord>();
    let participantReplacedCount = 0;
    let participantRosterTokenCount = 0;

    for (const element of input.classification.elements) {
        const outcome = applyTransformation({ transformation: element.transformation, value: element.value });

        const base = {
            key: element.key,
            information_class: element.information_class,
            transformation: element.transformation,
        } as const;

        if (outcome.disposition === "refused") {
            transformations.push({
                ...base,
                disposition: "refused",
                support: "unsupported",
                refusal_code: outcome.refusal_code,
                rationale: outcome.rationale,
            });
            return {
                ok: false,
                refusal_code: outcome.refusal_code,
                // The element KEY is deliberately absent. This detail becomes the
                // Decision Package's explanation, and a key is caller-supplied
                // text: echoing it would let an unmapped element write its own
                // name into an immutable package — which is how a smuggled
                // `proposed_command` or `provider_key` would reach a package by
                // the back door, through the very refusal meant to stop it.
                // Diagnosis uses `transformations` below, which does not persist.
                detail:
                    `Privacy policy ${input.policy.key} declares transformation "${element.transformation}" for ` +
                    `information class "${element.information_class}", and that transformation is not ` +
                    `implemented. ${outcome.rationale}`,
                transformations,
            };
        }

        if (outcome.disposition === "withheld") {
            transformations.push({ ...base, disposition: "withheld", support: "implemented", rationale: outcome.rationale });
            continue;
        }

        // Content-aware minimization runs BEFORE structural redaction, and the
        // order is not interchangeable. `redactObjectForAi` in `strict` mode
        // reacts to an email-shaped value by replacing the WHOLE string, so
        // "Email me at jane@example.com about Friday" becomes "Em…@e….redacted"
        // — the sentence is destroyed along with the address, and there is
        // nothing left for a content-aware pass to preserve. Removing the
        // embedded identifier first means the structural pass sees ordinary
        // prose and leaves it alone, which is the whole point of this slice.
        let value = outcome.value;
        if (requestedMinimizers.length > 0 && typeof value === "string") {
            const minimized = minimizeTextContent(value, requestedMinimizers);
            if (!minimized.ok) {
                transformations.push({
                    ...base,
                    disposition: "refused",
                    support: "unsupported",
                    rationale: minimized.detail,
                });
                return {
                    ok: false,
                    refusal_code: minimized.refusal_code,
                    // As above: no element key, and — more importantly here — no
                    // fragment of the text being minimized.
                    detail: `Privacy policy ${input.policy.key}: ${minimized.detail}`,
                    transformations,
                };
            }
            value = minimized.text;
            for (const record of minimized.records) {
                const existing = textMinimizations.get(record.detector_key);
                textMinimizations.set(record.detector_key, {
                    detector_key: record.detector_key,
                    redaction_kind: record.redaction_kind,
                    replaced_count: (existing?.replaced_count ?? 0) + record.replaced_count,
                });
            }
        }

        // Participant redaction runs AFTER content minimization, and the order is
        // not interchangeable either. An address like `maya.kurzman@example.com`
        // contains the participant's name: redacting the name first would leave
        // `[name removed].[name removed]@example.com`, which no longer matches the
        // email detector, so the domain and the address shape would survive.
        // Removing the whole address first means this pass sees ordinary prose.
        if (participantRedactionRequired && typeof value === "string") {
            const redacted = redactKnownParticipants(value, input.participants ?? []);
            if (!redacted.ok) {
                transformations.push({
                    ...base,
                    disposition: "refused",
                    support: "unsupported",
                    rationale: redacted.detail,
                });
                return {
                    ok: false,
                    refusal_code: redacted.refusal_code,
                    // As above: no element key, and no fragment of the text or of
                    // the roster that was being removed from it.
                    detail: `Privacy policy ${input.policy.key}: ${redacted.detail}`,
                    transformations,
                };
            }
            value = redacted.text;
            participantReplacedCount += redacted.record.replaced_count;
            participantRosterTokenCount = redacted.record.roster_token_count;
        }

        admitted[element.key] = value;
        transformations.push({
            ...base,
            disposition: "admitted",
            support: outcome.support,
            rationale: outcome.rationale,
        });
    }

    const { redacted, steps } = redactObjectForAi(admitted, { pii_mode: input.policy.pii_mode });

    return {
        ok: true,
        context: {
            transformed: redacted,
            knowledge: input.knowledge,
            redaction_steps: steps,
            // D-101. Declared, sorted, and reported whether or not any text was present — the
            // policy's admission is a property of the POLICY, not of which message arrived.
            acknowledged_unminimized_classes: [...acknowledgedUnminimized].sort(),
            classes_present: input.classification.classes_present,
            pii_mode: input.policy.pii_mode,
            transformations,
            // Stable order, independent of which element happened to be first.
            text_minimizations: [...textMinimizations.values()].sort((a, b) =>
                a.detector_key.localeCompare(b.detector_key),
            ),
            // One aggregate record across every admitted string, present only
            // when the policy required the pass. A zero `replaced_count` is a
            // real and reportable outcome — it means the roster matched nothing
            // in this text, which is different from the pass not having run.
            participant_redactions: participantRedactionRequired
                ? [
                      {
                          redaction_kind: "person_name",
                          replaced_count: participantReplacedCount,
                          roster_token_count: participantRosterTokenCount,
                      },
                  ]
                : [],
        },
    };
}
