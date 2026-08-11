/**
 * Information Package spec for needs-attention draft enrichment (Phase 2.8).
 *
 * This is the capability's declaration of what reasoning may see. It replaces
 * the six fields the ungoverned path assembled inline at the call site and
 * handed to a private redactor with no declared meaning and no classification.
 *
 * **Semantic identity, not storage.** Every key is the fact's TRUST-facing name,
 * deliberately independent of the property it was read from. `select()` is the
 * entire ingress: the route request, the suggestion wholesale, and any
 * adversarial extra field have no path in, because nothing reads them.
 *
 * ## Why this models facts instead of prose
 *
 * The first version of this spec declared the legacy payload's two rendered
 * strings — `reasoning.summary` and `suggested_content.body` — and could never
 * build. Both are prose about a family, so both needed `person_name` minimized
 * before egress, and this platform detects only `email` and `phone`. The
 * package refused at construction, every time.
 *
 * The refusal was correct, and the modelling was the actual defect. Neither
 * string is a fact; each is a RENDERING of facts the suggestion already carries
 * in closed vocabulary:
 *
 *   `reasoning.summary`  = `Operational attention: ${primary.label}.`
 *                          + ` Activity signal: ${stale_signal.label}.`
 *                          |  ` Last activity: ${last_activity_summary}.`
 *
 * The first two components are catalog labels of `primary_reason_code` and
 * `activity_signal_key` — both already on the suggestion as keys. Only
 * `last_activity_summary` is unbounded (it carries note titles and email
 * subjects from activity records), and it appears solely in the *fallback*
 * branch taken when no stale signal exists.
 *
 * So the summary decomposes completely into facts already present, and what is
 * dropped is one prose description whose structured counterpart — that an
 * activity signal exists, and which one — is carried by `activity_signal_key`.
 *
 * `suggested_content.body` is a static template filled with exactly
 * `{{contact_name}}` and `{{team_line}}`. The only identity in it is the contact
 * name, which exists for greeting a human, not for reasoning. The provider is
 * told WHICH template via `communication_template_key`; it never needs the
 * rendered greeting. This is already how the platform's own governed strategy
 * behaves — `attentionEnrichmentProposal` composes its overlay from the template
 * key and states that the original body was withheld.
 *
 * **No identity reaches the provider at all.** Not minimized, not tokenized
 * (D-52), not present. That is a stronger guarantee than minimization, and it is
 * available only because the facts were modelled instead of the prose.
 *
 * @see lib/trust/information/informationPackage.ts — build + refusal semantics
 * @see lib/privacy/minimizeTextContent.ts — which classes are actually supported
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import type { InformationPackageSpecV1 } from "@/lib/trust/information/informationPackage";

/**
 * The class this spec feeds — the PROVIDER-BACKED one.
 *
 * An Information Package exists to answer "what may leave the platform", and
 * only the provider-backed class can send anything anywhere. The deterministic
 * class keeps the Phase 1 compatibility path (`resolvedInformation` +
 * `semanticMap`) and needs no package, so binding this spec to it would declare
 * an egress surface for a path that has no egress.
 *
 * The binding is load-bearing, not cosmetic: the runtime refuses a governed
 * input whose `decision_class_key` differs from the contract's, so this constant
 * is what makes a package built here usable by that contract at all.
 */
export const ATTENTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY =
    ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY;

export const ATTENTION_ENRICHMENT_SPEC_KEY = "attention_suggestion_enrichment_input" as const;
/** v2: rendered prose replaced by the facts it was rendered from. */
export const ATTENTION_ENRICHMENT_SPEC_VERSION = "2.0.0" as const;

/** Arrays must be scalar-only; a missing optional becomes `null`, never dropped silently. */
function scalarsOrNull(values: readonly (string | undefined | null)[]): readonly (string | null)[] {
    return values.map((v) => (typeof v === "string" && v.trim() ? v : null));
}

/**
 * The declared facts.
 *
 * All closed vocabulary: reason codes, action keys, signal keys, factor codes
 * and severities come from platform catalogs; template key and channel are
 * enumerated. Nothing here is free text, so nothing requires a text minimizer
 * and the package has a reachable success path.
 */
export const attentionEnrichmentInformationSpec: InformationPackageSpecV1<AttentionSuggestionV1> = {
    key: ATTENTION_ENRICHMENT_SPEC_KEY,
    version: ATTENTION_ENRICHMENT_SPEC_VERSION,
    decision_class_key: ATTENTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,
    source_kind: "needs_attention_suggestion",
    elements: [
        {
            key: "attention_reason_code",
            information_class: "operational",
            source_field: "source.primary_reason_code",
            select: (s) => s.source.primary_reason_code,
        },
        {
            key: "attention_reason_codes",
            information_class: "operational",
            source_field: "source.reason_codes",
            select: (s) => scalarsOrNull(s.source.reason_codes ?? []),
        },
        {
            // Replaces the `Activity signal: …` clause of the rendered summary.
            // The key IS the fact; its label was only ever presentation.
            key: "activity_signal_key",
            information_class: "operational",
            source_field: "source.activity_signal_key",
            select: (s) => s.source.activity_signal_key ?? null,
        },
        {
            key: "recommended_action_key",
            information_class: "operational",
            source_field: "next_action.key",
            select: (s) => s.next_action.key,
        },
        {
            key: "recommended_action_family",
            information_class: "operational",
            source_field: "next_action.action_family",
            select: (s) => s.next_action.action_family,
        },
        {
            // Replaces the `Operational attention: …` clause, at higher fidelity:
            // the summary rendered only the PRIMARY reason, while the factors
            // carry every contributing one.
            key: "attention_factor_codes",
            information_class: "operational",
            source_field: "reasoning.factors[].code",
            select: (s) => scalarsOrNull((s.reasoning.factors ?? []).map((f) => f.code)),
        },
        {
            key: "attention_factor_severities",
            information_class: "operational",
            source_field: "reasoning.factors[].severity",
            select: (s) => scalarsOrNull((s.reasoning.factors ?? []).map((f) => f.severity)),
        },
        {
            key: "attention_factor_sla_tiers",
            information_class: "operational",
            source_field: "reasoning.factors[].sla_tier",
            select: (s) => scalarsOrNull((s.reasoning.factors ?? []).map((f) => f.sla_tier)),
        },
        {
            // WHICH draft, never the rendered draft. The body's only identity is
            // a greeting name, which reasoning does not need.
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
    ],
};

/** The declared semantic surface, for controls asserting nothing else can enter. */
export const ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS: readonly string[] = Object.freeze(
    attentionEnrichmentInformationSpec.elements.map((e) => e.key),
);

/**
 * Source properties this spec deliberately does NOT read, and why.
 *
 * Kept as a declaration so a future edit that adds one has to delete a line that
 * says not to — rather than silently widening what reaches a provider.
 */
export const ATTENTION_ENRICHMENT_EXCLUDED_SOURCE_FIELDS: Readonly<Record<string, string>> = Object.freeze({
    "reasoning.summary":
        "Rendered prose. Its controlled clauses are carried as attention_reason_code, " +
        "attention_factor_codes and activity_signal_key; its fallback clause embeds " +
        "last_activity_summary, which is unbounded operator/external text.",
    "suggested_content.body":
        "Rendered draft containing a contact greeting name. The provider is told which " +
        "template via communication_template_key and never needs the rendered identity.",
    "next_action.label": "Presentation label of next_action.key, which is already declared.",
    "target.entity_id": "Record identifier. Provenance carries source_refs; reasoning does not need it.",
});
