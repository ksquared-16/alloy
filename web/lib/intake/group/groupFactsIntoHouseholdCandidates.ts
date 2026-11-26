import type {
    IntakeAddressCandidate,
    IntakeFact,
    IntakeHouseholdCandidate,
    IntakeHouseholdContact,
    IntakeLocationCandidate,
    IntakePersonCandidate,
} from "@/lib/intake/types";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
import {
    buildHouseholdReviewWarnings,
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
    const first = split?.first ?? (role === "child" || role === "dependent" ? normalized : null);
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
        gender: null,
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
    options?: {
        allowCrossLine?: boolean;
        matchChildFirstName?: boolean;
        consumedDobFactIds?: Set<string>;
        consumedGenderFactIds?: Set<string>;
    },
): IntakePersonCandidate {
    const line = child.source_line;
    const firstName = child.first_name?.trim().toLowerCase() ?? "";
    let dob: string | null = child.dob;
    let age: number | null = child.age_years;
    let gender: IntakePersonCandidate["gender"] = child.gender ?? null;
    const factIds = [...child.source_fact_ids];
    const consumed = options?.consumedDobFactIds ?? new Set<string>();
    const consumedGender = options?.consumedGenderFactIds ?? new Set<string>();

    for (const fact of facts) {
        if (
            !options?.allowCrossLine &&
            line != null &&
            fact.source_line != null &&
            fact.source_line !== line
        ) {
            continue;
        }
        if (fact.fact_type !== "dob" && fact.fact_type !== "age_years" && fact.fact_type !== "gender") continue;
        if (fact.role_hint === "parent") continue;
        if (fact.fact_type === "gender") {
            if (consumedGender.has(fact.fact_id) || gender) continue;
        } else if (consumed.has(fact.fact_id)) {
            continue;
        }

        if (options?.matchChildFirstName && firstName) {
            const evidence = String(fact.evidence ?? "").toLowerCase();
            if (evidence && !evidence.includes(firstName)) continue;
        }

        if (fact.fact_type === "dob" && !dob) {
            dob = String(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
            consumed.add(fact.fact_id);
        }
        if (fact.fact_type === "age_years" && age == null) {
            age = Number(fact.normalized_value ?? fact.raw_value);
            factIds.push(fact.fact_id);
        }
        if (fact.fact_type === "gender" && !gender) {
            const raw = String(fact.normalized_value ?? fact.raw_value).trim().toLowerCase();
            if (raw === "female" || raw === "male") {
                gender = raw;
                factIds.push(fact.fact_id);
                consumedGender.add(fact.fact_id);
            }
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
        gender: gender ?? null,
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
    // Explicit child surname wins. Otherwise inherit the primary contact's surname (parents[0]).
    // Never fabricate a surname when the primary has none.
    const primaryLast = parents[0]?.last_name?.trim() || null;
    if (!primaryLast) return children;

    return children.map((child) => {
        if (child.last_name?.trim()) return child;
        if (!child.first_name?.trim()) return child;
        return {
            ...child,
            last_name: primaryLast,
            last_name_inferred: true,
            validation_state: child.validation_state === "ambiguous" ? "valid" : child.validation_state,
            confidence: child.confidence === "medium" ? "high" : child.confidence,
        };
    });
}

function inferParentSharedSurnames(parents: IntakePersonCandidate[]): IntakePersonCandidate[] {
    const shared = parents.find((p) => p.last_name?.trim())?.last_name?.trim();
    if (!shared) return parents;
    return parents.map((parent) => {
        if (parent.last_name?.trim() || !parent.first_name?.trim()) return parent;
        return {
            ...parent,
            last_name: shared,
            last_name_inferred: true,
            validation_state: "valid",
            confidence: parent.confidence === "medium" ? "high" : parent.confidence,
        };
    });
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

function emailLocalPart(value: string): string {
    const at = value.indexOf("@");
    return (at > 0 ? value.slice(0, at) : value).trim().toLowerCase();
}

/** Email local-part references this parent's name (e.g. `jason@…` → Jason; `jlyons@…` → Lyons). */
function parentMatchesEmailLocalPart(parent: IntakePersonCandidate, localPart: string): boolean {
    if (!localPart) return false;
    const norm = localPart.replace(/[._\-+0-9]/g, "");
    const first = (parent.first_name ?? "").trim().toLowerCase();
    const last = (parent.last_name ?? "").trim().toLowerCase();
    if (first.length >= 3 && norm.includes(first)) return true;
    if (last.length >= 3 && norm.includes(last)) return true;
    return false;
}

/**
 * Distribute extracted email/phone facts across the household's parents so each parent keeps their own
 * contact info — never collapse everything onto the primary (which silently drops a second parent's
 * email). Association precedence: same source line as the parent's name → email local-part matches the
 * parent's name → primary parent (so nothing is lost). Single-parent households are unaffected.
 */
function distributeContactFactsToParents(
    parents: IntakePersonCandidate[],
    emailFacts: IntakeFact[],
    phoneFacts: IntakeFact[],
): void {
    if (!parents.length) return;
    const primary = parents[0]!;
    const valueOf = (f: IntakeFact) => String(f.normalized_value ?? f.raw_value).trim();
    const parentBySourceLine = (line: number | undefined): IntakePersonCandidate | null =>
        typeof line === "number" ? (parents.find((p) => p.source_line === line) ?? null) : null;

    for (const f of emailFacts) {
        const value = valueOf(f);
        if (!value) continue;
        const byLine = parentBySourceLine(f.source_line);
        const byName = byLine ?? parents.find((p) => parentMatchesEmailLocalPart(p, emailLocalPart(value)));
        const parent = byLine ?? byName ?? primary;
        if (!parent.emails.includes(value)) parent.emails.push(value);
    }
    for (const f of phoneFacts) {
        const value = valueOf(f);
        if (!value) continue;
        const parent = parentBySourceLine(f.source_line) ?? primary;
        if (!parent.phones.includes(value)) parent.phones.push(value);
    }
}

function buildHouseholdContacts(facts: IntakeFact[]): IntakeHouseholdContact[] {
    const contacts: IntakeHouseholdContact[] = [];
    for (const fact of facts) {
        if (fact.fact_type !== "email" && fact.fact_type !== "phone") continue;
        contacts.push({
            kind: fact.fact_type,
            value: String(fact.normalized_value ?? fact.raw_value).trim(),
            raw_value: fact.raw_value,
            validation_state: fact.validation_state,
            source_fact_ids: [fact.fact_id],
        });
    }
    return contacts;
}

/** Group source-agnostic facts into household/person candidates for any intake surface. */
export function groupFactsIntoHouseholdCandidates(facts: IntakeFact[]): IntakeHouseholdCandidate {
    const assignedFactIds = new Set<string>();

    const parentFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "parent");
    const childFacts = facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "child");

    let parents: IntakePersonCandidate[] = [];
    for (const fact of parentFacts) {
        const person = personFromNameFact(fact, "parent");
        if (person) {
            parents.push(person);
            assignedFactIds.add(fact.fact_id);
        }
    }
    parents = inferParentSharedSurnames(parents);

    let children: IntakePersonCandidate[] = [];
    for (const fact of childFacts) {
        const base = personFromNameFact(fact, "child");
        if (!base) continue;
        children.push(base);
        assignedFactIds.add(fact.fact_id);
    }

    const consumedDobFactIds = new Set<string>();
    const consumedGenderFactIds = new Set<string>();
    if (children.length === 1) {
        children[0] = attachChildContext(children[0]!, facts, {
            allowCrossLine: true,
            consumedDobFactIds,
            consumedGenderFactIds,
        });
    } else {
        for (let i = 0; i < children.length; i++) {
            children[i] = attachChildContext(children[i]!, facts, {
                matchChildFirstName: true,
                consumedDobFactIds,
                consumedGenderFactIds,
            });
        }
    }

    children = inferChildLastNames(parents, children);

    for (const child of children) {
        for (const id of child.source_fact_ids) assignedFactIds.add(id);
    }

    const household_contacts = buildHouseholdContacts(facts);
    const householdEmails = facts.filter((f) => f.fact_type === "email");
    const householdPhones = facts.filter((f) => f.fact_type === "phone");
    if (parents.length > 0) {
        // Preserve each parent's own email/phone — do not collapse all contacts onto the primary.
        distributeContactFactsToParents(parents, householdEmails, householdPhones);
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

    const invalidPhone = householdPhones.some((f) => f.validation_state === "invalid");
    const invalidEmail = householdEmails.some((f) => f.validation_state === "invalid");
    const review_warnings = buildHouseholdReviewWarnings({
        parents,
        children,
        has_address: Boolean(address),
        action_has_address_field: true,
        has_invalid_phone: invalidPhone,
        invalid_phone_value: invalidPhone ? String(householdPhones[0]?.raw_value ?? "") : null,
        has_invalid_email: invalidEmail,
        invalid_email_value: invalidEmail ? String(householdEmails[0]?.raw_value ?? "") : null,
    });

    const unassigned_fact_ids = facts.filter((f) => !assignedFactIds.has(f.fact_id)).map((f) => f.fact_id);
    const unmapped_facts = facts.filter((f) => unassigned_fact_ids.includes(f.fact_id));

    return {
        household_id: nextId("household"),
        parents_guardians: parents,
        parents,
        children,
        household_contacts,
        address,
        location,
        source: sourceFact ? String(sourceFact.normalized_value ?? sourceFact.raw_value).trim() : null,
        notes: notesFact ? String(notesFact.normalized_value ?? notesFact.raw_value).trim() : null,
        program_interest:
            programFact ? String(programFact.normalized_value ?? programFact.raw_value).trim() : null,
        start_date:
            startDateFact ? String(startDateFact.normalized_value ?? startDateFact.raw_value).trim() : null,
        relationships,
        unassigned_fact_ids,
        unmapped_facts,
        review_warnings,
        commit_limited_to_primary: false,
    };
}
