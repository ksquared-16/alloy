import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    IntakeFact,
    IntakeFactExtractionResult,
    IntakeFieldCandidate,
    IntakeFieldMappingResult,
} from "@/lib/intake/types";

function fieldByPayloadKey(
    spec: ActionIntakeSpec,
    payloadKey: string,
): ActionIntakeFieldSpec | undefined {
    return [...spec.required, ...spec.recommended, ...spec.optional].find(
        (f) => f.payload_key === payloadKey,
    );
}

function confidenceFromFact(fact: IntakeFact): IntakeFieldCandidate["confidence"] {
    if (fact.validation_state === "invalid") return "invalid";
    if (fact.confidence === "high") return "high";
    if (fact.confidence === "medium") return "medium";
    return "low";
}

function pushCandidate(
    out: IntakeFieldCandidate[],
    seen: Set<string>,
    input: IntakeFieldCandidate,
): void {
    if (seen.has(input.payload_key)) return;
    seen.add(input.payload_key);
    out.push(input);
}

function personNameParts(fact: IntakeFact): { first: string; last: string } | null {
    const normalized = String(fact.normalized_value ?? fact.raw_value).trim();
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
        if (fact.role_hint === "child") {
            return { first: parts[0] ?? normalized, last: "" };
        }
        return null;
    }
    return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

export function mapFactsToActionIntake(input: {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
}): IntakeFieldMappingResult {
    const { extraction, spec } = input;
    const candidates: IntakeFieldCandidate[] = [];
    const seen = new Set<string>();

    for (const fact of extraction.facts) {
        if (fact.fact_type === "email") {
            pushCandidate(candidates, seen, {
                payload_key: "email",
                rule_id: fieldByPayloadKey(spec, "email")?.rule_id ?? "person:email",
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "phone") {
            pushCandidate(candidates, seen, {
                payload_key: "phone",
                rule_id: fieldByPayloadKey(spec, "phone")?.rule_id ?? "person:phone",
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "person_name" && fact.role_hint === "parent") {
            const parts = personNameParts(fact);
            if (!parts) continue;
            pushCandidate(candidates, seen, {
                payload_key: "first_name",
                rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
                value: parts.first,
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            if (parts.last) {
                pushCandidate(candidates, seen, {
                    payload_key: "last_name",
                    rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
                    value: parts.last,
                    confidence: confidenceFromFact(fact),
                    fact_ids: [fact.fact_id],
                    validation_state: fact.validation_state,
                });
            }
            continue;
        }

        if (fact.fact_type === "person_name" && fact.role_hint === "child") {
            const parts = personNameParts(fact);
            if (!parts) continue;
            pushCandidate(candidates, seen, {
                payload_key: "child_first_name",
                rule_id: fieldByPayloadKey(spec, "child_first_name")?.rule_id ?? "child:first_name",
                value: parts.first,
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            if (parts.last) {
                pushCandidate(candidates, seen, {
                    payload_key: "child_last_name",
                    rule_id: fieldByPayloadKey(spec, "child_last_name")?.rule_id ?? "child:last_name",
                    value: parts.last,
                    confidence: confidenceFromFact(fact),
                    fact_ids: [fact.fact_id],
                    validation_state: fact.validation_state,
                });
            }
            continue;
        }

        if (fact.fact_type === "age_years") {
            pushCandidate(candidates, seen, {
                payload_key: "child_age",
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "dob") {
            pushCandidate(candidates, seen, {
                payload_key: "child_date_of_birth",
                rule_id: fieldByPayloadKey(spec, "child_date_of_birth")?.rule_id ?? "child:date_of_birth",
                value: String(fact.normalized_value ?? fact.raw_value),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "date") {
            pushCandidate(candidates, seen, {
                payload_key: "child_desired_start_date",
                rule_id:
                    fieldByPayloadKey(spec, "child_desired_start_date")?.rule_id ?? "child:desired_start_date",
                value: String(fact.normalized_value ?? fact.raw_value),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "source") {
            pushCandidate(candidates, seen, {
                payload_key: "source",
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "program_interest") {
            const payloadKey = fieldByPayloadKey(spec, "child_program") ? "child_program" : "location_id";
            pushCandidate(candidates, seen, {
                payload_key: payloadKey,
                rule_id: fieldByPayloadKey(spec, payloadKey)?.rule_id ?? null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "location_label") {
            pushCandidate(candidates, seen, {
                payload_key: "location_id",
                rule_id: fieldByPayloadKey(spec, "location_id")?.rule_id ?? "opportunity:location",
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
            continue;
        }

        if (fact.fact_type === "notes") {
            pushCandidate(candidates, seen, {
                payload_key: "intake_notes",
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: confidenceFromFact(fact),
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
    }

    return {
        action_key: spec.action_key,
        candidates,
        unmapped_text: extraction.unmapped_text,
    };
}
