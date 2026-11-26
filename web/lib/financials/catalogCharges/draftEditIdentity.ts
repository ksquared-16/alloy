/**
 * WHICH CHARGE DEFINITION AN EXISTING DRAFT IS EDITED UNDER — by the identity it recorded, never by name.
 *
 * Manual Add Charge now offers the Catalog, but drafts written from charge templates still exist and
 * must keep being what they are. Two authorities can carry the same name ("Registration fee" as a
 * template and "Registration fee" as a catalog item), so a name proves nothing: matching on it would
 * silently turn a historical template draft into a catalog charge at a different price and account.
 *
 *   template draft → its own template (by id), else the version of the same `template_key` in force now
 *                    (the W7-F017 supersede contract), else not editable. Never a catalog item.
 *   catalog draft  → its own catalog item (by id), and only while that item is chargeable here.
 *   neither        → not editable here.
 */

export type DraftIdentityFacts = {
    chargeTemplateId: string | null;
    chargeTemplateKey: string | null;
    catalogProductId: string | null;
};

export type DraftEditOption = {
    id: string;
    label: string;
    templateKey?: string;
    availability?: "offerable" | "unsupported" | "blocked";
};

export type DraftEditIdentity = { id: string; label: string; source: "catalog" | "template" };

export function resolveDraftEditIdentity(
    facts: DraftIdentityFacts,
    pools: { draftTemplates: readonly DraftEditOption[]; catalogOptions: readonly DraftEditOption[] },
): DraftEditIdentity | null {
    if (facts.chargeTemplateId) {
        const tpl =
            pools.draftTemplates.find((x) => x.id === facts.chargeTemplateId)
            ?? (facts.chargeTemplateKey
                ? pools.draftTemplates.find((x) => x.templateKey === facts.chargeTemplateKey)
                : undefined);
        return tpl ? { id: tpl.id, label: tpl.label, source: "template" } : null;
    }
    if (facts.catalogProductId) {
        const opt = pools.catalogOptions.find(
            (x) => x.id === facts.catalogProductId && (x.availability ?? "offerable") === "offerable",
        );
        return opt ? { id: opt.id, label: opt.label, source: "catalog" } : null;
    }
    return null;
}

/** The identity a charge recorded about itself, read from its row — the input to the rule above. */
export function draftIdentityFromCharge(charge: {
    charge_template_id?: string | null;
    metadata?: Record<string, unknown> | null;
}): DraftIdentityFacts {
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const metadata = charge.metadata ?? {};
    const catalogItem = metadata.catalog_item as Record<string, unknown> | undefined;
    return {
        chargeTemplateId: str(charge.charge_template_id) || null,
        chargeTemplateKey: str(metadata.charge_template_key) || null,
        catalogProductId: str(catalogItem?.product_id) || null,
    };
}
