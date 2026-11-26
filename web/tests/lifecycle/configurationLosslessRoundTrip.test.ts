/**
 * Law 7 — Deterministic Serialization, and its consequence Law 1 — Lossless Persistence.
 *
 * parse -> serialize -> parse must produce an equivalent configuration, and any field the writer
 * does not own must survive unchanged.
 *
 * These are platform invariants, not Firefly fixes. The concrete regression they lock down: a
 * worktree running older code stripped `row_grain_v1` (a field that exists only on a newer branch)
 * out of Firefly's persisted work views, because the parser rebuilds records from a fixed allowlist
 * and the writer serializes from that lossy parse.
 *
 * See docs/platform/governance/configuration-integrity-laws.md
 */

import { describe, expect, it } from "vitest";

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    mergeLifecycleBuilderIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

/**
 * A department metadata blob authored by a NEWER writer than the one round-tripping it.
 * Every `future_*` key, plus `row_grain_v1`, is unknown to this branch's parser by construction.
 */
function metadataAuthoredByNewerWriter(): Record<string, unknown> {
    return {
        // Sibling top-level key the lifecycle writer does not own at all.
        unrelated_tenant_settings_v9: { retained: true },
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "process-1",
            future_builder_level_key: { keep: "me" },
            processes: [
                {
                    id: "process-1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    future_process_level_key: ["a", "b"],
                    work_views_v1: [
                        {
                            id: "child_lens",
                            label: "Children",
                            display_order: 1,
                            visible_in_runtime: true,
                            // The exact field that was destroyed in production.
                            row_grain_v1: { grain: "child", subject: "child" },
                            future_work_view_key: 42,
                        },
                    ],
                    stages: [
                        {
                            id: "stage-1",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            future_stage_level_key: { nested: { deep: true } },
                        },
                    ],
                },
            ],
        },
    };
}

/** The round trip every persist path performs: read -> parse -> merge -> write. */
function roundTrip(metadata: Record<string, unknown>): Record<string, unknown> {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    return mergeLifecycleBuilderIntoMetadata(metadata, builder) as Record<string, unknown>;
}

function builderOf(metadata: Record<string, unknown>): Record<string, unknown> {
    return metadata[LIFECYCLE_BUILDER_METADATA_KEY] as Record<string, unknown>;
}

function firstProcess(metadata: Record<string, unknown>): Record<string, unknown> {
    return (builderOf(metadata).processes as Record<string, unknown>[])[0]!;
}

describe("Law 7 — configuration round-trip is lossless", () => {
    it("preserves unknown keys on a work view, including row_grain_v1", () => {
        const after = roundTrip(metadataAuthoredByNewerWriter());
        const view = (firstProcess(after).work_views_v1 as Record<string, unknown>[])[0]!;

        expect(view.row_grain_v1).toEqual({ grain: "child", subject: "child" });
        expect(view.future_work_view_key).toBe(42);
        // Known fields still round-trip correctly.
        expect(view.id).toBe("child_lens");
        expect(view.label).toBe("Children");
    });

    it("preserves unknown keys on a process", () => {
        const after = roundTrip(metadataAuthoredByNewerWriter());
        expect(firstProcess(after).future_process_level_key).toEqual(["a", "b"]);
    });

    it("preserves unknown keys on a stage", () => {
        const after = roundTrip(metadataAuthoredByNewerWriter());
        const stage = (firstProcess(after).stages as Record<string, unknown>[])[0]!;
        expect(stage.future_stage_level_key).toEqual({ nested: { deep: true } });
    });

    it("preserves unknown keys at the builder root", () => {
        const after = roundTrip(metadataAuthoredByNewerWriter());
        expect(builderOf(after).future_builder_level_key).toEqual({ keep: "me" });
    });

    it("leaves sibling metadata keys the lifecycle writer does not own untouched", () => {
        const after = roundTrip(metadataAuthoredByNewerWriter());
        expect(after.unrelated_tenant_settings_v9).toEqual({ retained: true });
    });

    it("is idempotent — a second round trip changes nothing", () => {
        const once = roundTrip(metadataAuthoredByNewerWriter());
        const twice = roundTrip(once);
        expect(twice).toEqual(once);
    });

    it("does not leak the unknown-field carrier into serialized output", () => {
        // Whatever mechanism carries unknowns in memory must not appear as a JSON key,
        // or it would be persisted to the database as real configuration.
        const after = roundTrip(metadataAuthoredByNewerWriter());
        const serialized = JSON.stringify(after);
        expect(serialized).not.toContain("__unknown");
        expect(serialized).not.toContain("unknownFields");
    });
});
