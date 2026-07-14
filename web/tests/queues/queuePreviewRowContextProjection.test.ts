import { describe, expect, it } from "vitest";

import {
    QUEUE_PREVIEW_CONTEXT_DROPPED_PATHS,
    QUEUE_PREVIEW_CONTEXT_EMPTIED_PATHS,
    QUEUE_PREVIEW_CONTEXT_READ_MANIFEST,
    projectQueuePreviewRowContext,
    projectQueuePreviewRowContexts,
} from "@/lib/queues/queuePreviewRowContextProjection";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import type { PartialQueueRowContextQueueMeta } from "@/lib/workUnits/buildPartialQueueRowContext";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    opportunityQueuePreviewSeedFromRowContext,
    queueRowModelFromQueueItem,
    queueRowSubjectDisplayName,
} from "@/lib/presentation/runtime/types";
import {
    resolveQueueRowProcessStageLabel,
    resolveQueueRowRecordStatusLabel,
} from "@/lib/presentation/runtime/resolveQueueRowFieldLabelsFromContext";
import { resolveQueueRowChildrenFieldFromContext } from "@/lib/layout/runtime/queueRowChildrenFieldRegistry";

/**
 * Compact layout-runtime queue-preview projection. Proves the narrowed `_queue_row_context` still
 * carries every field the DEPLOYED CondensedQueueRow chain reads, drops the Focus-Panel-only /
 * predicate-only / detail fields, and renders identically through the real deployed adapters.
 */

const QUEUE_META: PartialQueueRowContextQueueMeta = {
    key: "new_leads",
    label: "New Leads",
    lifecycle_key: "enrollment",
    stage_key: "new_lead",
    subject_grain: "case",
};

/** A representative enriched case-grain row: multi-child household with placement + contact + attention. */
function representativeEnrichedRow(): Record<string, unknown> {
    return {
        id: "opp-1001",
        title: "Nguyen Family",
        name: "Nguyen Family",
        status_key: "new_lead",
        _status_display: "New Lead",
        _primary_contact_line: "Mai Nguyen",
        _primary_phone: "(503) 555-0199",
        _primary_email: "mai@example.com",
        _child_display_name: "Sam Nguyen",
        _attention_reason_label: "Follow up on tour",
        _inquiry_children: [
            {
                id: "ocm-1",
                ocm_id: "ocm-1",
                person_id: "person-child-1",
                customer_member_id: "cm-1",
                display_name: "Sam Nguyen",
                desired_program_label: "Preschool",
                location_id: "loc-1",
                location_label: "Main Campus",
                program_room_cohort_label: "Room A",
                desired_schedule_label: "Full Day",
                dob: "2022-04-02",
                outcome_status_label: "Offer Pending",
            },
            {
                id: "ocm-2",
                ocm_id: "ocm-2",
                person_id: "person-child-2",
                customer_member_id: "cm-2",
                display_name: "Riley Nguyen",
                desired_program_label: "Toddler",
                location_id: "loc-1",
                location_label: "Main Campus",
                program_room_cohort_label: "Room B",
                desired_schedule_label: "Half Day",
                dob: "2023-08-15",
                outcome_status_label: "Waitlisted",
            },
        ],
    };
}

function fullContext(): QueueRowContext {
    return buildPartialQueueRowContext({ row: representativeEnrichedRow(), queue: QUEUE_META });
}

function getPath(obj: unknown, path: string): unknown {
    // Resolves "a.b" and "a[].b" (array-mapped) — returns a scalar, or (for `[]`) the first element's value.
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
        if (part.endsWith("[]")) {
            const key = part.slice(0, -2);
            const arr = (current as Record<string, unknown> | null)?.[key];
            if (!Array.isArray(arr) || arr.length === 0) return undefined;
            current = arr[0];
            continue;
        }
        current = (current as Record<string, unknown> | null | undefined)?.[part];
        if (current === undefined) return undefined;
    }
    return current;
}

function hasPath(obj: unknown, path: string): boolean {
    return getPath(obj, path) !== undefined;
}

/** Null and absent are equivalent for optional context fields — neither carries information. */
function hasMeaningfulValue(obj: unknown, path: string): boolean {
    return getPath(obj, path) != null;
}

function bytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function deepPropertyCount(value: unknown): number {
    if (Array.isArray(value)) return value.reduce((s: number, v) => s + deepPropertyCount(v), 0);
    if (value && typeof value === "object") {
        return Object.keys(value as Record<string, unknown>).reduce(
            (s, k) => s + 1 + deepPropertyCount((value as Record<string, unknown>)[k]),
            0,
        );
    }
    return 0;
}

describe("compact queue-preview projection — read manifest", () => {
    it("every manifest path present on the full context survives projection with the same value", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        const emptied = new Set<string>(QUEUE_PREVIEW_CONTEXT_EMPTIED_PATHS);

        for (const path of QUEUE_PREVIEW_CONTEXT_READ_MANIFEST) {
            if (emptied.has(path)) continue;
            if (!hasMeaningfulValue(full, path)) continue; // null/absent on this fixture — nothing to preserve
            expect(hasMeaningfulValue(projected, path), `manifest path dropped: ${path}`).toBe(true);
            expect(getPath(projected, path), `manifest path value changed: ${path}`).toEqual(getPath(full, path));
        }
    });

    it("drops every Focus-Panel-only / predicate-only / detail path", () => {
        const projected = projectQueuePreviewRowContext(fullContext());
        for (const path of QUEUE_PREVIEW_CONTEXT_DROPPED_PATHS) {
            expect(hasPath(projected, path), `dropped path still serialized: ${path}`).toBe(false);
        }
    });

    it("empties type-required-but-unread fields (present but sentinel)", () => {
        const projected = projectQueuePreviewRowContext(fullContext());
        expect(projected.case_context.case_type_label).toBe("");
        expect(projected.case_context.case_status_key).toBe("");
        // work_summary / next_best_action are emptied ONLY when present (null passes through as null).
        if (projected.work_summary) expect(projected.work_summary.open_count).toBe(0);
        if (projected.next_best_action) expect(projected.next_best_action.source).toBe("none");
        if (projected.placement_context) expect(projected.placement_context.location_id).toBeNull();
        for (const related of projected.related_subjects_summary) {
            expect(related.status_label).toBe("");
        }
        expect(projected.related_subjects_summary.length).toBeGreaterThan(0); // fixture has children to empty
    });
});

describe("compact queue-preview projection — renderer fidelity (deployed adapters)", () => {
    it("subject display name, status, and stage render identically to the full context", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        expect(queueRowSubjectDisplayName(projected)).toBe(queueRowSubjectDisplayName(full));
        expect(resolveQueueRowRecordStatusLabel(projected)).toBe(resolveQueueRowRecordStatusLabel(full));
        // row_stage is always populated by the constructor, so dropping drawer_open.active_subject.stage_key
        // (its only fallback) never changes the rendered stage.
        expect(full.row_stage.trim().length).toBeGreaterThan(0);
        expect(resolveQueueRowProcessStageLabel(projected)).toBe(resolveQueueRowProcessStageLabel(full));
    });

    it("the Focus Panel open seed is identical from projected vs full context", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        expect(opportunityQueuePreviewSeedFromRowContext(projected)).toEqual(
            opportunityQueuePreviewSeedFromRowContext(full),
        );
    });

    it("children collection fields (program / schedule / names) render identically", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        for (const key of ["child.name", "inquiry_child.program", "inquiry_child.schedule_type", "children"]) {
            expect(resolveQueueRowChildrenFieldFromContext(key, projected)).toEqual(
                resolveQueueRowChildrenFieldFromContext(key, full),
            );
        }
    });

    it("queueRowModelFromQueueItem resolves the same entity id from a projected row", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        const fromFull = queueRowModelFromQueueItem({ id: "opp-1001", _queue_row_context: full }, "opportunity");
        const fromProjected = queueRowModelFromQueueItem(
            { id: "opp-1001", _queue_row_context: projected },
            "opportunity",
        );
        expect(fromProjected?.entityId).toBe(fromFull?.entityId);
        expect(fromProjected?.entityId).toBe("opp-1001");
    });
});

describe("compact queue-preview projection — payload reduction (representative multi-child row)", () => {
    it("projected context is materially smaller in bytes and property count", () => {
        const full = fullContext();
        const projected = projectQueuePreviewRowContext(full);
        const fullBytes = bytes(full);
        const projectedBytes = bytes(projected);
        const fullProps = deepPropertyCount(full);
        const projectedProps = deepPropertyCount(projected);

        // eslint-disable-next-line no-console
        console.log(
            `[compact-preview] full=${fullBytes}B/${fullProps}props  ` +
                `projected=${projectedBytes}B/${projectedProps}props  ` +
                `saved=${fullBytes - projectedBytes}B (${Math.round((1 - projectedBytes / fullBytes) * 100)}%), ` +
                `${fullProps - projectedProps} props`,
        );

        expect(projectedBytes).toBeLessThan(fullBytes);
        expect(projectedProps).toBeLessThan(fullProps);
    });
});

describe("compact queue-preview projection — predicate & row independence", () => {
    it("projectQueuePreviewRowContexts leaves base-query row fields (predicate facts) untouched", () => {
        const row = {
            id: "opp-1001",
            status_key: "new_lead", // the field work-view predicates evaluate — must survive
            _some_flat_enrichment: "kept",
            _queue_row_context: fullContext(),
        };
        const [projectedRow] = projectQueuePreviewRowContexts([row]);
        expect(projectedRow.status_key).toBe("new_lead");
        expect(projectedRow._some_flat_enrichment).toBe("kept");
        expect(projectedRow.id).toBe("opp-1001");
        // Only the context is narrowed.
        expect((projectedRow._queue_row_context as QueueRowContext).drawer_open).not.toHaveProperty("active_subject");
    });

    it("rows without a context (or non-objects) pass through unchanged", () => {
        const rows = [{ id: "a", status_key: "x" }, null, 42, { id: "b", _queue_row_context: fullContext() }];
        const out = projectQueuePreviewRowContexts(rows);
        expect(out[0]).toEqual({ id: "a", status_key: "x" });
        expect(out[1]).toBeNull();
        expect(out[2]).toBe(42);
        expect(out[3]).toMatchObject({ id: "b" });
    });

    it("projection is a pure O(n) transform — no query classes added for 1/10/50/100 rows", () => {
        // The projection issues no fetches (predicate/count facts come from base rows elsewhere), so
        // the wire compaction cannot introduce per-row request fan-out. Assert exact 1:1 row mapping.
        for (const n of [1, 10, 50, 100]) {
            const rows = Array.from({ length: n }, (_, i) => ({ id: `opp-${i}`, _queue_row_context: fullContext() }));
            const out = projectQueuePreviewRowContexts(rows);
            expect(out).toHaveLength(n);
            expect(out.every((r) => (r._queue_row_context as QueueRowContext).drawer_open !== undefined)).toBe(true);
        }
    });

    it("optional widgets omitted from the source produce no projected field (no fabricated data)", () => {
        // A minimal row (no children, no placement, no waitlist) must not gain those objects.
        const minimalRow = { id: "opp-2", title: "Solo", name: "Solo", status_key: "new_lead" };
        const ctx = buildPartialQueueRowContext({ row: minimalRow, queue: QUEUE_META });
        const projected = projectQueuePreviewRowContext(ctx);
        expect(projected.related_subjects_summary).toEqual([]);
        expect(projected.placement_context).toBeUndefined();
        expect(projected.waitlist_context).toBeUndefined();
    });
});
