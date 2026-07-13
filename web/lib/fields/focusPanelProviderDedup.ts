/**
 * Focus Panel provider deduplication — one picker row per canonical field identity.
 *
 * Aliases and legacy compatibility keys collapse to a single canonical refKey in
 * focus_panel pickers. Resolution/publish may still accept aliases at compat boundaries.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";

/** Alias refKey → canonical refKey for focus_panel picker assembly. */
export const FOCUS_PANEL_PICKER_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
    "child.display_name": "child.first_name",
    "child.name": "child.first_name",
    "child.dob_age": "child.date_of_birth",
    "child.age": "child.date_of_birth",
    "inquiry_child.program_category": "inquiry_child.program",
    "inquiry_child.program_category_id": "inquiry_child.program",
    "child.program": "inquiry_child.program",
    "inquiry_child.desired_schedule_type": "inquiry_child.schedule_type",
    "child.desired_start_date": "child.start_date",
    "person.primary_contact_name": "person.primary_contact_name",
    "contact.first_name": "contact.first_name",
    "contact.last_name": "contact.last_name",
    "contact.email": "contact.email",
    "contact.phone": "contact.phone",
};

export function canonicalPickerIdentityForRefKey(refKey: string): string {
    return FOCUS_PANEL_PICKER_ALIAS_TO_CANONICAL[refKey.trim()] ?? refKey.trim();
}

/**
 * Keep one provider per canonical picker identity. When both alias and canonical exist,
 * prefer the canonical refKey row; otherwise keep the first seen provider for that identity.
 */
export function dedupeFocusPanelPickerProviders(
    providers: readonly CanonicalDataProvider[],
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
