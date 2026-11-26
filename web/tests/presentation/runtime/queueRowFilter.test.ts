/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import type { QueueRowModel } from "@/lib/presentation/runtime/types";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    applyQueueRowFilters,
    deriveQueueRowFilterFacets,
    queueRowFilterIsActive,
    queueRowFilterAdvancedActiveCount,
    EMPTY_QUEUE_ROW_FILTER,
    type QueueRowFilterState,
} from "@/lib/presentation/runtime/queueRowFilter";

function row(over: {
    id: string;
    subject: string;
    statusKey?: string;
    statusLabel?: string;
    stage?: string;
    site?: string;
    program?: string;
    needsAttention?: boolean;
    attentionReason?: string | null;
    contact?: string;
}): QueueRowModel {
    const ctx = {
        row_subject: { subject_type: "case", subject_id: over.id, display_name: over.subject },
        case_context: { display_name: over.subject },
        primary_contact: over.contact ? { display_name: over.contact } : null,
        row_stage: over.stage ?? "New Leads",
        row_status_key: over.statusKey ?? "open",
        row_status_label: over.statusLabel ?? "Active",
        placement_context: over.site || over.program
            ? { location_id: null, location_label: over.site ?? null, program_label: over.program ?? null }
            : null,
        attention_summary:
            over.needsAttention || over.attentionReason
                ? { needs_attention: !!over.needsAttention, primary_reason_label: over.attentionReason ?? null }
                : null,
    } as unknown as QueueRowContext;
    return { context: ctx, entityType: "opportunity", entityId: over.id };
}

const rows: QueueRowModel[] = [
    row({ id: "a", subject: "Lyons", statusKey: "open", statusLabel: "Active", site: "Main", program: "Toddler", needsAttention: true, attentionReason: "Overdue tour" }),
    row({ id: "b", subject: "Alvarez", statusKey: "waitlisted", statusLabel: "Waitlisted", site: "West", program: "Infant" }),
    row({ id: "c", subject: "Chen", statusKey: "open", statusLabel: "Active", site: "Main", program: "Infant", contact: "Mia Chen" }),
];

describe("queue row filter — pure narrowing over loaded rows", () => {
    it("inactive filter + default sort returns rows in the SERVER order (unchanged)", () => {
        const out = applyQueueRowFilters(rows, EMPTY_QUEUE_ROW_FILTER);
        expect(out.map((r) => r.entityId)).toEqual(["a", "b", "c"]);
    });

    it("search matches subject / contact / status, case-insensitive", () => {
        const f = (search: string): QueueRowFilterState => ({ ...EMPTY_QUEUE_ROW_FILTER, search });
        expect(applyQueueRowFilters(rows, f("lyon")).map((r) => r.entityId)).toEqual(["a"]);
        expect(applyQueueRowFilters(rows, f("mia")).map((r) => r.entityId)).toEqual(["c"]); // contact
        expect(applyQueueRowFilters(rows, f("waitlisted")).map((r) => r.entityId)).toEqual(["b"]); // status label
    });

    it("status / site / program narrow by exact value", () => {
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, statusKey: "open" }).map((r) => r.entityId)).toEqual(["a", "c"]);
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, siteLabel: "West" }).map((r) => r.entityId)).toEqual(["b"]);
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, programLabel: "Infant" }).map((r) => r.entityId)).toEqual(["b", "c"]);
    });

    it("attention filter: needs-attention only, or a specific reason", () => {
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, attentionReason: "__needs__" }).map((r) => r.entityId)).toEqual(["a"]);
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, attentionReason: "Overdue tour" }).map((r) => r.entityId)).toEqual(["a"]);
    });

    it("sort reorders only when chosen (subject A–Z, attention first, status A–Z)", () => {
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, sort: "subject_az" }).map((r) => r.entityId)).toEqual(["b", "c", "a"]);
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, sort: "attention_first" }).map((r) => r.entityId)[0]).toBe("a");
        expect(applyQueueRowFilters(rows, { ...EMPTY_QUEUE_ROW_FILTER, sort: "status_az" }).map((r) => r.entityId)).toEqual(["a", "c", "b"]); // Active, Active, Waitlisted
    });

    it("facets are distinct values from the loaded rows", () => {
        const f = deriveQueueRowFilterFacets(rows);
        expect(f.statusOptions.map((o) => o.value).sort()).toEqual(["open", "waitlisted"]);
        expect(f.siteOptions.map((o) => o.label).sort()).toEqual(["Main", "West"]);
        expect(f.programOptions.map((o) => o.label).sort()).toEqual(["Infant", "Toddler"]);
        expect(f.attentionReasonOptions.map((o) => o.label)).toEqual(["Overdue tour"]);
    });

    it("isActive / advanced count reflect only narrowing filters (sort is not 'active')", () => {
        expect(queueRowFilterIsActive(EMPTY_QUEUE_ROW_FILTER)).toBe(false);
        expect(queueRowFilterIsActive({ ...EMPTY_QUEUE_ROW_FILTER, sort: "subject_az" })).toBe(false); // sort alone
        expect(queueRowFilterIsActive({ ...EMPTY_QUEUE_ROW_FILTER, statusKey: "open" })).toBe(true);
        expect(queueRowFilterAdvancedActiveCount({ ...EMPTY_QUEUE_ROW_FILTER, statusKey: "open", sort: "subject_az" })).toBe(2);
    });
});
