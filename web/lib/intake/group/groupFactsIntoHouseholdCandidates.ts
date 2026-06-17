import type {
    IntakeAddressCandidate,
    IntakeFact,
    IntakeHouseholdCandidate,
    IntakeLocationCandidate,
    IntakePersonCandidate,
} from "@/lib/intake/types";
import { splitPersonName } from "@/lib/intake/normalize/personName";

let candidateCounter = 0;

function nextId(prefix: string): string {
    candidateCounter += 1;
    return `${prefix}-${candidateCounter}`;
}

export function __resetHouseholdCandidateCounterForTests(): void {
    candidateCounter = 0;
}

function personFromNameFact(
    fact: IntakeFact,
    role: IntakePersonCandidate["role"],
): IntakePersonCandidate | null {
    const normalized = String(fact.normalized_value ?? fact.raw_value).trim();
    const split = splitPersonName(normalized);
    const first = split?.first ?? (role === "child" ? normalized : null);
    const last = split?.last ?? null;
    if (!first && !last) return null;

    const hasStructuredName = Boolean(split?.first && split?.last);
    return {
        candidate_id: nextId("person"),
        role,
        first_name: first,
        last_name: last,
        emails: [],
        phones: [],
        dob: null,
        age_years: null,
        program_interest: null,
        source_fact_ids: [fact.fact_id],
        confidence: hasStructuredName ? (fact.confidence === "low" ? "medium" : fact.confidence) : "medium",
        validation_state: hasStructuredName ? "valid" : "ambiguous",
        source_line: fact.source_line,
    };
}

function attachChildContext(
    child: IntakePersonCandidate,
    facts: IntakeFact[],
): IntakePersonCandidate {
    const line = child.source_line;
    let dob: string | null = child.dob;
    let age: number | null = child.age_years;
    const factIds = [...child.source_fact_ids];

    for (const fact of facts) {
        if (line != null && fact.source_line != null && fact.source_line !== line) continue;
        if (fact.fact_type === "dob" && !dob) {
            dob = String(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
        }
        if (fact.fact_type === "age_years" && age == null) {
            age = Number(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
        }
    }

    const corroborated = Boolean(dob || age != null);
    return {
        ...child,
        dob,
        age_years: age,
        source_fact_ids: [...new Set(factIds)],
        confidence: corroborated || child.confidence === "high" ? "high" : child.confidence,
        validation_state: child.validation_state === "ambiguous" && corroborated ? "valid" : child.validation_state,
    };
}

function mergeAddressFacts(facts: IntakeFact[]): IntakeAddressCandidate | null {
    const addressFacts = facts.filter((f) => f.fact_type === "address");
    if (addressFacts.length === 0) return null;
    const lines = addressFacts.map((f) => String(f.normalized_value ?? f.raw_value).trim()).filter(Boolean);
    return {
        candidate_id: nextId("address"),
        lines,
        raw: lines.join("\n"),
        source_fact_ids: addressFacts.map((f) => f.fact_id),
        confidence: "medium",
        validation_state: "unknown",
    };
}

function mergeLocationFacts(facts: IntakeFact[]): IntakeLocationCandidate | null {
    const locationFacts = facts.filter((f) => f.fact_type === "location_label");
    if (locationFacts.length === 0) return null;
    const primary = locationFacts[0]!;
    return {
        label: String(primary.normalized_value ?? primary.raw_value).trim(),
        resolved_value: null,
        resolved_label: null,
        source_fact_ids: locationFacts.map((f) => f.fact_id),
        confidence: primary.confidence,
        validation_state: "unknown",
    };
}

/** Group source-agnostic facts into household/person candidates for any intake surface. */
export function groupFactsIntoHouseholdCandidates(facts: IntakeFact[]): IntakeHouseholdCandidate {
    const assignedFactIds = new Set<string>();
    const review_warnings: string[] = [];

    const parentFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "parent");
    const childFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "child");

    const parents: IntakePersonCandidate[] = [];
    for (const fact of parentFacts) {
        const person = personFromNameFact(fact, fact.role_hint === "parent" ? "parent" : "guardian");
        if (person) {
            parents.push(person);
            assignedFactIds.add(fact.fact_id);
        }
    }

    const children: IntakePersonCandidate[] = [];
    for (const fact of childFacts) {
        const base = personFromNameFact(fact, "child");
        if (!base) continue;
        const enriched = attachChildContext(base, facts);
        children.push(enriched);
        assignedFactIds.add(fact.fact_id);
        for (const id of enriched.source_fact_ids) assignedFactIds.add(id);
    }

    const householdEmails = facts.filter((f) => f.fact_type === "email");
    const householdPhones = facts.filter((f) => f.fact_type === "phone");
    if (parents.length > 0) {
        const primary = parents[0]!;
        primary.emails = householdEmails.map((f) => String(f.normalized_value ?? f.raw_value).trim());
        primary.phones = householdPhones.map((f) => String(f.normalized_value ?? f.raw_value).trim());
        for (const f of [...householdEmails, ...householdPhones]) assignedFactIds.add(f.fact_id);
    }

    const sourceFact = facts.find((f) => f.fact_type === "source");
    const notesFact = facts.find((f) => f.fact_type === "notes");
    if (sourceFact) assignedFactIds.add(sourceFact.fact_id);
    if (notesFact) assignedFactIds.add(notesFact.fact_id);

    const address = mergeAddressFacts(facts);
    if (address) {
        for (const id of address.source_fact_ids) assignedFactIds.add(id);
    }

    const location = mergeLocationFacts(facts);
    if (location) {
        for (const id of location.source_fact_ids) assignedFactIds.add(id);
    }

    if (parents.length > 1) {
        review_warnings.push(
            `${parents.length - 1} additional parent/guardian candidate(s) detected but not shown in this form.`,
        );
    }
    if (children.length > 1) {
        review_warnings.push(
            `${children.length - 1} additional child candidate(s) detected but not shown in this form.`,
        );
    }

    const unassigned_fact_ids = facts.filter((f) => !assignedFactIds.has(f.fact_id)).map((f) => f.fact_id);

    return {
        household_id: nextId("household"),
        parents,
        children,
        address,
        location,
        source: sourceFact ? String(sourceFact.normalized_value ?? sourceFact.raw_value).trim() : null,
        notes: notesFact ? String(notesFact.normalized_value ?? notesFact.raw_value).trim() : null,
        unassigned_fact_ids,
        review_warnings,
    };
}
