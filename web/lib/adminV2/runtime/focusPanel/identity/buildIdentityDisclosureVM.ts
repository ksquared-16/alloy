/**
 * Project IdentityCardVM into disclosure-depth views for runtime and builder preview.
 */

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

/** Rows visible at a given disclosure depth — Context uses composed projection. */
export function identityRowsForDisclosureDepth(
    record: IdentityRecordVM,
    depth: IdentityDisclosureDepth,
): IdentityRowsForDepth {
    const detailRows = record.detailRows.length > 0 ? record.detailRows : record.detailsRows;
    switch (depth) {
        case "summary":
            return { visibleRows: record.summaryRows, detailRows: [] };
        case "context":
            return { visibleRows: record.contextRows, detailRows: [] };
        case "details":
        case "evidence":
            return { visibleRows: record.contextRows, detailRows };
    }
}
