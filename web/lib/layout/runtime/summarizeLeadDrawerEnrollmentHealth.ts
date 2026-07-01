/**
 * Enrollment Health summary for lead summary strip (layout widget key: children_list).
 *
 * Derived from repeater row fields already on the layout runtime record — not hardcoded field content.
 */

import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const CHILDREN_REPEATER_ITEM = {
    id: "children",
    kind: "related_list" as const,
    source: "children",
    refKey: "children",
};

function readTrimmed(row: ProofRuntimeRecord, ...keys: string[]): string {
    for (const key of keys) {
        const raw = row[key];
        if (raw == null) continue;
        const text = String(raw).trim();
        if (text && text !== "—") return text;
    }
    return "";
}

function readRowStatus(row: ProofRuntimeRecord): string {
    return readTrimmed(row, "child.status", "inquiry_child.outcome_status_key", "outcome_status_key");
}

function statusMatchesWaitlisted(status: string): boolean {
    return /waitlist/i.test(status);
}

function statusMatchesActive(status: string): boolean {
    return /active|inquir|enrolled|qualified|accepted|confirmed/i.test(status);
}

function rowMissingEnrollmentInfo(row: ProofRuntimeRecord): boolean {
    const program = readTrimmed(row, "child.program", "inquiry_child.desired_program_type", "desired_program_type");
    const start = readTrimmed(row, "child.desired_start_date", "inquiry_child.desired_start_date", "desired_start_date");
    const status = readRowStatus(row);
    return !program || !start || !status;
}

function parseSortableDate(raw: string): number | null {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
}

export type LeadDrawerEnrollmentHealthSummary = {
    childCount: number;
    activeCount: number;
    waitlistedCount: number;
    missingInfoCount: number;
    latestDesiredStart: string | null;
    headline: string;
    detailLine: string | null;
};

export function summarizeLeadDrawerEnrollmentHealth(record: ProofRuntimeRecord): LeadDrawerEnrollmentHealthSummary {
    const rows = readLayoutRuntimeRepeaterRows(record, CHILDREN_REPEATER_ITEM);
    const childCount = rows.length;

    if (childCount === 0) {
        return {
            childCount: 0,
            activeCount: 0,
            waitlistedCount: 0,
            missingInfoCount: 0,
            latestDesiredStart: null,
            headline: "No children linked",
            detailLine: "Add child enrollment details",
        };
    }

    let activeCount = 0;
    let waitlistedCount = 0;
    let missingInfoCount = 0;
    let latestDesiredStart: string | null = null;
    let latestDesiredStartTs = -Infinity;

    for (const row of rows) {
        const status = readRowStatus(row);
        if (statusMatchesWaitlisted(status)) waitlistedCount += 1;
        else if (statusMatchesActive(status)) activeCount += 1;
        if (rowMissingEnrollmentInfo(row)) missingInfoCount += 1;

        const startRaw = readTrimmed(row, "child.desired_start_date", "inquiry_child.desired_start_date", "desired_start_date");
        if (startRaw) {
            const ts = parseSortableDate(startRaw);
            if (ts != null && ts >= latestDesiredStartTs) {
                latestDesiredStartTs = ts;
                latestDesiredStart = startRaw;
            } else if (ts == null && !latestDesiredStart) {
                latestDesiredStart = startRaw;
            }
        }
    }

    const parts: string[] = [`${childCount} ${childCount === 1 ? "child" : "children"}`];
    if (activeCount > 0) parts.push(`${activeCount} active`);
    if (waitlistedCount > 0) parts.push(`${waitlistedCount} waitlisted`);
    if (missingInfoCount > 0) parts.push(`${missingInfoCount} missing info`);

    const detailLine =
        latestDesiredStart ?
            `Latest start · ${formatLayoutRuntimeOperatorDate(latestDesiredStart) || latestDesiredStart}`
        : missingInfoCount > 0 ? "Complete program and start details"
        :   null;

    return {
        childCount,
        activeCount,
        waitlistedCount,
        missingInfoCount,
        latestDesiredStart,
        headline: parts.join(" · "),
        detailLine,
    };
}

export const LEAD_ENROLLMENT_SECTION_SELECTOR = '[data-layout-runtime-section-key="children_enrollment"]';

export function scrollToLeadEnrollmentSection(): void {
    if (typeof document === "undefined") return;
    document.querySelector(LEAD_ENROLLMENT_SECTION_SELECTOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
