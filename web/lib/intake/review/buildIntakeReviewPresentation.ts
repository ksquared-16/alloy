import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";
import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";
import { formatIsoDateForDisplay } from "@/lib/intake/normalize/date";
import { formatIntakeReviewWarnings } from "@/lib/intake/review/intakeReviewWarnings";

export type IntakeReviewPersonCard = {
    candidate_id: string;
    role: string;
    display_name: string;
    emails: string[];
    phones: string[];
    dob: string | null;
    age_display: string | null;
    is_primary: boolean;
    needs_review: boolean;
};

export type IntakeReviewPresentation = {
    parents: IntakeReviewPersonCard[];
    children: IntakeReviewPersonCard[];
    location_label: string | null;
    location_resolved_label: string | null;
    address_lines: string[];
    program_interest: string | null;
    start_date: string | null;
    source: string | null;
    notes: string | null;
    review_warnings: string[];
    review_warning_items: IntakeReviewWarning[];
    commit_limited: boolean;
};

function personDisplayName(person: IntakePersonCandidate): string {
    const first = person.first_name?.trim() ?? "";
    const last = person.last_name?.trim() ?? "";
    return [first, last].filter(Boolean).join(" ") || "Unknown";
}

function personAgeDisplay(person: IntakePersonCandidate): string | null {
    if (person.calculated_age?.display) return person.calculated_age.display;
    if (person.age_years != null) return `~${person.age_years} yrs (approximate)`;
    return null;
}

function toPersonCard(
    person: IntakePersonCandidate,
    roleLabel: string,
    isPrimary: boolean,
): IntakeReviewPersonCard {
    return {
        candidate_id: person.candidate_id,
        role: roleLabel,
        display_name: personDisplayName(person),
        emails: person.emails,
        phones: person.phones,
        dob: person.dob,
        age_display: personAgeDisplay(person),
        is_primary: isPrimary,
        needs_review: person.validation_state === "ambiguous" || person.validation_state === "invalid",
    };
}

/** Build compact review cards from grouped household candidates (action-agnostic). */
export function buildIntakeReviewPresentation(
    household: IntakeHouseholdCandidate | null | undefined,
): IntakeReviewPresentation | null {
    if (!household) return null;
    const guardians = household.parents_guardians?.length ? household.parents_guardians : household.parents;
    if (
        guardians.length === 0 &&
        household.children.length === 0 &&
        !household.location &&
        !household.address
    ) {
        return null;
    }

    return {
        parents: guardians.map((p, i) => toPersonCard(p, p.role, i === 0)),
        children: household.children.map((c, i) => toPersonCard(c, c.role, i === 0)),
        location_label: household.location?.label ?? null,
        location_resolved_label: household.location?.resolved_label ?? null,
        address_lines: household.address?.lines ?? [],
        program_interest: household.program_interest,
        start_date: household.start_date,
        source: household.source,
        notes: household.notes,
        review_warnings: formatIntakeReviewWarnings(household.review_warnings),
        review_warning_items: household.review_warnings,
        commit_limited: household.commit_limited_to_primary ?? false,
    };
}

function formatDobForDisplay(iso: string): string {
    return formatIsoDateForDisplay(iso);
}

export { formatDobForDisplay };
