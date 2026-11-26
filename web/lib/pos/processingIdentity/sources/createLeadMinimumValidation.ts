/**
 * D4 §9 — server-side minimum creation thresholds (frozen RFC Decision D).
 * Shared by the Create Lead source adapter and plan builder; callers cannot bypass.
 */

import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { validateCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/validateCreateLeadCommitSelection";

export type CreateLeadMinimumValidation = { ok: true } | { ok: false; issues: string[] };

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** Person creation minimum: name + (email OR phone). */
export function validatePersonCreationMinimum(input: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
}): CreateLeadMinimumValidation {
    const issues: string[] = [];
    if (!trim(input.first_name)) issues.push("First name is required.");
    if (!trim(input.last_name)) issues.push("Last name is required.");
    if (!trim(input.email) && !trim(input.phone)) issues.push("Phone or email is required.");
    return issues.length ? { ok: false, issues } : { ok: true };
}

/** Child creation minimum: name plus DOB or age. */
export function validateChildCreationMinimum(child: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    dob?: string | null;
    age_years?: number | null;
}): CreateLeadMinimumValidation {
    const name = trim(child.display_name) || trim(child.first_name);
    if (!name) return { ok: false, issues: ["Child requires a name."] };
    const hasDobOrAge = Boolean(trim(child.dob)) || (child.age_years != null && child.age_years > 0);
    if (!hasDobOrAge) return { ok: false, issues: ["Child requires DOB or age."] };
    return { ok: true };
}

/** Participation requires child + family context. */
export function validateLeadParticipationContext(input: {
    household: IntakeHouseholdCandidate;
    hasParticipationIntent: boolean;
}): CreateLeadMinimumValidation {
    if (!input.hasParticipationIntent) return { ok: true };
    if (input.household.children.length === 0) {
        return { ok: false, issues: ["Enrollment participation requires at least one child."] };
    }
    return { ok: true };
}

/** Full Create Lead processing minimum. */
export function validateCreateLeadProcessingMinimum(input: {
    values: Record<string, string>;
    selection: CreateLeadCommitSelection | null;
    household: IntakeHouseholdCandidate | null;
    requireLocation?: boolean;
    orgId: string;
    workUnitId: string | null;
    statusKey: string | null;
    hasParticipationIntent?: boolean;
}): CreateLeadMinimumValidation {
    const issues: string[] = [];
    if (!input.workUnitId) issues.push("Create Lead is not configured for this process/location.");
    if (!input.statusKey) issues.push("Create Lead status is not configured.");
    if (!input.orgId) issues.push("Organization context is required.");

    if (input.selection) {
        const sel = validateCreateLeadCommitSelection({
            selection: input.selection,
            values: input.values,
            requireLocation: input.requireLocation,
        });
        if (!sel.ok) issues.push(...sel.issues);
    } else if (input.household) {
        const parent = input.household.parents_guardians[0] ?? input.household.parents[0];
        if (parent) {
            const p = validatePersonCreationMinimum({
                first_name: parent.first_name,
                last_name: parent.last_name,
                email: parent.emails[0],
                phone: parent.phones[0],
            });
            if (!p.ok) issues.push(...p.issues);
        }
    }

    if (input.household) {
        const part = validateLeadParticipationContext({
            household: input.household,
            hasParticipationIntent: input.hasParticipationIntent ?? false,
        });
        if (!part.ok) issues.push(...part.issues);
    }

    return issues.length ? { ok: false, issues } : { ok: true };
}
