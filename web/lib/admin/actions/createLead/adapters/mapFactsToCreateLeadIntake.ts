import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import {
    CREATE_LEAD_HOUSEHOLD_FIELD_KEYS,
    mapCreateLeadPrimaryChild,
    mapCreateLeadPrimaryParent,
} from "@/lib/admin/actions/createLead/adapters/mapHouseholdToCreateLeadFields";
import { resolveLocationLabelToOption } from "@/lib/intake/resolve/resolveLocationLabel";
import {
    formatIntakeReviewWarnings,
    mergeIntakeReviewWarnings,
    type IntakeReviewWarning,
} from "@/lib/intake/review/intakeReviewWarnings";
import type {
    IntakeFactExtractionResult,
    IntakeFieldCandidate,
    IntakeFieldMappingResult,
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

function mapLegacyFactsWithoutHousehold(input: {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
    candidates: IntakeFieldCandidate[];
    seen: Set<string>;
}): void {
    const { extraction, spec, candidates, seen } = input;
    const keys = CREATE_LEAD_HOUSEHOLD_FIELD_KEYS.context;

    for (const fact of extraction.facts) {
        if (fact.fact_type === "source" && !seen.has(keys.source)) {
            pushCandidate(candidates, seen, {
                payload_key: keys.source,
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: fact.confidence === "high" ? "high" : "medium",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
        if (fact.fact_type === "notes" && !seen.has(keys.intake_notes)) {
            pushCandidate(candidates, seen, {
                payload_key: keys.intake_notes,
                rule_id: null,
                value: String(fact.normalized_value ?? fact.raw_value).trim(),
                confidence: fact.confidence === "high" ? "high" : "low",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
        if (fact.fact_type === "program_interest" && !seen.has(keys.child_program)) {
            const payloadKey = fieldByPayloadKey(spec, keys.child_program) ? keys.child_program : keys.location_id;
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
        if (fact.fact_type === "date" && !seen.has(keys.child_start_date)) {
            pushCandidate(candidates, seen, {
                payload_key: keys.child_start_date,
                rule_id:
                    fieldByPayloadKey(spec, keys.child_start_date)?.rule_id ??
                    "child:start_date",
                value: String(fact.normalized_value ?? fact.raw_value),
                confidence: fact.confidence === "high" ? "high" : "medium",
                fact_ids: [fact.fact_id],
                validation_state: fact.validation_state,
            });
        }
    }
}

/** Create Lead adapter — map extracted facts to create_lead intake field candidates. */
export function mapFactsToCreateLeadIntake(input: {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
    field_options?: Partial<Record<string, readonly IntakeSelectOption[]>>;
}): IntakeFieldMappingResult {
    const household = groupFactsIntoHouseholdCandidates(input.extraction.facts);
    const mappingWarnings: IntakeReviewWarning[] = [];
    const candidates: IntakeFieldCandidate[] = [];
    const seen = new Set<string>();
    const push = (candidate: IntakeFieldCandidate) => pushCandidate(candidates, seen, candidate);
    const keys = CREATE_LEAD_HOUSEHOLD_FIELD_KEYS.context;

    const primaryParent = household.parents[0];
    if (primaryParent) {
        mapCreateLeadPrimaryParent(candidates, seen, input.spec, primaryParent, input.extraction.facts, push);
    }

    const primaryChild = household.children[0];
    if (primaryChild) {
        mapCreateLeadPrimaryChild(candidates, seen, input.spec, primaryChild, push);
    }

    // Contact fallback: an email/phone provided WITHOUT a (re-stated) parent name in the same message
    // must still populate the primary-contact fields. Otherwise, when the operator sends contact info
    // on its own turn (the parent name came in an earlier BOS turn), `household.parents` is empty for
    // this extraction, mapCreateLeadPrimaryParent never runs, and the email/phone are silently dropped
    // ("I still need: Email"). The `seen` guard means this never overrides a per-parent mapping above.
    const parentKeys = CREATE_LEAD_HOUSEHOLD_FIELD_KEYS.primary_parent;
    if (!seen.has(parentKeys.email)) {
        const emailFact = input.extraction.facts.find((f) => f.fact_type === "email");
        if (emailFact) {
            push({
                payload_key: parentKeys.email,
                rule_id: fieldByPayloadKey(input.spec, parentKeys.email)?.rule_id ?? "person:email",
                value: String(emailFact.normalized_value ?? emailFact.raw_value).trim(),
                confidence: emailFact.validation_state === "invalid" ? "invalid" : "high",
                fact_ids: [emailFact.fact_id],
                validation_state: emailFact.validation_state ?? "valid",
            });
        }
    }
    if (!seen.has(parentKeys.phone)) {
        const phoneFact = input.extraction.facts.find((f) => f.fact_type === "phone");
        if (phoneFact) {
            push({
                payload_key: parentKeys.phone,
                rule_id: fieldByPayloadKey(input.spec, parentKeys.phone)?.rule_id ?? "person:phone",
                value: String(phoneFact.normalized_value ?? phoneFact.raw_value).trim(),
                confidence: phoneFact.validation_state === "invalid" ? "invalid" : "high",
                fact_ids: [phoneFact.fact_id],
                validation_state: phoneFact.validation_state ?? "valid",
            });
        }
    }

    if (household.source && !seen.has(keys.source)) {
        push({
            payload_key: keys.source,
            rule_id: null,
            value: household.source,
            confidence: "high",
            fact_ids: [],
            validation_state: "valid",
        });
    }

    if (household.notes && !seen.has(keys.intake_notes)) {
        push({
            payload_key: keys.intake_notes,
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
            push({
                payload_key: keys.location_id,
                rule_id: fieldByPayloadKey(input.spec, keys.location_id)?.rule_id ?? "opportunity:location",
                value: resolved.resolved_value,
                display_value: resolved.resolved_label ?? resolved.label,
                confidence: "high",
                fact_ids: household.location.source_fact_ids,
                validation_state: "valid",
            });
        } else if (resolved.validation_state === "ambiguous") {
            mappingWarnings.push({
                code: "location_ambiguous",
                severity: "warning",
                message: `Location "${household.location.label}" matches multiple sites — select the correct location in the form before creating the lead.`,
            });
        } else if (locationOptions.length > 0) {
            mappingWarnings.push({
                code: "location_unmatched",
                severity: "warning",
                message: `Location "${household.location.label}" does not match any available site — pick a location manually or check the spelling.`,
            });
        } else if (!seen.has(keys.location_id)) {
            push({
                payload_key: keys.location_id,
                rule_id: fieldByPayloadKey(input.spec, keys.location_id)?.rule_id ?? "opportunity:location",
                value: household.location.label,
                confidence: "medium",
                fact_ids: household.location.source_fact_ids,
                validation_state: "unknown",
            });
        }
    }

    if (household.program_interest && !seen.has(keys.child_program)) {
        push({
            payload_key: keys.child_program,
            rule_id: fieldByPayloadKey(input.spec, keys.child_program)?.rule_id ?? "child:program_interest",
            value: household.program_interest,
            confidence: "medium",
            fact_ids: [],
            validation_state: "unknown",
        });
    }

    if (household.start_date && !seen.has(keys.child_start_date)) {
        push({
            payload_key: keys.child_start_date,
            rule_id:
                fieldByPayloadKey(input.spec, keys.child_start_date)?.rule_id ??
                "child:start_date",
            value: household.start_date,
            confidence: "high",
            fact_ids: [],
            validation_state: "valid",
        });
    }

    // Map parsed mailing address onto create-lead address keys when the intake
    // spec includes them; otherwise the household commit selection still carries
    // structured address for post-commit persistence.
    if (household.address?.lines?.length) {
        const line1 = household.address.lines[0]!.trim();
        if (line1) {
            const householdKey = keys.household_address_line1;
            const personKey = keys.address_line1;
            if (fieldByPayloadKey(input.spec, householdKey) && !seen.has(householdKey)) {
                push({
                    payload_key: householdKey,
                    rule_id: fieldByPayloadKey(input.spec, householdKey)?.rule_id ?? null,
                    value: line1,
                    confidence: "medium",
                    fact_ids: household.address.source_fact_ids,
                    validation_state: "unknown",
                });
            } else if (fieldByPayloadKey(input.spec, personKey) && !seen.has(personKey)) {
                push({
                    payload_key: personKey,
                    rule_id: fieldByPayloadKey(input.spec, personKey)?.rule_id ?? null,
                    value: line1,
                    confidence: "medium",
                    fact_ids: household.address.source_fact_ids,
                    validation_state: "unknown",
                });
            } else if (!fieldByPayloadKey(input.spec, householdKey) && !fieldByPayloadKey(input.spec, personKey)) {
                mappingWarnings.push({
                    code: "address_no_action_field",
                    severity: "info",
                    message:
                        `Address detected (${line1}) — will be saved on the household when you confirm.`,
                });
            }
        }
    }

    mapLegacyFactsWithoutHousehold({
        extraction: input.extraction,
        spec: input.spec,
        candidates,
        seen,
    });

    const review_warning_items = mergeIntakeReviewWarnings(household.review_warnings, mappingWarnings);

    return {
        action_key: input.spec.action_key,
        candidates,
        unmapped_text: input.extraction.unmapped_text,
        household: { ...household, review_warnings: review_warning_items },
        review_warning_items,
        review_warnings: formatIntakeReviewWarnings(review_warning_items),
    };
}
