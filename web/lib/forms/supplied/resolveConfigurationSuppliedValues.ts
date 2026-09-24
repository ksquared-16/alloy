/**
 * Values the ORGANISATION owns, read at the moment the document is generated.
 *
 * ## Why the Form does not hold the number
 *
 * A registration fee is the school's figure. Asking a parent to type it invites them to get it
 * wrong; copying it into the Form definition makes a second place it can be right, which is the
 * same thing as a second place it can be stale. Financials already owns it, in a charge template.
 *
 * So the Form holds a REFERENCE — `supplied_by { source_kind, source_key }` — and this resolves it
 * against canonical configuration each time paperwork is produced. That is what makes "change the
 * fee, print new paperwork" work with nobody editing a Form.
 *
 * ## Truthful when it cannot resolve
 *
 * A reference that names nothing resolves to NOTHING, and the destination stays empty. It never
 * falls back to a remembered number: a stale fee printed confidently on a document a family signs
 * is worse than a blank, because nobody can see that it is wrong.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { suppliedByOf } from "@/lib/forms/fieldSemantics";
import { listChargeTemplates } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import { formatMoneyFromCents } from "@/lib/adminFormatters";

export type SuppliedValueResolution = {
    readonly field_id: string;
    readonly source_kind: string;
    readonly source_key: string;
    readonly resolved: boolean;
    /** Presentation-ready, in the currency the owner declared. Absent when nothing resolved. */
    readonly display?: string;
    readonly amount_cents?: number;
    readonly reason?: string;
};

/** Every field in the schema that names canonical configuration as its source. */
export function configurationSuppliedFields(schema: Pick<FormSchemaV1, "fields">): FormField[] {
    const out: FormField[] = [];
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (suppliedByOf(f)) out.push(f);
            if (f.type === "group") walk(f.fields);
        }
    };
    walk(schema.fields);
    return out;
}

type TemplateLike = {
    template_key: string;
    is_active: boolean;
    effective_start: string;
    amount_cents: number | null;
    currency_code: string;
    label: string;
};

/**
 * The charge template a reference names, as the owner currently holds it.
 *
 * `template_key` is a lineage, not a row: a school that changes its fee creates a NEW version of
 * the same key. The one in effect is the latest-starting active version — the figure the
 * organisation would charge today, and therefore the one a document generated today must show.
 */
export function currentTemplateFor(templates: readonly TemplateLike[], sourceKey: string): TemplateLike | null {
    const lineage = templates
        .filter((t) => t.template_key === sourceKey && t.is_active)
        .sort((a, b) => String(b.effective_start).localeCompare(String(a.effective_start)));
    return lineage[0] ?? null;
}

/** The pure half: which destinations resolve, given the configuration as it stands. */
export function resolveSuppliedValuesFromTemplates(
    schema: Pick<FormSchemaV1, "fields">,
    templates: readonly TemplateLike[],
): { values: Record<string, unknown>; resolutions: SuppliedValueResolution[] } {
    const values: Record<string, unknown> = {};
    const resolutions: SuppliedValueResolution[] = [];

    for (const field of configurationSuppliedFields(schema)) {
        const supplied = suppliedByOf(field)!;
        if (supplied.source_kind !== "charge_template") {
            resolutions.push({
                field_id: field.id,
                source_kind: supplied.source_kind,
                source_key: supplied.source_key,
                resolved: false,
                reason: `No resolver for configuration source "${supplied.source_kind}".`,
            });
            continue;
        }
        const template = currentTemplateFor(templates, supplied.source_key);
        if (!template || template.amount_cents === null || template.amount_cents === undefined) {
            resolutions.push({
                field_id: field.id,
                source_kind: supplied.source_kind,
                source_key: supplied.source_key,
                resolved: false,
                reason: template
                    ? `"${template.label}" has no fixed amount to supply.`
                    : `No active charge template named "${supplied.source_key}".`,
            });
            continue;
        }
        const display = formatMoneyFromCents(template.amount_cents);
        values[field.id] = display;
        resolutions.push({
            field_id: field.id,
            source_kind: supplied.source_kind,
            source_key: supplied.source_key,
            resolved: true,
            display,
            amount_cents: template.amount_cents,
        });
    }

    return { values, resolutions };
}

export async function resolveConfigurationSuppliedValues(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly schema: Pick<FormSchemaV1, "fields"> },
): Promise<{ values: Record<string, unknown>; resolutions: SuppliedValueResolution[] }> {
    if (configurationSuppliedFields(input.schema).length === 0) return { values: {}, resolutions: [] };
    let templates: TemplateLike[] = [];
    try {
        templates = (await listChargeTemplates(supabase, input.orgId)) as unknown as TemplateLike[];
    } catch {
        // Unreadable configuration is the same as unresolved: the destination stays empty.
        templates = [];
    }
    return resolveSuppliedValuesFromTemplates(input.schema, templates);
}
