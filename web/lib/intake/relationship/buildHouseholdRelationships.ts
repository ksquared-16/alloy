import type { IntakePersonCandidate, IntakeRelationshipCandidate } from "@/lib/intake/types";

let relationshipCounter = 0;

function nextRelationshipId(): string {
    relationshipCounter += 1;
    return `relationship-${relationshipCounter}`;
}

function personDisplayName(person: IntakePersonCandidate): string {
    return [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || person.candidate_id;
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
            const highConfidence = parent.confidence === "high" && child.confidence === "high";
            relationships.push({
                relationship_id: nextRelationshipId(),
                kind: "parent_guardian_to_child",
                from_candidate_id: parent.candidate_id,
                to_candidate_id: child.candidate_id,
                confidence: highConfidence ? "high" : "medium",
                validation_state:
                    parent.validation_state === "valid" && child.validation_state === "valid" ?
                        "valid"
                    :   "unknown",
                source_fact_ids: [...new Set([...parent.source_fact_ids, ...child.source_fact_ids])],
                inferred: true,
            });
        }
    }

    return relationships;
}

export function summarizeHouseholdRelationships(input: {
    parents: IntakePersonCandidate[];
    children: IntakePersonCandidate[];
    relationships: IntakeRelationshipCandidate[];
}): string[] {
    const parentById = new Map(input.parents.map((p) => [p.candidate_id, p]));
    const childById = new Map(input.children.map((c) => [c.candidate_id, c]));

    return input.relationships.map((rel) => {
        const parent = parentById.get(rel.from_candidate_id);
        const child = childById.get(rel.to_candidate_id);
        const label = `${personDisplayName(parent!)} → ${personDisplayName(child!)}`;
        const tags = [
            rel.inferred ? "inferred" : "explicit",
            rel.confidence,
        ].join(", ");
        return `${label} (${tags})`;
    });
}

export function __resetRelationshipCounterForTests(): void {
    relationshipCounter = 0;
}
