/**
 * Information Package spec for needs-attention draft enrichment (Phase 2.8).
 *
 * This is the capability's declaration of what reasoning is allowed to see. It
 * replaces the ad-hoc object the ungoverned path assembled inline and handed to
 * `redactObjectForAi` — six fields picked at the call site, with no declared
 * meaning and no classification.
 *
 * **Semantic identity, not storage.** Every key here is the fact's TRUST-facing
 * name, deliberately independent of the column or property it was read from.
 * `suggested_content.body` becomes `draft_message_text` because what reasoning
 * consumes is the meaning of the fact, not the path it happened to live at.
 * `source_field` records the path for provenance only and never influences
 * classification.
 *
 * **The select() functions are the entire ingress.** A value can reach reasoning
 * only if a declared element extracts it. Handing the route's request object,
 * the deterministic suggestion wholesale, or any adversarial extra field to the
 * package is structurally impossible: nothing reads them.
 *
 * ## The two free-text elements will refuse (D-43 / D-46)
 *
 * `deterministic_reasoning_text` and `draft_message_text` are operator-facing
 * prose about a family. A draft message to a household routinely contains a
 * person's name, so both declare `person_name` among the classes they need
 * minimized before egress.
 *
 * Trust cannot detect names deterministically — `TEXT_DETECTORS` is
 * `[email, phone]` — so `validateTextMinimizationRequest` refuses the package,
 * and provider-backed enrichment refuses with it. **That is the intended
 * outcome, not a defect.** Under-declaring to keep the provider reachable would
 * assert a privacy posture this platform has not established: it would claim the
 * text carries no names when it usually does. A refusal is the honest answer
 * until a name detector exists, and it is strictly safer than the ungoverned
 * path it replaces, which sent this prose to a provider with no such claim
 * examined at all.
 *
 * @see lib/trust/information/informationPackage.ts — build + refusal semantics
 * @see lib/privacy/minimizeTextContent.ts — which classes are actually supported
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { InformationPackageSpecV1 } from "@/lib/trust/information/informationPackage";

/** Decision class this spec feeds. Matches the registered enrichment decision class. */
export const ATTENTION_ENRICHMENT_DECISION_CLASS_KEY = "attention_suggestion_enrichment" as const;

export const ATTENTION_ENRICHMENT_SPEC_KEY = "attention_suggestion_enrichment_input" as const;
export const ATTENTION_ENRICHMENT_SPEC_VERSION = "1.0.0" as const;

/**
 * The six facts, and only these six.
 *
 * Structured codes are `operational` or `communications`; neither carries
 * identity, so both survive minimization intact. The two prose elements declare
 * what they would need minimized — see the refusal note above.
 */
export const attentionEnrichmentInformationSpec: InformationPackageSpecV1<AttentionSuggestionV1> = {
    key: ATTENTION_ENRICHMENT_SPEC_KEY,
    version: ATTENTION_ENRICHMENT_SPEC_VERSION,
    decision_class_key: ATTENTION_ENRICHMENT_DECISION_CLASS_KEY,
    source_kind: "needs_attention_suggestion",
    elements: [
        {
            key: "attention_reason_code",
            information_class: "operational",
            source_field: "source.primary_reason_code",
            select: (s) => s.source.primary_reason_code,
        },
        {
            key: "recommended_action_key",
            information_class: "operational",
            source_field: "next_action.key",
            select: (s) => s.next_action.key,
        },
        {
            key: "communication_template_key",
            information_class: "communications",
            source_field: "suggested_content.template_key",
            select: (s) => s.suggested_content?.template_key ?? null,
        },
        {
            key: "communication_channel",
            information_class: "communications",
            source_field: "suggested_content.channel",
            select: (s) => s.suggested_content?.channel ?? null,
        },
        {
            key: "deterministic_reasoning_text",
            information_class: "operational",
            source_field: "reasoning.summary",
            // Prose about a specific family. Declaring only email/phone here
            // would be the convenient answer and the untrue one.
            required_text_minimizers: ["email", "phone", "person_name"],
            select: (s) => s.reasoning.summary,
        },
        {
            key: "draft_message_text",
            information_class: "communications",
            source_field: "suggested_content.body",
            required_text_minimizers: ["email", "phone", "person_name"],
            select: (s) => s.suggested_content?.body ?? null,
        },
    ],
};

/** The declared semantic surface, for controls that assert nothing else can enter. */
export const ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS: readonly string[] = Object.freeze(
    attentionEnrichmentInformationSpec.elements.map((e) => e.key),
);
