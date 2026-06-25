/**
 * POS-FP10 (intake-aligned) — POS mapping profile: facts → IntakeFieldCandidate[].
 *
 * The POS analog of `mapFactsToActionIntake` (the Create Lead profile). It consumes
 * the SHARED contracts — `groupFactsIntoHouseholdCandidates` for the person side, the
 * leftover typed `date`/`amount` facts for the rest — and emits the SHARED
 * `IntakeFieldCandidate` shape (no second candidate model). It is the one place
 * classification/profile/context is allowed to live.
 *
 * Review-only: candidates are proposed values. No record write, no matching, no commit.
 */

import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import type {
    IntakeFact,
    IntakeFactConfidence,
    IntakeFactExtractionResult,
    IntakeFieldCandidate,
    IntakeValidationState,
} from "@/lib/intake/types";
import type { ProcessingClassificationKey } from "../classification/types";
import { DOC_FILENAME_EVIDENCE, DOC_META_EVIDENCE_PREFIX } from "./documentFacts";

export interface ProcessingCandidateMappingResult {
    candidates: IntakeFieldCandidate[];
    review_warnings: string[];
}

function candidateConfidence(
    level: IntakeFactConfidence,
    vs: IntakeValidationState
): IntakeFieldCandidate["confidence"] {
    if (vs === "invalid") return "invalid";
    return level; // "high" | "medium" | "low" are all valid candidate confidences
}

function dateFactByKeys(facts: IntakeFact[], aliases: string[]): IntakeFact | undefined {
    return facts.find(
        (f) => f.fact_type === "date" && aliases.some((a) => f.evidence === `${DOC_META_EVIDENCE_PREFIX}${a}`)
    );
}

function filenameDateFact(facts: IntakeFact[]): IntakeFact | undefined {
    return facts.find((f) => f.fact_type === "date" && f.evidence === DOC_FILENAME_EVIDENCE);
}

function amountFact(facts: IntakeFact[]): IntakeFact | undefined {
    return facts.find((f) => f.fact_type === "amount");
}

function orgFromMetadata(
    metadata: Record<string, unknown> | undefined,
    aliases: string[]
): string | null {
    if (!metadata) return null;
    const lower = new Map<string, unknown>();
    for (const [k, v] of Object.entries(metadata)) lower.set(k.toLowerCase(), v);
    for (const a of aliases) {
        const raw = lower.get(a);
        if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
    return null;
}

interface Ctx {
    classificationKey: ProcessingClassificationKey;
    facts: IntakeFact[];
    metadata: Record<string, unknown> | undefined;
    candidates: IntakeFieldCandidate[];
    warnings: string[];
}

function pushChildName(ctx: Ctx): void {
    const household = groupFactsIntoHouseholdCandidates(ctx.facts);
    ctx.warnings.push(...household.review_warnings);
    const child = household.children[0];
    if (!child) return;
    const value = [child.first_name, child.last_name].filter(Boolean).join(" ").trim();
    if (!value) return;
    ctx.candidates.push({
        payload_key: "child_name",
        rule_id: `pos:${ctx.classificationKey}:child_name`,
        value,
        confidence: candidateConfidence(child.confidence, child.validation_state),
        fact_ids: child.source_fact_ids,
        validation_state: child.validation_state,
    });
}

function pushDate(ctx: Ctx, payloadKey: string, aliases: string[], allowFilename: boolean): void {
    const fact = dateFactByKeys(ctx.facts, aliases) ?? (allowFilename ? filenameDateFact(ctx.facts) : undefined);
    if (!fact) return;
    ctx.candidates.push({
        payload_key: payloadKey,
        rule_id: `pos:${ctx.classificationKey}:${payloadKey}`,
        value: String(fact.normalized_value ?? fact.raw_value),
        confidence: candidateConfidence(fact.confidence, fact.validation_state),
        fact_ids: [fact.fact_id],
        validation_state: fact.validation_state,
    });
}

function pushAmount(ctx: Ctx, payloadKey: string): void {
    const fact = amountFact(ctx.facts);
    if (!fact) return;
    ctx.candidates.push({
        payload_key: payloadKey,
        rule_id: `pos:${ctx.classificationKey}:${payloadKey}`,
        value: String(fact.normalized_value ?? fact.raw_value),
        confidence: candidateConfidence(fact.confidence, fact.validation_state),
        fact_ids: [fact.fact_id],
        validation_state: fact.validation_state,
    });
}

function pushOrg(ctx: Ctx, payloadKey: string, aliases: string[]): void {
    const value = orgFromMetadata(ctx.metadata, aliases);
    if (!value) return;
    // No shared fact_type for organization names — surfaced from envelope metadata with
    // no backing fact (same precedent as household.source / household.notes).
    ctx.candidates.push({
        payload_key: payloadKey,
        rule_id: `pos:${ctx.classificationKey}:${payloadKey}`,
        value,
        confidence: "high",
        fact_ids: [],
        validation_state: "valid",
    });
}

/** Map facts (+ classification context) into shared field candidates for Processing Case review. */
export function mapProcessingFactsToCandidates(input: {
    extraction: IntakeFactExtractionResult;
    classificationKey: ProcessingClassificationKey;
}): ProcessingCandidateMappingResult {
    const ctx: Ctx = {
        classificationKey: input.classificationKey,
        facts: input.extraction.facts,
        metadata: input.extraction.source.metadata,
        candidates: [],
        warnings: [],
    };

    switch (input.classificationKey) {
        case "subsidy_contract":
            pushOrg(ctx, "agency_name", ["agency_name", "agency", "payer", "provider_agency"]);
            pushChildName(ctx);
            pushDate(ctx, "authorization_start_date", ["authorization_start_date", "auth_start", "start_date"], false);
            pushDate(ctx, "authorization_end_date", ["authorization_end_date", "auth_end", "end_date"], false);
            break;
        case "remittance":
            pushOrg(ctx, "payer_name", ["payer_name", "payer", "payor", "agency_name"]);
            pushAmount(ctx, "payment_amount");
            pushDate(ctx, "payment_date", ["payment_date", "paid_on", "date"], true);
            break;
        case "immunization_record":
            pushChildName(ctx);
            pushDate(ctx, "immunization_date", ["immunization_date", "vaccination_date", "date_administered", "date"], true);
            break;
        // enrollment_document, form_like_document, unknown → no candidates in this slice.
        default:
            break;
    }

    return { candidates: ctx.candidates, review_warnings: [...new Set(ctx.warnings)] };
}
