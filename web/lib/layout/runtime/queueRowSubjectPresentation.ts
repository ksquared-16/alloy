/**
 * Case-grain queue row subject line — hide duplicate household labels until child-grain rows ship.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

export function normalizeQueueRowLabelForCompare(label: string): string {
    return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when subject focus line would duplicate the case/household identity line. */
export function shouldSuppressDuplicateCaseSubjectLabel(
    caseLabel: string | null | undefined,
    subjectLabel: string | null | undefined,
): boolean {
    const caseNorm = normalizeQueueRowLabelForCompare(caseLabel ?? "");
    const subjectNorm = normalizeQueueRowLabelForCompare(subjectLabel ?? "");
    if (!caseNorm || !subjectNorm) return false;
    return caseNorm === subjectNorm;
}

export function readQueueRowCaseDisplayLabel(record: ProofRuntimeRecord): string | null {
    const r = record as Record<string, unknown>;
    return (
        trimOrNull(r["customer.display_name"])
        ?? trimOrNull(r["customer.name"])
        ?? trimOrNull(r.name)
        ?? trimOrNull(r["opportunity.title"])
    );
}

/** Remove `queue_row.subject_label` when it duplicates the case name on the row record. */
export function suppressDuplicateQueueRowSubjectOnRecord(record: ProofRuntimeRecord): ProofRuntimeRecord {
    const mutable = record as Record<string, unknown>;
    const subject = trimOrNull(mutable["queue_row.subject_label"]);
    if (!subject) {
        if ("queue_row.subject_label" in mutable) {
            delete mutable["queue_row.subject_label"];
        }
        return record;
    }

    const caseLabel = readQueueRowCaseDisplayLabel(record);
    if (shouldSuppressDuplicateCaseSubjectLabel(caseLabel, subject)) {
        delete mutable["queue_row.subject_label"];
    }
    return record;
}

export function isQueueRowSubjectFieldVisible(record: ProofRuntimeRecord, fieldKey: string): boolean {
    if (fieldKey !== "queue_row.subject_label") return true;
    const subject = trimOrNull((record as Record<string, unknown>)["queue_row.subject_label"]);
    if (!subject) return false;
    return !shouldSuppressDuplicateCaseSubjectLabel(readQueueRowCaseDisplayLabel(record), subject);
}
