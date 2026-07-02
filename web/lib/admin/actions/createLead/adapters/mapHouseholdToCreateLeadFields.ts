/**
 * Create Lead adapter — maps grouped household candidates to create_lead payload keys.
 * Shared intake grouping stays action-agnostic; only this module knows child_* / first_name keys.
 */
import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    IntakeFact,
    IntakeFieldCandidate,
    IntakeHouseholdCandidate,
    IntakePersonCandidate,
} from "@/lib/intake/types";

export const CREATE_LEAD_HOUSEHOLD_FIELD_KEYS = {
    primary_parent: {
        first_name: "first_name",
        last_name: "last_name",
        email: "email",
        phone: "phone",
    },
    primary_child: {
        first_name: "child_first_name",
        last_name: "child_last_name",
        date_of_birth: "child_date_of_birth",
        approximate_age: "child_age",
    },
    context: {
        location_id: "location_id",
        source: "source",
        intake_notes: "intake_notes",
        child_program: "child_program",
        child_start_date: "child_start_date",
    },
} as const;

function fieldByPayloadKey(
    spec: ActionIntakeSpec,
    payloadKey: string,
): ActionIntakeFieldSpec | undefined {
    return [...spec.required, ...spec.recommended, ...spec.optional].find(
        (f) => f.payload_key === payloadKey,
    );
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

export function mapCreateLeadPrimaryParent(
    candidates: IntakeFieldCandidate[],
    seen: Set<string>,
    spec: ActionIntakeSpec,
    parent: IntakePersonCandidate,
    facts: IntakeFact[],
    pushCandidate: (input: IntakeFieldCandidate) => void,
): void {
    const keys = CREATE_LEAD_HOUSEHOLD_FIELD_KEYS.primary_parent;
    const confidence = mapConfidence(parent.confidence, parent.validation_state);

    if (parent.first_name) {
        pushCandidate({
            payload_key: keys.first_name,
            rule_id: fieldByPayloadKey(spec, keys.first_name)?.rule_id ?? "person:first_name",
            value: parent.first_name,
            confidence,
            fact_ids: parent.source_fact_ids,
            validation_state: parent.validation_state,
        });
    }
    if (parent.last_name) {
        pushCandidate({
            payload_key: keys.last_name,
            rule_id: fieldByPayloadKey(spec, keys.last_name)?.rule_id ?? "person:last_name",
            value: parent.last_name,
            confidence,
            fact_ids: parent.source_fact_ids,
            validation_state: parent.validation_state,
        });
    }

    const emailFact = facts.find((f) => f.fact_type === "email");
    const email = parent.emails[0]?.trim() ?? (emailFact ? String(emailFact.normalized_value ?? emailFact.raw_value).trim() : "");
    if (email) {
        pushCandidate({
            payload_key: keys.email,
            rule_id: fieldByPayloadKey(spec, keys.email)?.rule_id ?? "person:email",
            value: email,
            confidence: emailFact?.validation_state === "invalid" ? "invalid" : "high",
            fact_ids: emailFact ? [emailFact.fact_id] : parent.source_fact_ids,
            validation_state: emailFact?.validation_state ?? "valid",
        });
    }

    const phoneFact = facts.find((f) => f.fact_type === "phone");
    const phone = parent.phones[0]?.trim() ?? (phoneFact ? String(phoneFact.normalized_value ?? phoneFact.raw_value).trim() : "");
    if (phone) {
        pushCandidate({
            payload_key: keys.phone,
            rule_id: fieldByPayloadKey(spec, keys.phone)?.rule_id ?? "person:phone",
            value: phone,
            confidence: phoneFact?.validation_state === "invalid" ? "invalid" : "high",
            fact_ids: phoneFact ? [phoneFact.fact_id] : parent.source_fact_ids,
            validation_state: phoneFact?.validation_state ?? "valid",
        });
    }
}

export function mapCreateLeadPrimaryChild(
    candidates: IntakeFieldCandidate[],
    seen: Set<string>,
    spec: ActionIntakeSpec,
    child: IntakePersonCandidate,
    pushCandidate: (input: IntakeFieldCandidate) => void,
): void {
    const keys = CREATE_LEAD_HOUSEHOLD_FIELD_KEYS.primary_child;
    const confidence = mapConfidence(child.confidence, child.validation_state);

    if (child.first_name) {
        pushCandidate({
            payload_key: keys.first_name,
            rule_id: fieldByPayloadKey(spec, keys.first_name)?.rule_id ?? "child:first_name",
            value: child.first_name,
            confidence,
            fact_ids: child.source_fact_ids,
            validation_state: child.validation_state,
        });
    }
    if (child.last_name) {
        pushCandidate({
            payload_key: keys.last_name,
            rule_id: fieldByPayloadKey(spec, keys.last_name)?.rule_id ?? "child:last_name",
            value: child.last_name,
            confidence,
            fact_ids: child.source_fact_ids,
            validation_state: child.validation_state,
        });
    }
    if (child.dob) {
        pushCandidate({
            payload_key: keys.date_of_birth,
            rule_id: fieldByPayloadKey(spec, keys.date_of_birth)?.rule_id ?? "child:date_of_birth",
            value: child.dob,
            confidence: "high",
            fact_ids: child.source_fact_ids,
            validation_state: "valid",
        });
    } else if (child.age_years != null) {
        pushCandidate({
            payload_key: keys.approximate_age,
            rule_id: null,
            value: String(child.age_years),
            confidence: "medium",
            fact_ids: child.source_fact_ids,
            validation_state: "unknown",
            display_value: `~${child.age_years} yrs (approximate)`,
        });
    }
}

export function createLeadHasAddressField(_spec: ActionIntakeSpec, household: IntakeHouseholdCandidate): boolean {
    void household;
    return false;
}
