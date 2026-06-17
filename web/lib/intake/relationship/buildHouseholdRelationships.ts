import type { IntakePersonCandidate, IntakeRelationshipCandidate } from "@/lib/intake/types";

let relationshipCounter = 0;

function nextRelationshipId(): string {
    relationshipCounter += 1;
    return `relationship-${relationshipCounter}`;
}

export function __resetRelationshipCounterForTests(): void {
    relationshipCounter = 0;
}

/** Build parent/guardian → child relationship candidates from grouped people. */
export function buildHouseholdRelationships(input: {
    parents: IntakePersonCandidate[];
    children: IntakePersonCandidate[];
}): IntakeRelationshipCandidate[] {
    const relationships: IntakeRelationshipCandidate[] = [];
    const guardians = input.parents.filter((p) => p.role === "parent" || p.role === "guardian");

    for (const child of input.children) {
        for (const parent of guardians) {
            relationships.push({
                relationship_id: nextRelationshipId(),
                kind: "parent_guardian_to_child",
                from_candidate_id: parent.candidate_id,
                to_candidate_id: child.candidate_id,
                confidence: parent.confidence === "high" && child.confidence === "high" ? "high" : "medium",
                validation_state:
                    parent.validation_state === "valid" && child.validation_state === "valid" ?
                        "valid"
                    :   "unknown",
                source_fact_ids: [...new Set([...parent.source_fact_ids, ...child.source_fact_ids])],
            });
        }
    }

    return relationships;
}
