import type {
    IntakeAddressCandidate,
    IntakeFact,
    IntakeHouseholdCandidate,
    IntakeLocationCandidate,
    IntakePersonCandidate,
} from "@/lib/intake/types";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
import {
    buildHouseholdReviewWarnings,
    householdCommitLimited,
} from "@/lib/intake/review/intakeReviewWarnings";
import { splitPersonName } from "@/lib/intake/normalize/personName";
import { buildHouseholdRelationships } from "@/lib/intake/relationship/buildHouseholdRelationships";

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
    const first = firstId(split, normalized, role);
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
        calculated_age: null,
        program_interest: null,
        source_fact_ids: [fact.fact_id],
        confidence: hasStructuredName ? (fact.confidence === "low" ? "medium" : fact.confidence) : "medium",
        validation_state: hasStructuredName ? "valid" : "ambiguous",
        source_line: fact.source_line,
    };
}

function firstId(
    split: ReturnType<typeof splitPersonName>,
    normalized: string,
    role: IntakePersonCandidate["role"],
): string | null {
    if (split?.first) return split.first;
    if (role === "child" || role === "dependent") return normalized || null;
    return null;
}

function attachChildContext(
    child: IntakePersonCandidate,
    facts: IntakeFact[],
    options?: { allowCrossLine?: boolean },
): IntakePersonCandidate {
    const line = child.source_line;
    let dob: string | null = child.dob;
    let age: number | null = child.age_years;
    const factIds = [...child.source_fact_ids];

    for (const fact of facts) {
        if (
            !options?.allowCrossLine &&
            line != null &&
            fact.source_line != null &&
            fact.source_line !== line
        ) {
            continue;
        }
        if (fact.fact_type !== "dob" && fact.fact_type !== "age_years") continue;
        if (fact.role_hint === "parent") continue;

        if (fact.fact_type === "dob" && !dob) {
            dob = String(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
        }
        if (fact.fact_type === "age_years" && age == null) {
            age = Number(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
        }
    }

    const derived = dob ? deriveAgeFromDateOfBirth(dob) : null;
    const calculated_age =
        derived?.value ? { value: derived.value, display: derived.display } : null;
    const corroborated = Boolean(dob || age != null);
    return {
        ...child,
        dob,
        age_years: age,
        calculated_age,
        source_fact_ids: [...new Set(factIds)],
        confidence: corroborated || child.confidence === "high" ? "high" : child.confidence,
        validation_state: child.validation_state === "ambiguous" && corroborated ? "valid" : child.validation_state,
    };
}

function inferChildLastNames(
    parents: IntakePersonCandidate[],
    children: IntakePersonCandidate[],
): IntakePersonCandidate[] {
    const parentLastNames = parents
        .map((p) => p.last_name?.trim())
        .filter((name): name is string => Boolean(name));
    const uniqueParentLastNames = [...new Set(parentLastNames)];

    if (uniqueParentLastNames.length === 1) {
        const sharedLast = uniqueParentLastNames[0]!;
        return children.map((child) => {
            if (child.last_name?.trim()) return child;
            if (!child.first_name?.trim()) return child;
            return {
                ...child,
                last_name: sharedLast,
                last_name_inferred: true,
                validation_state: child.validation_state === "ambiguous" ? "valid" : child.validation_state,
                confidence: child.confidence === "medium" ? "high" : child.confidence,
            };
        });
    }

    return children;
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

    const parentFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "parent");
    const childFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "child");

    const parents: IntakePersonCandidate[] = [];
    for (const fact of parentFacts) {
        const person = personFromNameFact(fact, "parent");
        if (person) {
            parents.push(person);
            assignedFactIds.add(fact.fact_id);
        }
    }

    let children: IntakePersonCandidate[] = [];
    for (const fact of childFacts) {
        const base = personFromNameFact(fact, "child");
        if (!base) continue;
        children.push(base);
        assignedFactIds.add(fact.fact_id);
    }

    if (children.length === 1) {
        children[0] = attachChildContext(children[0]!, facts, { allowCrossLine: true });
    } else {
        for (let i = 0; i < children.length; i++) {
            children[i] = attachChildContext(children[i]!, facts);
        }
    }

    children = inferChildLastNames(parents, children);

    for (const child of children) {
        for (const id of child.source_fact_ids) assignedFactIds.add(id);
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
    const programFact = facts.find((f) => f.fact_type === "program_interest");
    const startDateFact = facts.find((f) => f.fact_type === "date");
    if (sourceFact) assignedFactIds.add(sourceFact.fact_id);
    if (notesFact) assignedFactIds.add(notesFact.fact_id);
    if (programFact) assignedFactIds.add(programFact.fact_id);
    if (startDateFact) assignedFactIds.add(startDateFact.fact_id);

    const address = mergeAddressFacts(facts);
    if (address) {
        for (const id of address.source_fact_ids) assignedFactIds.add(id);
    }

    const location = mergeLocationFacts(facts);
    if (location) {
        for (const id of location.source_fact_ids) assignedFactIds.add(id);
    }

    const relationships = buildHouseholdRelationships({ parents, children });

    const review_warnings = buildHouseholdReviewWarnings({
        parents,
        children,
        has_address: Boolean(address),
        action_has_address_field: false,
    });

    const unassigned_fact_ids = facts.filter((f) => !assignedFactIds.has(f.fact_id)).map((f) => f.fact_id);

    return {
        household_id: nextId("household"),
        parents,
        children,
        address,
        location,
        source: sourceFact ? String(sourceFact.normalized_value ?? sourceFact.raw_value).trim() : null,
        notes: notesFact ? String(notesFact.normalized_value ?? notesFact.raw_value).trim() : null,
        program_interest:
            programFact ? String(programFact.normalized_value ?? programFact.raw_value).trim() : null,
        desired_start_date:
            startDateFact ? String(startDateFact.normalized_value ?? startDateFact.raw_value).trim() : null,
        relationships,
        unassigned_fact_ids,
        review_warnings,
        commit_limited_to_primary: householdCommitLimited(review_warnings),
    };
}
