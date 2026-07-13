/**
 * Thin adapter: Focus Panel emergency-contact draft → IntakeHouseholdCandidate
 * for the canonical intake record-resolution path. Not a parallel fuzzy matcher.
 */

import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

export type EmergencyContactIdentityDraft = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    relationship_label?: string;
};

export function buildEmergencyContactResolutionHousehold(
    draft: EmergencyContactIdentityDraft,
): IntakeHouseholdCandidate {
    const first = draft.first_name.trim();
    const last = draft.last_name.trim();
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    const guardian: IntakePersonCandidate = {
        candidate_id: "fp-ec-guardian",
        role: "guardian",
        first_name: first || null,
        last_name: last || null,
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
        dob: null,
        age_years: null,
        calculated_age: null,
        program_interest: null,
        source_fact_ids: [],
        confidence: "medium",
        validation_state: "valid",
    };
    return {
        household_id: `fp-ec-${first}-${last}`.toLowerCase().replace(/\s+/g, "-") || "fp-ec",
        parents_guardians: [guardian],
        parents: [guardian],
        children: [],
        household_contacts: [],
        address: null,
        location: null,
        source: "focus_panel_emergency_contact",
        notes: draft.relationship_label?.trim() || null,
        program_interest: null,
        start_date: null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}

/** Enough identity signal to invoke resolution (avoid noisy empty searches). */
export function emergencyContactDraftReadyForResolution(draft: EmergencyContactIdentityDraft): boolean {
    const email = draft.email.trim();
    const phone = draft.phone.replace(/\D/g, "");
    const name = `${draft.first_name} ${draft.last_name}`.trim();
    if (email.includes("@")) return true;
    if (phone.length >= 7) return true;
    return name.length >= 3 && (Boolean(email) || Boolean(phone) || name.split(/\s+/).length >= 2);
}
