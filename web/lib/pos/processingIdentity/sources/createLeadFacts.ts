/**
 * Extract durable intake facts from a Create Lead household graph (D4).
 */

import type { IntakeFact, IntakeHouseholdCandidate } from "@/lib/intake/types";

export function extractFactsFromCreateLeadHousehold(
    household: IntakeHouseholdCandidate,
    sourceKey: string,
): IntakeFact[] {
    const facts: IntakeFact[] = [];
    const push = (fact: IntakeFact) => facts.push(fact);

    for (const [idx, parent] of household.parents_guardians.entries()) {
        const prefix = `fact:${sourceKey}:parent:${idx}`;
        if (parent.emails[0]) {
            push({
                fact_id: `${prefix}:email`,
                fact_type: "email",
                raw_value: parent.emails[0],
                normalized_value: parent.emails[0],
                confidence: parent.confidence,
                validation_state: parent.validation_state,
                role_hint: "parent",
                evidence: "create_lead:intake",
            });
        }
        if (parent.phones[0]) {
            push({
                fact_id: `${prefix}:phone`,
                fact_type: "phone",
                raw_value: parent.phones[0],
                normalized_value: parent.phones[0],
                confidence: parent.confidence,
                validation_state: parent.validation_state,
                role_hint: "parent",
                evidence: "create_lead:intake",
            });
        }
        if (parent.first_name) {
            push({
                fact_id: `${prefix}:first_name`,
                fact_type: "person_name",
                raw_value: parent.first_name,
                normalized_value: parent.first_name,
                confidence: parent.confidence,
                validation_state: parent.validation_state,
                role_hint: "parent",
                evidence: "create_lead:intake",
            });
        }
        if (parent.last_name) {
            push({
                fact_id: `${prefix}:last_name`,
                fact_type: "person_name",
                raw_value: parent.last_name,
                normalized_value: parent.last_name,
                confidence: parent.confidence,
                validation_state: parent.validation_state,
                role_hint: "parent",
                evidence: "create_lead:intake",
            });
        }
    }

    for (const [idx, child] of household.children.entries()) {
        const prefix = `fact:${sourceKey}:child:${idx}`;
        if (child.first_name) {
            push({
                fact_id: `${prefix}:first_name`,
                fact_type: "person_name",
                raw_value: child.first_name,
                normalized_value: child.first_name,
                confidence: child.confidence,
                validation_state: child.validation_state,
                role_hint: "child",
                evidence: "create_lead:intake",
            });
        }
        if (child.last_name) {
            push({
                fact_id: `${prefix}:last_name`,
                fact_type: "person_name",
                raw_value: child.last_name,
                normalized_value: child.last_name,
                confidence: child.confidence,
                validation_state: child.validation_state,
                role_hint: "child",
                evidence: "create_lead:intake",
            });
        }
        if (child.dob) {
            push({
                fact_id: `${prefix}:dob`,
                fact_type: "dob",
                raw_value: child.dob,
                normalized_value: child.dob,
                confidence: child.confidence,
                validation_state: child.validation_state,
                role_hint: "child",
                evidence: "create_lead:intake",
            });
        }
        if (child.gender) {
            push({
                fact_id: `${prefix}:gender`,
                fact_type: "gender",
                raw_value: child.gender,
                normalized_value: child.gender,
                confidence: child.confidence,
                validation_state: child.validation_state,
                role_hint: "child",
                evidence: "create_lead:intake",
            });
        }
    }

    return facts;
}
