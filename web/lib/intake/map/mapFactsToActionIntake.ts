import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { resolveLocationLabelToOption } from "@/lib/intake/resolve/resolveLocationLabel";
import type {
    IntakeFact,
    IntakeFactExtractionResult,
    IntakeFieldCandidate,
    IntakeFieldMappingResult,
    IntakePersonCandidate,
    IntakeSelectOption,
} from "@/lib/intake/types";

function fieldByPayloadKey(
    spec: ActionIntakeSpec,
    payloadKey: string,
): ActionIntakeFieldSpec | undefined {
    return [...spec.required, ...spec.recommended, ...spec.optional].find(
        (f) => f.payload_key === payloadKey,
    );
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

function mapConfidence(
    level: IntakePersonCandidate["confidence"],
    validationState: IntakePersonCandidate["validation_state"],
): IntakeFieldCandidate["confidence"] {
    if (validationState === "invalid") return "invalid";
    if (level === "high") return "high";
    if (level === "medium") return "medium";
    return "low";
}

function mapPrimaryParent(
    candidates: IntakeFieldCandidate[],
    seen: Set<string>,
    spec: ActionIntakeSpec,
    parent: IntakePersonCandidate,
    facts: IntakeFact[],
): void {
    const confidence = mapConfidence(parent.confidence, parent.validation_state);
    if (parent.first_name) {
        pushCandidate(candidates, seen, {
            payload_key: "first_name",
            rule_id: fieldByPayloadKey(spec, "first_name")?.rule_id ?? "person:first_name",
            value: parent.first_name,
            confidence,
            fact_ids: parent.source_fact_ids,
            validation_state: parent.validation_state,
        });
    }
    if (parent.last_name) {
        pushCandidate(candidates, seen, {
            payload_key: "last_name",
            rule_id: fieldByPayloadKey(spec, "last_name")?.rule_id ?? "person:last_name",
            value: parent.last_name,
            confidence,
            fact_ids: parent.source_fact_ids,
            validation_state: parent.validation_state,
        });
    }

    const emailFact = facts.find((f) => f.fact_type === "email");
    const email = parent.emails[0]?.trim() ?? (emailFact ? String(emailFact.normalized_value ?? emailFact.raw_value).trim() : "");
    if (email) {
        pushCandidate(candidates, seen, {
            payload_key: "email",
            rule_id: fieldByPayloadKey(spec, "email")?.rule_id ?? "person:email",
            value: email,
            confidence: emailFact?.validation_state === "invalid" ? "invalid" : "high",
            fact_ids: emailFact ? [emailFact.fact_id] : parent.source_fact_ids,
            validation_state: emailFact?.validation_state ?? "valid",
        });
    }

    const phoneFact = facts.find((f) => f.fact_type === "phone");
    const phone = parent.phones[0]?.trim() ?? (phoneFact ? String(phoneFact.normalized_value ?? phoneFact.raw_value).trim() : "");
    if (phone) {
        pushCandidate(candidates, seen, {
            payload_key: "phone",
            rule_id: fieldByPayloadKey(spec, "phone")?.rule_id ?? "person:phone",
            value: phone,
            confidence: phoneFact?.validation_state === "invalid" ? "invalid" : "high",
            fact_ids: phoneFact ? [phoneFact.fact_id] : parent.source_fact_ids,
            validation_state: phoneFact?.validation_state ?? "valid",
        });
    }
}

function mapPrimaryChild(
    candidates: IntakeFieldCandidate[],
    seen: Set<string>,
    spec: ActionIntakeSpec,
    child: IntakePersonCandidate,
): void {
    const confidence = mapConfidence(child.confidence, child.validation_state);
    if (child.first_name) {
        pushCandidate(candidates, seen, {
            payload_key: "child_first_name",
            rule_id: fieldByPayloadKey(spec, "child_first_name")?.rule_id ?? "child:first_name",
            value: child.first_name,
            confidence,
            fact_ids: child.source_fact_ids,
            validation_state: child.validation_state,
        });
    }
    if (child.last_name) {
        pushCandidate(candidates, seen, {
            payload_key: "child_last_name",
            rule_id: fieldByPayloadKey(spec, "child_last_name")?.rule_id ?? "child:last_name",
            value: child.last_name,
            confidence,
            fact_ids: child.source_fact_ids,
            validation_state: child.validation_state,
        });
    }
    if (child.dob) {
        pushCandidate(candidates, seen, {
            payload_key: "child_date_of_birth",
            rule_id: fieldByPayloadKey(spec, "child_date_of_birth")?.rule_id ?? "child:date_of_birth",
            value: child.dob,
            confidence: "high",
            fact_ids: child.source_fact_ids,
            validation_state: "valid",
        });
    } else if (child.age_years != null) {
        pushCandidate(candidates, seen, {
            payload_key: "child_age",
            rule_id: null,
            value: String(child.age_years),
            confidence: "medium",
            fact_ids: child.source_fact_ids,
            validation_state: "unknown",
            display_value: `~${child.age_years} yrs (approximate)`,
        });
    }
}

function mapLegacyFactsWithoutHousehold(input: {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
    candidates: IntakeFieldCandidate[];
    seen: Set<string>;
}): void {
    const { extraction, spec, candidates, seen } = input;
    for (const fact of extraction.facts) {
        if (fact.fact_type === "source" && !seen.has("source")) {
            pushCandidate(candidates, seen, {
                payload_key: "source",
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: fact.confidence === "high" ? "high" : "medium",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
        if (fact.fact_type === "notes" && !seen.has("intake_notes")) {
            pushCandidate(candidates, seen, {
                payload_key: "intake_notes",
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: fact.confidence === "high" ? "high" : "low",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
        if (fact.fact_type === "program_interest" && !seen.has("child_program")) {
            const payloadKey = fieldByPayloadKey(spec, "child_program") ? "child_program" : "location_id";
            if (!seen.has(payloadKey)) {
                pushCandidate(candidates, seen, {
                    payload_key: payloadKey,
                    rule_id: fieldByPayloadKey(spec, payloadKey)?.rule_id ?? null,
                    value: String(fact.normalized_value ?? fact.raw_value).trim(),
                    confidence: "medium",
                    fact_ids: [fact.fact_id],
                    validation_state: fact.validation_state,
                });
            }
        }
        if (fact.fact_type === "date" && !seen.has("child_desired_start_date")) {
            pushCandidate(candidates, seen, {
                payload_key: "child_desired_start_date",
                rule_id:
                    fieldByPayloadKey(spec, "child_desired_start_date")?.rule_id ??
                    "child:desired_start_date",
                value: String(fact.normalized_value ?? fact.raw_value),
                confidence: fact.confidence === "high" ? "high" : "medium",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
    }
}

export function mapFactsToActionIntake(input: {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
    field_options?: Partial<Record<string, readonly IntakeSelectOption[]>>;
}): IntakeFieldMappingResult {
    const household = groupFactsIntoHouseholdCandidates(input.extraction.facts);
    const review_warnings = [...household.review_warnings];
    const candidates: IntakeFieldCandidate[] = [];
    const seen = new Set<string>();

    const primaryParent = household.parents[0];
    if (primaryParent) {
        mapPrimaryParent(candidates, seen, input.spec, primaryParent, input.extraction.facts);
    }

    const primaryChild = household.children[0];
    if (primaryChild) {
        mapPrimaryChild(candidates, seen, input.spec, primaryChild);
    }

    if (household.source && !seen.has("source")) {
        pushCandidate(candidates, seen, {
            payload_key: "source",
            rule_id: null,
            value: household.source,
            confidence: "high",
            fact_ids: [],
            validation_state: "valid",
        });
    }

    if (household.notes && !seen.has("intake_notes")) {
        pushCandidate(candidates, seen, {
            payload_key: "intake_notes",
            rule_id: null,
            value: household.notes,
            confidence: "low",
            fact_ids: [],
            validation_state: "unknown",
        });
    }

    if (household.location) {
        const locationOptions = input.field_options?.location_id ?? [];
        const resolved = resolveLocationLabelToOption(household.location.label, locationOptions);
        household.location = {
            ...household.location,
            resolved_value: resolved.resolved_value,
            resolved_label: resolved.resolved_label,
            confidence: resolved.confidence,
            validation_state: resolved.validation_state,
        };

        if (resolved.validation_state === "valid" && resolved.resolved_value) {
            pushCandidate(candidates, seen, {
                payload_key: "location_id",
                rule_id: fieldByPayloadKey(input.spec, "location_id")?.rule_id ?? "opportunity:location",
                value: resolved.resolved_value,
                display_value: resolved.resolved_label ?? resolved.label,
                confidence: "high",
                fact_ids: household.location.source_fact_ids,
                validation_state: "valid",
            });
        } else if (resolved.validation_state === "ambiguous") {
            review_warnings.push(
                `Location "${household.location.label}" matches multiple sites — please select manually.`,
            );
        } else if (locationOptions.length > 0) {
            review_warnings.push(
                `Location "${household.location.label}" could not be matched to an available site.`,
            );
        } else if (!seen.has("location_id")) {
            pushCandidate(candidates, seen, {
                payload_key: "location_id",
                rule_id: fieldByPayloadKey(input.spec, "location_id")?.rule_id ?? "opportunity:location",
                value: household.location.label,
                confidence: "medium",
                fact_ids: household.location.source_fact_ids,
                validation_state: "unknown",
            });
        }
    }

    if (household.address) {
        review_warnings.push("Mailing address detected — review in household details below.");
    }

    if (household.program_interest && !seen.has("child_program")) {
        pushCandidate(candidates, seen, {
            payload_key: "child_program",
            rule_id: fieldByPayloadKey(input.spec, "child_program")?.rule_id ?? "child:program_interest",
            value: household.program_interest,
            confidence: "medium",
            fact_ids: [],
            validation_state: "unknown",
        });
    }

    if (household.desired_start_date && !seen.has("child_desired_start_date")) {
        pushCandidate(candidates, seen, {
            payload_key: "child_desired_start_date",
            rule_id:
                fieldByPayloadKey(input.spec, "child_desired_start_date")?.rule_id ??
                "child:desired_start_date",
            value: household.desired_start_date,
            confidence: "high",
            fact_ids: [],
            validation_state: "valid",
        });
    }

    mapLegacyFactsWithoutHousehold({
        extraction: input.extraction,
        spec: input.spec,
        candidates,
        seen,
    });

    return {
        action_key: input.spec.action_key,
        candidates,
        unmapped_text: input.extraction.unmapped_text,
        household,
        review_warnings: [...new Set(review_warnings)],
    };
}
