import { formatAgeFromDateOfBirthIso } from "@/lib/fields/derived/ageFromDateOfBirth";
import {
    readLayoutEditorDisplayConfig,
    type LayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function isLayoutRuntimeAgeRefKey(refKey: string | undefined): boolean {
    const key = refKey?.trim() ?? "";
    return key === "child.dob_age" || key.endsWith(".dob_age");
}

function readDobIsoFromRecord(record: ProofRuntimeRecord): string {
    const direct = record["child.date_of_birth"] ?? record["dob"];
    if (direct != null && String(direct).trim()) return String(direct).slice(0, 10);
    return "";
}

/** Derive formatted age from DOB on a runtime row — never reads stale stored age. */
export function resolveLayoutRuntimeAgeDisplayFromRecord(
    record: ProofRuntimeRecord,
    displayConfig?: LayoutEditorDisplayConfig,
): string | null {
    const dob = readDobIsoFromRecord(record);
    if (!dob) return null;
    const format = displayConfig?.ageFormat ?? "years_months";
    return formatAgeFromDateOfBirthIso(dob, format);
}

export function formatLayoutRuntimeAgeRefKeyDisplay(
    refKey: string,
    record: ProofRuntimeRecord,
    displayConfigSource?: { metadata?: Record<string, unknown> },
): string | null {
    if (!isLayoutRuntimeAgeRefKey(refKey)) return null;
    const displayConfig = readLayoutEditorDisplayConfig(displayConfigSource ?? {});
    return resolveLayoutRuntimeAgeDisplayFromRecord(record, displayConfig);
}
