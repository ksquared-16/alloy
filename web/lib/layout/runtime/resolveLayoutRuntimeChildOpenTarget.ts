/**
 * Resolve child drawer open target from layout-runtime repeater rows.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { resolveInquiryChildOpenPersonId } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { resolveLayoutRuntimeIdPath } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import { inferLayoutAdornmentIdPath } from "@/lib/layout/inferLayoutAdornmentIdPath";
import { isSyntheticLayoutRuntimeRowId } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function acceptPersonId(value: string | null, customerMemberId?: string | null): string | null {
    if (!value || isSyntheticLayoutRuntimeRowId(value)) return null;
    if (customerMemberId && value === customerMemberId) return null;
    return value;
}

function inquiryChildrenOnRecord(record: ProofRuntimeRecord | undefined): ReturnType<typeof mapRawInquiryChildrenToDrawerRows> {
    if (!record) return [];
    const raw = record._inquiry_children ?? record.inquiry_children;
    if (!Array.isArray(raw)) return [];
    return mapRawInquiryChildrenToDrawerRows(raw);
}

function personIdFromAnchorChildCollections(
    anchorRecord: ProofRuntimeRecord | undefined,
    row: ProofRuntimeRecord,
): string | null {
    if (!anchorRecord) return null;
    const memberId =
        trimId(row.customer_member_id)
        ?? trimId(row["child.customer_member_id"]);
    const ocmId = trimId(row.ocm_id);
    const rowId = trimId(row.id);

    for (const key of ["children", "enrollment_children"] as const) {
        const raw = anchorRecord[key];
        if (!Array.isArray(raw)) continue;
        for (const entry of raw) {
            if (!entry || typeof entry !== "object") continue;
            const rec = entry as Record<string, unknown>;
            const entryMemberId =
                trimId(rec.customer_member_id)
                ?? trimId(rec["child.customer_member_id"]);
            const entryOcmId = trimId(rec.ocm_id);
            const entryId = trimId(rec.id);
            const entryPersonId = acceptPersonId(
                trimId(rec.person_id) ?? trimId(rec["child.id"]),
                memberId ?? entryMemberId,
            );

            const matches =
                (memberId && entryMemberId && memberId === entryMemberId)
                || (ocmId && (entryOcmId === ocmId || entryId === ocmId))
                || (rowId && !isSyntheticLayoutRuntimeRowId(rowId) && entryId === rowId)
                || (entryPersonId && entryPersonId === trimId(row.person_id));

            if (!matches) continue;
            if (entryPersonId) return entryPersonId;

            const mergedRow = {
                ...row,
                customer_member_id: memberId ?? entryMemberId ?? row.customer_member_id,
                ocm_id: ocmId ?? entryOcmId ?? row.ocm_id,
            };
            const fromInquiry = personIdFromInquiryChildren(anchorRecord, mergedRow);
            if (fromInquiry) return fromInquiry;
        }
    }

    return null;
}

function normalizeChildNameKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function childDisplayNameFromRow(row: ProofRuntimeRecord): string {
    return trimId(row["child.name"]) ?? trimId(row["child.display_name"]) ?? "";
}

function personIdFromInquiryChildren(
    anchorRecord: ProofRuntimeRecord | undefined,
    row: ProofRuntimeRecord,
): string | null {
    const inquiryRows = inquiryChildrenOnRecord(anchorRecord);
    if (inquiryRows.length === 0) return null;

    const personId = trimId(row.person_id) ?? trimId(row["child.id"]);
    const memberId =
        trimId(row.customer_member_id)
        ?? trimId(row["child.customer_member_id"])
        ?? trimId(row.ocm_id);
    const rowId = trimId(row.id);
    const rowName = normalizeChildNameKey(childDisplayNameFromRow(row));

    const match =
        (personId ? inquiryRows.find((r) => trimId(r.person_id) === personId) : null)
        ?? (memberId ? inquiryRows.find((r) => trimId(r.customer_member_id) === memberId) : null)
        ?? (rowId && !isSyntheticLayoutRuntimeRowId(rowId) ?
            inquiryRows.find((r) => trimId(r.id) === rowId || trimId(r.ocm_id) === rowId)
        :   null)
        ?? (rowName
            ? inquiryRows.find((r) => {
                  const candidates = [
                      trimId(r.display_name),
                      [trimId(r.first_name), trimId(r.last_name)].filter(Boolean).join(" "),
                  ]
                      .filter((c): c is string => Boolean(c))
                      .map(normalizeChildNameKey);
                  return candidates.some(
                      (c) => c === rowName || rowName.includes(c) || c.includes(rowName),
                  );
              })
            :   null);

    if (!match) return null;
    return acceptPersonId(
        resolveInquiryChildOpenPersonId(anchorRecord as Record<string, unknown>, match),
        memberId,
    );
}

export type LayoutRuntimeChildOpenTarget = {
    personId: string | null;
    customerMemberId: string | null;
    rowId: string | null;
    ocmId: string | null;
    resolvedFrom: string | null;
};

/** Resolve person id + member ids for child open_drawer from one repeater row. */
export function resolveLayoutRuntimeChildOpenTarget(
    row: ProofRuntimeRecord,
    opts?: {
        idPath?: string;
        refKey?: string;
        anchorRecord?: ProofRuntimeRecord;
    },
): LayoutRuntimeChildOpenTarget {
    const customerMemberId =
        trimId(row.customer_member_id)
        ?? trimId(row["child.customer_member_id"]);
    const ocmId = trimId(row.ocm_id);
    const rowId = trimId(row.id);

    const explicitPaths = [
        opts?.idPath,
        opts?.idPath ? undefined : inferLayoutAdornmentIdPath("child", opts?.refKey),
        "child.id",
        "person_id",
    ].filter((p): p is string => Boolean(p?.trim()));

    for (const path of explicitPaths) {
        const resolved = acceptPersonId(resolveLayoutRuntimeIdPath(row, path), customerMemberId);
        if (resolved) {
            return {
                personId: resolved,
                customerMemberId,
                rowId,
                ocmId,
                resolvedFrom: path,
            };
        }
    }

    const fromAnchorChildren = personIdFromAnchorChildCollections(opts?.anchorRecord, row);
    if (fromAnchorChildren) {
        return {
            personId: fromAnchorChildren,
            customerMemberId,
            rowId,
            ocmId,
            resolvedFrom: "anchor.children.person_id",
        };
    }

    const fromInquiry = personIdFromInquiryChildren(opts?.anchorRecord, row);
    if (fromInquiry) {
        return {
            personId: fromInquiry,
            customerMemberId,
            rowId,
            ocmId,
            resolvedFrom: "_inquiry_children.person_id",
        };
    }

    return {
        personId: null,
        customerMemberId,
        rowId,
        ocmId,
        resolvedFrom: null,
    };
}

/** Person id suitable for child drawer open — never synthetic row fallback ids. */
export function resolveLayoutRuntimeChildPersonId(
    row: ProofRuntimeRecord,
    idPath?: string,
    refKey?: string,
    anchorRecord?: ProofRuntimeRecord,
): string | null {
    return resolveLayoutRuntimeChildOpenTarget(row, { idPath, refKey, anchorRecord }).personId;
}
