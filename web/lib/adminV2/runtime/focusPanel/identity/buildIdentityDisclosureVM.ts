/**
 * Project IdentityCardVM into disclosure-depth views for runtime and builder preview.
 */

import { composeContextFactsIntoDetails } from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import type {
    IdentityCardVM,
    IdentityDisclosureDepth,
    IdentityDisclosureVM,
    IdentityRecordVM,
    IdentitySectionVM,
    IdentityFieldRowVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

export function buildIdentityDisclosureVM(args: {
    card: IdentityCardVM;
    depth: IdentityDisclosureDepth;
    focusedRecordId?: string | null;
}): IdentityDisclosureVM {
    return {
        surfaceKey: args.card.surfaceKey,
        depth: args.depth,
        focusedRecordId: args.focusedRecordId ?? null,
        sections: args.card.sections.map((section) => projectSectionForDepth(section, args.depth, args.focusedRecordId)),
    };
}

function projectSectionForDepth(
    section: IdentitySectionVM,
    depth: IdentityDisclosureDepth,
    focusedRecordId?: string | null,
): IdentitySectionVM {
    return {
        ...section,
        items: section.items.map((record) => projectRecordForDepth(record, depth, focusedRecordId)),
    };
}

function projectRecordForDepth(
    record: IdentityRecordVM,
    depth: IdentityDisclosureDepth,
    focusedRecordId?: string | null,
): IdentityRecordVM {
    if (depth === "evidence" && focusedRecordId && record.id !== focusedRecordId) {
        return {
            ...record,
            summaryRows: [],
            contextFactRows: [],
            contextRows: [],
            detailRows: [],
            detailsRows: [],
            expandedRows: [],
        };
    }
    return record;
}

export type IdentityRowsForDepth = {
    visibleRows: IdentityFieldRowVM[];
    detailRows: IdentityFieldRowVM[];
};

/** Rows visible at a given disclosure depth — Context uses Context Facts only; Details inherits context + detail-only fields. */
export function identityRowsForDisclosureDepth(
    record: IdentityRecordVM,
    depth: IdentityDisclosureDepth,
): IdentityRowsForDepth {
    const rawDetailRows = record.detailRows.length > 0 ? record.detailRows : record.detailsRows;
    switch (depth) {
        case "summary":
            return { visibleRows: record.summaryRows, detailRows: [] };
        case "context":
            return { visibleRows: record.contextRows, detailRows: [] };
        case "details":
        case "evidence": {
            const { leadingRows, detailOnlyRows } = composeContextFactsIntoDetails(
                record.contextFactRows,
                rawDetailRows,
            );
            /*
             * DETAILS IS A SUPERSET OF SUMMARY. It must never show FEWER facts.
             *
             * The two deeper layers can both be empty and legitimately so: `defaultDisclosureLayerForField`
             * assigns every `children_surface` identity field to the SUMMARY layer, so a tenant that
             * has never opened the Surface Builder has an identity group with nothing in Context
             * Facts and nothing in Details. Opening a child then produced a record surface with a
             * name, an avatar and no facts at all — the card composed, elevated and selected the
             * child, and then had nothing to say about them.
             *
             * That is the same shape `effectiveChildrenNestedConfig` already refuses one layer up:
             * the platform must not ship a card whose normal interaction is impossible until an
             * operator configures something. Configuration DEEPENS the default here; it is not a
             * precondition for the depth existing.
             *
             * Only reached when both deeper layers are empty, so a configured surface is untouched —
             * this can add rows where there were none and can never remove or reorder one.
             */
            if (leadingRows.length === 0 && detailOnlyRows.length === 0) {
                return { visibleRows: record.summaryRows, detailRows: [] };
            }
            return { visibleRows: leadingRows, detailRows: detailOnlyRows };
        }
    }
}
