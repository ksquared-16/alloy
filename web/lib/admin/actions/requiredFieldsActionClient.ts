/**
 * Open the canonical field editor for required opportunity fields.
 *
 * Readiness can now name a missing required field (see fieldPolicyReadinessProjection). This is how
 * the operator closes it: the same configured field definition the admin authored, rendered by the
 * same control the create-form modals use, saved through the normal PATCH.
 *
 * It is deliberately keyed by field, not by feature — nothing here knows what "source" is.
 */

export const ADMINV2_OPEN_REQUIRED_FIELDS_MODAL = "adminv2:open-required-fields-modal";

export type OpenRequiredFieldsModalDetail = {
    opportunity_id: string;
    /** Field keys to collect. Order is preserved in the form. */
    field_keys: string[];
};

export function dispatchOpenRequiredFieldsModal(opportunityId: string, fieldKeys: string[]): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    const keys = fieldKeys.map((k) => k.trim()).filter(Boolean);
    if (!id || keys.length === 0) return;
    window.dispatchEvent(
        new CustomEvent<OpenRequiredFieldsModalDetail>(ADMINV2_OPEN_REQUIRED_FIELDS_MODAL, {
            detail: { opportunity_id: id, field_keys: keys },
        })
    );
}
