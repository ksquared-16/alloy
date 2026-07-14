import { describe, expect, it } from "vitest";

import { attachOpportunityQueueRowsWithRowContext } from "@/lib/workUnits/attachQueueRowContextToItems";

/**
 * Payload-reduction measurement for the compact `queue_reveal` projection.
 *
 * The single largest per-row payload contribution is the drawer-grade
 * `_queue_row_context` object — a nested lifecycle/subject/placement/related-subject
 * summary intended for the Focus Panel, not the queue preview. `queue_reveal` omits it
 * for case-grain rows (see queueRowEnrichmentPlan.ts `attachCaseGrainRowContext`).
 *
 * This test measures the wire delta on a representative enriched case-grain row and
 * guards against re-inflation: the reveal row must stay materially smaller than the
 * list row. It is also the "before/after fixture bytes + property count" evidence
 * requested by the Workspace Trust Closure sprint (item 6).
 */

/** A representative enriched opportunity case-grain preview row (`enrichOpportunityRows` shape). */
function representativeEnrichedRow(): Record<string, unknown> {
    return {
        id: "opp-1001",
        entity_type: "opportunity",
        title: "Nguyen Family",
        name: "Nguyen Family",
        status_key: "qualification",
        _status_display: "Qualification",
        _stage_label: "Qualification",
        _primary_contact_line: "Mai Nguyen",
        _primary_contact_name: "Mai Nguyen",
        _primary_phone: "(503) 555-0199",
        _primary_email: "mai@example.com",
        _location_label: "Main Campus",
        location_id: "loc-1",
        _requested_program: "Preschool",
        _child_display_name: "Sam Nguyen",
        _attention_reason_label: "Follow up on tour",
        _next_step_label: "Confirm start date",
        _last_activity_label: "Called 2 days ago",
        _commercial_value_label: "$1,450 / mo",
        created_at: "2026-06-01T12:00:00.000Z",
        updated_at: "2026-07-10T09:30:00.000Z",
        _inquiry_children: [
            {
                display_name: "Sam Nguyen",
                desired_program_label: "Preschool",
                location_label: "Main Campus",
                desired_start_date: "2026-09-02",
                child_lifecycle_status: "offer_pending",
            },
            {
                display_name: "Riley Nguyen",
                desired_program_label: "Toddler",
                location_label: "Main Campus",
                desired_start_date: "2026-09-02",
                child_lifecycle_status: "waitlisted",
            },
        ],
    };
}

const lane = {
    entityType: "opportunity",
    requestedQueueKey: "lead",
    executableQueueKey: "lead",
    queueLabel: "Lead",
    normalized: {
        version: 2,
        entity_type: "opportunity",
        queues: [{ key: "lead", label: "Lead" }],
    } as never,
};

function bytes(row: unknown): number {
    return Buffer.byteLength(JSON.stringify(row), "utf8");
}

/** Total key count across the object tree (arrays counted by element keys). */
function deepPropertyCount(value: unknown): number {
    if (Array.isArray(value)) {
        return value.reduce((sum: number, v) => sum + deepPropertyCount(v), 0);
    }
    if (value && typeof value === "object") {
        return Object.keys(value as Record<string, unknown>).reduce(
            (sum, k) => sum + 1 + deepPropertyCount((value as Record<string, unknown>)[k]),
            0,
        );
    }
    return 0;
}

describe("queue_reveal compact projection — payload reduction", () => {
    it("reveal row is materially smaller than the list row on a representative case-grain row", () => {
        // Before (queue_list): drawer-grade _queue_row_context attached.
        const [listRow] = attachOpportunityQueueRowsWithRowContext([representativeEnrichedRow()], lane, {
            attachCaseGrainRowContext: true,
        });
        // After (queue_reveal): case-grain row context omitted.
        const [revealRow] = attachOpportunityQueueRowsWithRowContext([representativeEnrichedRow()], lane, {
            attachCaseGrainRowContext: false,
        });

        const listBytes = bytes(listRow);
        const revealBytes = bytes(revealRow);
        const listProps = deepPropertyCount(listRow);
        const revealProps = deepPropertyCount(revealRow);

        // Sanity: list carries the drawer context, reveal does not.
        expect(listRow).toHaveProperty("_queue_row_context");
        expect(revealRow).not.toHaveProperty("_queue_row_context");

        // eslint-disable-next-line no-console
        console.log(
            `[queue_reveal payload] list=${listBytes}B/${listProps} props  ` +
                `reveal=${revealBytes}B/${revealProps} props  ` +
                `saved=${listBytes - revealBytes}B (${Math.round((1 - revealBytes / listBytes) * 100)}%), ` +
                `${listProps - revealProps} props`,
        );

        // Regression guard: reveal must stay meaningfully leaner than list.
        expect(revealBytes).toBeLessThan(listBytes);
        expect(revealBytes).toBeLessThan(listBytes * 0.8);
        expect(revealProps).toBeLessThan(listProps);
    });
});
