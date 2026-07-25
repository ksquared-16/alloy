/**
 * Canonical provider deduplication — one picker row per canonical field identity.
 *
 * Shared across focus_panel, queue_row, and business_process consumer assemblies.
 * Aliases collapse at picker assembly; compat boundaries may still accept aliases.
 */

import type { CanonicalDataConsumerSurface } from "@/lib/fields/canonicalDataProviderModel";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";

/** Alias refKey → canonical refKey for picker assembly (all configurable consumers). */
export const CANONICAL_PICKER_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
    "child.display_name": "child.first_name",
    "child.name": "child.first_name",
    // dob_age is a legacy combined label — collapse to DOB. Age stays a separate computed field
    // so Children identity cards can select Date of birth independently from Age / Age band.
    "child.dob_age": "child.date_of_birth",
    "inquiry_child.program_category": "inquiry_child.program",
    "inquiry_child.program_category_id": "inquiry_child.program",
    "child.program": "inquiry_child.program",
    "child.location": "inquiry_child.location_id",
    "child.room": "inquiry_child.program_room_cohort_key",
    "child.schedule": "inquiry_child.schedule_type",
    "child.start_date": "inquiry_child.start_date",
    "child.status": "inquiry_child.outcome_status_key",
    "inquiry_child.desired_schedule_type": "inquiry_child.schedule_type",
    "child.desired_start_date": "inquiry_child.start_date",
    "person.primary_contact_name": "person.primary_contact_name",
    "contact.first_name": "contact.first_name",
    "contact.last_name": "contact.last_name",
    "contact.email": "contact.email",
    "contact.phone": "contact.phone",
};

export function canonicalPickerIdentityForRefKey(refKey: string): string {
    return CANONICAL_PICKER_ALIAS_TO_CANONICAL[refKey.trim()] ?? refKey.trim();
}

/**
 * Keep one provider per canonical picker identity. When both alias and canonical exist,
 * prefer the canonical refKey row; otherwise keep the first seen provider for that identity.
 */
export function dedupeCanonicalPickerProviders(
    providers: readonly CanonicalDataProvider[],
    _consumer?: CanonicalDataConsumerSurface,
): CanonicalDataProvider[] {
    const byIdentity = new Map<string, CanonicalDataProvider>();
    for (const provider of providers) {
        const identity = canonicalPickerIdentityForRefKey(provider.refKey);
        const existing = byIdentity.get(identity);
        if (!existing) {
            byIdentity.set(identity, provider);
            continue;
        }
        const existingIsCanonical = existing.refKey === identity;
        const incomingIsCanonical = provider.refKey === identity;
        if (!existingIsCanonical && incomingIsCanonical) {
            byIdentity.set(identity, provider);
        }
    }
    return [...byIdentity.values()].sort((a, b) => a.label.localeCompare(b.label));
}
