/**
 * Backfill person_id / customer_member_id on layout-runtime child repeater rows.
 *
 * First loss point: mapCrmChildLine / mapStructuredChildLine emit child.name with empty
 * person_id when queue preview lines lack personId. readLayoutRuntimeRepeaterRows then
 * accepts those rows via normalizeLayoutRuntimeChildRow (flat name path) and never reads
 * _inquiry_children on the anchor record.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { isSyntheticLayoutRuntimeRowId } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { normalizeInquiryChildBlockToLayoutRuntimeRow } from "@/lib/layout/runtime/normalizeLayoutRuntimeChildRow";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trim(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

function acceptPersonId(value: string, memberId?: string): string {
    if (!value || isSyntheticLayoutRuntimeRowId(value)) return "";
    if (memberId && value === memberId) return "";
    return value;
}

function childDisplayName(row: ProofRuntimeRecord): string {
    return trim(row["child.name"] ?? row["child.display_name"] ?? "");
}

function normalizeNameKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function findRawInquiryRowMatch(
    row: ProofRuntimeRecord,
    inquiryRaw: unknown[],
    index: number,
): Record<string, unknown> | null {
    const objects = inquiryRaw.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
    if (objects.length === 0) return null;
    if (index >= 0 && index < objects.length) return objects[index] ?? null;

    const rowName = normalizeNameKey(childDisplayName(row));
    if (!rowName) return objects[0] ?? null;

    for (const inquiryRow of objects) {
        const candidates = [
            trim(inquiryRow.display_name),
            [trim(inquiryRow.first_name), trim(inquiryRow.last_name)].filter(Boolean).join(" "),
        ]
            .map(normalizeNameKey)
            .filter(Boolean);
        if (candidates.some((c) => c === rowName || rowName.includes(c) || c.includes(rowName))) {
            return inquiryRow;
        }
    }
    return objects[0] ?? null;
}

function layoutRuntimeRowFromRawInquiry(raw: Record<string, unknown>, index: number): ProofRuntimeRecord {
    const drawerRows = mapRawInquiryChildrenToDrawerRows([raw]);
    if (drawerRows.length > 0) {
        const normalized = normalizeInquiryChildBlockToLayoutRuntimeRow(drawerRows[0]!, index);
        normalized._layout_runtime_child_id_source = "anchor._inquiry_children";
        return normalized;
    }

    const personId = acceptPersonId(trim(raw.person_id), trim(raw.customer_member_id));
    const memberId = trim(raw.customer_member_id) || trim(raw.ocm_id) || "";
    const first = trim(raw.first_name);
    const last = trim(raw.last_name);
    const name = trim(raw.display_name) || [first, last].filter(Boolean).join(" ") || childDisplayName({} as ProofRuntimeRecord);
    return {
        id: personId || memberId || `child-row-${index}`,
        person_id: personId,
        customer_member_id: memberId,
        ocm_id: trim(raw.ocm_id) || trim(raw.id),
        "child.id": personId,
        "child.customer_member_id": memberId,
        "child.name": name,
        "child.display_name": name,
        "child.first_name": first,
        "child.last_name": last,
        _layout_runtime_child_id_source: "anchor._inquiry_children",
    };
}

function findInquiryRowMatch(
    row: ProofRuntimeRecord,
    inquiryRows: ReturnType<typeof mapRawInquiryChildrenToDrawerRows>,
    index: number,
): ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number] | null {
    if (inquiryRows.length === 0) return null;
    if (index >= 0 && index < inquiryRows.length) return inquiryRows[index] ?? null;

    const rowName = normalizeNameKey(childDisplayName(row));
    if (!rowName) return inquiryRows[0] ?? null;

    for (const inquiryRow of inquiryRows) {
        const candidates = [
            trim(inquiryRow.display_name),
            [trim(inquiryRow.first_name), trim(inquiryRow.last_name)].filter(Boolean).join(" "),
        ]
            .map(normalizeNameKey)
            .filter(Boolean);
        if (candidates.some((c) => c === rowName || rowName.includes(c) || c.includes(rowName))) {
            return inquiryRow;
        }
    }
    return inquiryRows[0] ?? null;
}

function mergeChildRowPreserveDisplay(
    displayRow: ProofRuntimeRecord,
    idRow: ProofRuntimeRecord,
): ProofRuntimeRecord {
    const personId = acceptPersonId(trim(idRow.person_id) || trim(idRow["child.id"]), trim(idRow.customer_member_id));
    const memberId = trim(idRow.customer_member_id) || trim(idRow["child.customer_member_id"]);
    const ocmId = trim(idRow.ocm_id);
    return {
        ...displayRow,
        ...idRow,
        "child.name": displayRow["child.name"] ?? idRow["child.name"],
        "child.display_name": displayRow["child.display_name"] ?? idRow["child.display_name"],
        "child.first_name": displayRow["child.first_name"] ?? idRow["child.first_name"],
        "child.last_name": displayRow["child.last_name"] ?? idRow["child.last_name"],
        "child.program": displayRow["child.program"] ?? idRow["child.program"],
        "child.status": displayRow["child.status"] ?? idRow["child.status"],
        "child.date_of_birth": idRow["child.date_of_birth"] ?? displayRow["child.date_of_birth"] ?? "",
        "child.age_band": displayRow["child.age_band"] ?? idRow["child.age_band"],
        person_id: personId,
        "child.id": personId,
        customer_member_id: memberId,
        "child.customer_member_id": memberId,
        ocm_id: ocmId || trim(displayRow.ocm_id),
        id: personId || memberId || ocmId || trim(displayRow.id) || trim(idRow.id),
        _layout_runtime_child_id_source: idRow._layout_runtime_child_id_source,
    };
}

export type EnrichLayoutRuntimeChildRowOpts = {
    index: number;
    inquiryChildren?: unknown;
    primaryChildPersonId?: string | null;
    totalChildCount?: number;
};

export type EnrichLayoutRuntimeChildRowResult = {
    row: ProofRuntimeRecord;
    mapperSource: string;
};

/** Ensure every rendered child row carries person_id and/or customer_member_id when upstream data allows. */
export function enrichLayoutRuntimeChildRowIdentifiers(
    row: ProofRuntimeRecord,
    opts: EnrichLayoutRuntimeChildRowOpts,
): EnrichLayoutRuntimeChildRowResult {
    const memberId = trim(row.customer_member_id) || trim(row["child.customer_member_id"]);
    const personId = acceptPersonId(trim(row.person_id) || trim(row["child.id"]), memberId);

    if (personId) {
        const idSource = trim(row._layout_runtime_child_id_source);
        const mapperSource =
            idSource === "anchor._inquiry_children" || idSource === "anchor.primaryChildPersonId"
                ? idSource
                :   "row.person_id";
        return {
            row: {
                ...row,
                person_id: personId,
                "child.id": personId,
                customer_member_id: memberId,
                "child.customer_member_id": memberId,
                _layout_runtime_child_id_source: mapperSource,
            },
            mapperSource,
        };
    }

    const inquiryRaw = Array.isArray(opts.inquiryChildren) ? opts.inquiryChildren : [];
    if (memberId && !personId) {
        const inquiryRows = mapRawInquiryChildrenToDrawerRows(inquiryRaw);
        const inquiryMatch = findInquiryRowMatch(row, inquiryRows, opts.index)
            ?? findRawInquiryRowMatch(row, inquiryRaw, opts.index);
        if (inquiryMatch) {
            const normalized =
                typeof inquiryMatch === "object" && inquiryMatch != null && "person_id" in inquiryMatch
                    ? layoutRuntimeRowFromRawInquiry(inquiryMatch as Record<string, unknown>, opts.index)
                    : normalizeInquiryChildBlockToLayoutRuntimeRow(
                          inquiryMatch as ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number],
                          opts.index,
                      );
            normalized._layout_runtime_child_id_source = "anchor._inquiry_children";
            const merged = mergeChildRowPreserveDisplay(row, normalized);
            const mergedPersonId = acceptPersonId(trim(merged.person_id) || trim(merged["child.id"]), memberId);
            const mergedMemberId = trim(merged.customer_member_id) || trim(merged["child.customer_member_id"]) || memberId;
            if (mergedPersonId || mergedMemberId) {
                return {
                    row: merged,
                    mapperSource: mergedPersonId ? "anchor._inquiry_children" : "row.customer_member_id",
                };
            }
        }
        return {
            row: {
                ...row,
                customer_member_id: memberId,
                "child.customer_member_id": memberId,
                _layout_runtime_child_id_source: "row.customer_member_id",
            },
            mapperSource: "row.customer_member_id",
        };
    }

    if (inquiryRaw.length > 0) {
        const inquiryRows = mapRawInquiryChildrenToDrawerRows(inquiryRaw);
        const inquiryMatch = findInquiryRowMatch(row, inquiryRows, opts.index);
        if (inquiryMatch) {
            const normalized = normalizeInquiryChildBlockToLayoutRuntimeRow(inquiryMatch, opts.index);
            normalized._layout_runtime_child_id_source = "anchor._inquiry_children";
            const merged = mergeChildRowPreserveDisplay(row, normalized);
            const mergedPersonId = acceptPersonId(trim(merged.person_id) || trim(merged["child.id"]), memberId);
            const mergedMemberId = trim(merged.customer_member_id) || trim(merged["child.customer_member_id"]);
            if (mergedPersonId || mergedMemberId) {
                return { row: merged, mapperSource: "anchor._inquiry_children" };
            }
        }

        const rawMatch = findRawInquiryRowMatch(row, inquiryRaw, opts.index);
        if (rawMatch) {
            const normalized = layoutRuntimeRowFromRawInquiry(rawMatch, opts.index);
            const merged = mergeChildRowPreserveDisplay(row, normalized);
            const mergedPersonId = acceptPersonId(trim(merged.person_id) || trim(merged["child.id"]), memberId);
            const mergedMemberId = trim(merged.customer_member_id) || trim(merged["child.customer_member_id"]);
            if (mergedPersonId || mergedMemberId) {
                return { row: merged, mapperSource: "anchor._inquiry_children" };
            }
        }
    }

    const primaryChildPersonId = trim(opts.primaryChildPersonId);
    if (primaryChildPersonId && (opts.totalChildCount ?? 1) <= 1) {
        return {
            row: {
                ...row,
                person_id: primaryChildPersonId,
                "child.id": primaryChildPersonId,
                _layout_runtime_child_id_source: "anchor.primaryChildPersonId",
            },
            mapperSource: "anchor.primaryChildPersonId",
        };
    }

    return {
        row: {
            ...row,
            _layout_runtime_child_id_source: trim(row._layout_runtime_child_id_source) || "missing_all_ids",
        },
        mapperSource: "missing_all_ids",
    };
}

export type EnrichLayoutRuntimeChildRowsFromAnchorOpts = {
    collectionKey?: string;
};

export function enrichLayoutRuntimeChildRowsFromAnchor(
    rows: ProofRuntimeRecord[],
    anchor: Record<string, unknown>,
    opts?: EnrichLayoutRuntimeChildRowsFromAnchorOpts,
): ProofRuntimeRecord[] {
    const inquiryChildren =
        anchor._inquiry_children
        ?? anchor._crm_compact_children
        ?? (anchor.metadata && typeof anchor.metadata === "object"
            ? (anchor.metadata as Record<string, unknown>).inquiry_children
            : undefined);
    const primaryChildPersonId =
        trim(anchor._primary_child_person_id)
        || trim(anchor.primary_child_person_id);
    const collectionKey = trim(opts?.collectionKey) || "children";

    return rows.map((row, index) => {
        const enriched = enrichLayoutRuntimeChildRowIdentifiers(row, {
            index,
            inquiryChildren,
            primaryChildPersonId,
            totalChildCount: rows.length,
        });
        return {
            ...enriched.row,
            _layout_runtime_child_collection_key: collectionKey,
            _layout_runtime_child_mapper_source: enriched.mapperSource,
        };
    });
}

export function summarizeLayoutRuntimeChildRowForDebug(row: ProofRuntimeRecord) {
    const summary = {
        id: row.id != null ? String(row.id) : null,
        "child.id": row["child.id"] != null ? String(row["child.id"]) : null,
        person_id: row.person_id != null ? String(row.person_id) : null,
        customer_member_id: row.customer_member_id != null ? String(row.customer_member_id) : null,
        ocm_id: row.ocm_id != null ? String(row.ocm_id) : null,
        display_name:
            row["child.display_name"] != null
                ? String(row["child.display_name"])
                : row["child.name"] != null
                  ? String(row["child.name"])
                  : null,
        first_name: row["child.first_name"] != null ? String(row["child.first_name"]) : null,
        last_name: row["child.last_name"] != null ? String(row["child.last_name"]) : null,
        mapperSource:
            row._layout_runtime_child_mapper_source != null
                ? String(row._layout_runtime_child_mapper_source)
                : row._layout_runtime_child_id_source != null
                  ? String(row._layout_runtime_child_id_source)
                  : null,
        collectionKey:
            row._layout_runtime_child_collection_key != null
                ? String(row._layout_runtime_child_collection_key)
                : null,
    };
    return {
        ...summary,
        rowJson: JSON.stringify(summary),
    };
}
