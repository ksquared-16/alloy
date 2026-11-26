import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";
import { normalizeIntakeEmail, normalizeIntakePhone } from "@/lib/forms/intake/intakePersonMatch";
import type { IntakeFact, IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function personCandidate(input: {
    id: string;
    role: IntakePersonCandidate["role"];
    firstName: string | null;
    lastName: string | null;
    emails?: string[];
    phones?: string[];
    dob?: string | null;
    factIds?: string[];
}): IntakePersonCandidate {
    return {
        candidate_id: input.id,
        role: input.role,
        first_name: input.firstName,
        last_name: input.lastName,
        emails: input.emails ?? [],
        phones: input.phones ?? [],
        dob: input.dob ?? null,
        age_years: null,
        calculated_age: null,
        program_interest: null,
        source_fact_ids: input.factIds ?? [],
        confidence: "high",
        validation_state: "valid",
    };
}

/** Build an intake household graph from public-form intake meta (C1 shadow path). */
export function buildHouseholdFromFormIntakeMeta(
    meta: FormIntakeMeta,
    submissionId: string,
): IntakeHouseholdCandidate {
    const g = meta.guardian ?? {};
    const email = typeof g.email === "string" ? g.email.trim() : "";
    const phone = typeof g.phone === "string" ? g.phone.trim() : "";
    const firstName = typeof g.first_name === "string" ? g.first_name.trim() : "";
    const lastName = typeof g.last_name === "string" ? g.last_name.trim() : "";

    const parent = personCandidate({
        id: `parent:${submissionId}`,
        role: "parent",
        firstName: firstName || null,
        lastName: lastName || null,
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
    });

    const children: IntakePersonCandidate[] = [];
    const childRows = Array.isArray(meta.children) ? meta.children : [];
    if (childRows.length > 0) {
        childRows.forEach((child, idx) => {
            children.push(
                personCandidate({
                    id: `child:${submissionId}:${idx}`,
                    role: "child",
                    firstName: typeof child.first_name === "string" ? child.first_name.trim() : null,
                    lastName: typeof child.last_name === "string" ? child.last_name.trim() : null,
                    dob: typeof child.dob === "string" ? child.dob.slice(0, 10) : null,
                }),
            );
        });
    } else if (meta.child) {
        const c = meta.child;
        children.push(
            personCandidate({
                id: `child:${submissionId}:0`,
                role: "child",
                firstName: typeof c.first_name === "string" ? c.first_name.trim() : null,
                lastName: typeof c.last_name === "string" ? c.last_name.trim() : null,
                dob: typeof c.dob === "string" ? c.dob.slice(0, 10) : null,
            }),
        );
    }

    return {
        household_id: `household:${submissionId}`,
        parents_guardians: [parent],
        parents: [],
        children,
        household_contacts: [],
        address: null,
        location:
            formIntakeLocationId(meta) ?
                {
                    label: "location",
                    resolved_value: formIntakeLocationId(meta),
                    resolved_label: null,
                    source_fact_ids: [],
                    confidence: "high",
                    validation_state: "valid",
                }
            :   null,
        source: "form_submission",
        notes: null,
        program_interest: null,
        start_date: null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}

/** Extract durable intake facts from form intake meta (B2/C1). */
export function extractFactsFromFormIntakeMeta(meta: FormIntakeMeta, submissionId: string): IntakeFact[] {
    const facts: IntakeFact[] = [];
    const push = (fact: IntakeFact) => facts.push(fact);

    const g = meta.guardian ?? {};
    if (typeof g.email === "string" && g.email.trim()) {
        const raw = g.email.trim();
        push({
            fact_id: `fact:${submissionId}:guardian_email`,
            fact_type: "email",
            raw_value: raw,
            normalized_value: normalizeIntakeEmail(raw),
            confidence: "high",
            validation_state: "valid",
            role_hint: "parent",
            evidence: "form_field:guardian.email",
        });
    }
    if (typeof g.phone === "string" && g.phone.trim()) {
        const raw = g.phone.trim();
        push({
            fact_id: `fact:${submissionId}:guardian_phone`,
            fact_type: "phone",
            raw_value: raw,
            normalized_value: normalizeIntakePhone(raw),
            confidence: "high",
            validation_state: "valid",
            role_hint: "parent",
            evidence: "form_field:guardian.phone",
        });
    }
    if (typeof g.first_name === "string" && g.first_name.trim()) {
        push({
            fact_id: `fact:${submissionId}:guardian_first_name`,
            fact_type: "person_name",
            raw_value: g.first_name.trim(),
            normalized_value: g.first_name.trim(),
            confidence: "high",
            validation_state: "valid",
            role_hint: "parent",
            evidence: "form_field:guardian.first_name",
        });
    }
    if (typeof g.last_name === "string" && g.last_name.trim()) {
        push({
            fact_id: `fact:${submissionId}:guardian_last_name`,
            fact_type: "person_name",
            raw_value: g.last_name.trim(),
            normalized_value: g.last_name.trim(),
            confidence: "high",
            validation_state: "valid",
            role_hint: "parent",
            evidence: "form_field:guardian.last_name",
        });
    }

    const childRows = Array.isArray(meta.children) ? meta.children : meta.child ? [meta.child] : [];
    childRows.forEach((child, idx) => {
        const prefix = `fact:${submissionId}:child:${idx}`;
        if (typeof child.first_name === "string" && child.first_name.trim()) {
            push({
                fact_id: `${prefix}:first_name`,
                fact_type: "person_name",
                raw_value: child.first_name.trim(),
                normalized_value: child.first_name.trim(),
                confidence: "high",
                validation_state: "valid",
                role_hint: "child",
                evidence: `form_field:child[${idx}].first_name`,
            });
        }
        if (typeof child.last_name === "string" && child.last_name.trim()) {
            push({
                fact_id: `${prefix}:last_name`,
                fact_type: "person_name",
                raw_value: child.last_name.trim(),
                normalized_value: child.last_name.trim(),
                confidence: "high",
                validation_state: "valid",
                role_hint: "child",
                evidence: `form_field:child[${idx}].last_name`,
            });
        }
        if (typeof child.dob === "string" && child.dob.trim()) {
            push({
                fact_id: `${prefix}:dob`,
                fact_type: "dob",
                raw_value: child.dob.trim(),
                normalized_value: child.dob.trim().slice(0, 10),
                confidence: "high",
                validation_state: "valid",
                role_hint: "child",
                evidence: `form_field:child[${idx}].dob`,
            });
        }
    });

    if (facts.length === 0) {
        push({
            fact_id: `fact:${submissionId}:submission`,
            fact_type: "source",
            raw_value: submissionId,
            normalized_value: submissionId,
            confidence: "low",
            validation_state: "unknown",
            evidence: "form_submission",
        });
    }

    return facts;
}

export function formIntakeLocationId(meta: FormIntakeMeta): string | null {
    if (meta.child?.location_id) return meta.child.location_id;
    const firstChild = Array.isArray(meta.children) ? meta.children[0] : null;
    return firstChild?.location_id ?? null;
}

export function formSubmissionIdempotencyKey(submissionId: string): string {
    return `form_submission:${submissionId}`;
}
