/**
 * WHICH ANSWERS ON A FORM ARE MEDICAL — Medical's one answer, for every reader of a submission.
 *
 * A Processing operator reviewing paperwork, or anyone reading a submission, sees a child's medical
 * answers only with `health.view` (Director policy, FI-01). An answer is medical when the form says
 * so, never by guessing at labels:
 *
 *   - a field the form declares for Medical (`health_capture` immunization grid doses / history);
 *   - a field bound to a child's health-classified profile field (allergies, medical notes, special
 *     diet, special instructions) — by `field_source` key or shared value key;
 *   - any field inside a group collected for a `health.*` / `medical.*` collection provider.
 *
 * A collection proposal is medical when its provider is `health.*` or `medical.*`.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { HealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";
import { isChildHealthProfileFieldKey } from "@/lib/health/childHealthProfileFields";

const MEDICAL_PROVIDER = /^(health|medical)\./;

export function isMedicalCollectionProvider(ref: string | null | undefined): boolean {
    return typeof ref === "string" && MEDICAL_PROVIDER.test(ref.trim());
}

function boundToChildHealthField(f: FormField): boolean {
    const src = f.field_source as { entity_type?: string; field_key?: string; shared_value_key?: string } | undefined;
    if (!src) return false;
    const entity = (src.entity_type ?? "").toLowerCase();
    const childGrain = ["child", "customer_member", "inquiry_child", "student"].includes(entity);
    const key = (src.field_key ?? "").toLowerCase().replace(/^child_/, "");
    const shared = (src.shared_value_key ?? "").toLowerCase().replace(/^child_/, "");
    return (childGrain && isChildHealthProfileFieldKey(key)) || isChildHealthProfileFieldKey(shared);
}

/** Every field id on this form whose answer is medical. */
export function medicalFormFieldIds(schema: FormSchemaV1, declaration: HealthCaptureDeclaration | null | undefined): ReadonlySet<string> {
    const out = new Set<string>();
    for (const v of declaration?.immunization_grid?.vaccines ?? []) for (const id of v.dose_field_ids) out.add(id);
    for (const h of declaration?.immunization_grid?.history ?? []) out.add(h.field_id);
    const walk = (fields: readonly FormField[], inMedicalGroup: boolean) => {
        for (const f of fields) {
            const binding = (f as { collection_binding?: { collection_provider_ref?: string } }).collection_binding;
            const medicalGroup = inMedicalGroup || isMedicalCollectionProvider(binding?.collection_provider_ref);
            if (medicalGroup || boundToChildHealthField(f)) out.add(f.id);
            if (f.type === "group") walk(f.fields, medicalGroup);
        }
    };
    walk(schema.fields, false);
    return out;
}
