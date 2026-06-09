/**
 * Resolve inquiry-child placement cascade context for enrollment row edits.
 * Reads draft first, then row scalars, then opportunity anchor location.
 */

import type { InquiryChildNativeOcmFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";
import { layoutRefKeyForInquiryChildOcmField } from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function readTrimmed(value: unknown): string {
    if (value == null) return "";
    const text = String(value).trim();
    return text;
}

function readRowPlacementScalar(row: ProofRuntimeRecord, ocmKey: InquiryChildNativeOcmFieldKey): string {
    const refKey = layoutRefKeyForInquiryChildOcmField(ocmKey);
    return readTrimmed(row[refKey]) || readTrimmed(row[ocmKey]);
}

function readAnchorLocationId(anchorRecord: ProofRuntimeRecord): string {
    return (
        readTrimmed(anchorRecord.location_id)
        || readTrimmed(anchorRecord._location_id)
        || readTrimmed(anchorRecord["opportunity.location_id"])
    );
}

export function resolveLayoutRuntimeEnrollmentPlacementContext(
    row: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string,
    rowKey: string,
): { locationId: string; programKey: string } {
    const readDraftOrRow = (ocmKey: InquiryChildNativeOcmFieldKey): string => {
        const refKey = layoutRefKeyForInquiryChildOcmField(ocmKey);
        const draft = getFieldValue(refKey, "", rowKey).trim();
        if (draft) return draft;
        return readRowPlacementScalar(row, ocmKey);
    };

    let locationId = readDraftOrRow("location_id");
    if (!locationId) {
        locationId = readAnchorLocationId(anchorRecord);
    }

    const programKey = readDraftOrRow("desired_program_type");

    return { locationId, programKey };
}

export function layoutRuntimeEnrollmentPlacementDependentValueReader(
    row: ProofRuntimeRecord,
    anchorRecord: ProofRuntimeRecord,
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string,
    rowKey: string,
): (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => string {
    const ctx = resolveLayoutRuntimeEnrollmentPlacementContext(row, anchorRecord, getFieldValue, rowKey);
    return (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => {
        if (dependsOnOcmKey === "location_id") return ctx.locationId;
        if (dependsOnOcmKey === "desired_program_type") return ctx.programKey;
        const refKey = layoutRefKeyForInquiryChildOcmField(dependsOnOcmKey);
        const draft = getFieldValue(refKey, "", rowKey).trim();
        if (draft) return draft;
        return readRowPlacementScalar(row, dependsOnOcmKey);
    };
}
