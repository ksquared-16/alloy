/**
 * Canonical primary-contact projection for layout runtime.
 *
 * Single refKey: person.is_primary_contact — household relationship role, not enrollment status.
 */

export const LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY = "person.is_primary_contact" as const;

export const LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL = "Primary contact" as const;
export const LAYOUT_RUNTIME_NOT_PRIMARY_CONTACT_LABEL = "Not primary" as const;

export function isLayoutRuntimePrimaryContactRefKey(refKey: string | undefined | null): boolean {
    return refKey?.trim() === LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY;
}

/** Display labels for badge/text fields — never blank when relationship context exists. */
export function formatLayoutRuntimePrimaryContactDisplay(isPrimary: boolean): string {
    return isPrimary ? LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL : LAYOUT_RUNTIME_NOT_PRIMARY_CONTACT_LABEL;
}
