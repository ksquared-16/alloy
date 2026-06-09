/**
 * Layout visibleWhen evaluation — shared by preview and production drawer renderers.
 */

import type { LayoutCondition } from "../layoutV2";
import type { ProofRuntimeRecord } from "./proofRecordContext";

function readPath(record: ProofRuntimeRecord, path: string): unknown {
    const key = path.trim();
    if (!key) return undefined;
    if (key in record) return record[key];
    return undefined;
}

function isPlaceholderDisplay(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length === 0 || trimmed === "—" || trimmed === "-" || trimmed === "–";
}

function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return isPlaceholderDisplay(value);
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/** True when a layout condition passes for the given record (no condition → always visible). */
export function evaluateLayoutCondition(
    record: ProofRuntimeRecord,
    condition: LayoutCondition | undefined,
): boolean {
    if (!condition) return true;
    const raw = readPath(record, condition.path);
    if (condition.type === "exists") return !isEmptyValue(raw);
    if (condition.type === "equals") return String(raw ?? "") === String(condition.value ?? "");
    return true;
}
