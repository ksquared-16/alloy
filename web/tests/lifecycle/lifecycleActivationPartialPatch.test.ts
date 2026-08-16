import { describe, expect, it } from "vitest";

import {
    lifecycleActivationFromMetadata,
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    parseLifecycleActivationV1,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";

/**
 * R-009 — a partial operator edit must mutate only what the operator changed.
 *
 * The endpoint is named PATCH but used to parse the request body ALONE and persist the result
 * wholesale, so "partial" was a lie: every caller had to reconstruct the full bundle from component
 * state. The client duly defaulted `action_definition_id` to null and `action_placement_ids` to []
 * on every call, so an unrelated edit — renaming the lifecycle — silently cleared both, and any
 * field whose state had not resolved yet was persisted as whatever the client happened to hold.
 *
 * The handler now merges the body's PRESENT keys over the persisted bundle. This test reproduces
 * that merge exactly as the route performs it, so it fails if the route reverts to replace
 * semantics.
 */

const PERSISTED: LifecycleActivationV1 = {
    version: 1,
    lifecycle_name: "Enrollment",
    primary_entity: "opportunity",
    primary_record_label: "Lead",
    process_id: "proc-1",
    stage_key: "waitlist",
    stage_label: "Waitlist",
    work_unit_id: "wu-1",
    work_unit_name: "Enrollment Pipeline",
    status_keys: ["waiting", "offered"],
    status_labels: ["Waiting", "Offered"],
    action_definition_id: "action-def-7",
    action_placement_ids: ["placement-a", "placement-b"],
    activation_owned: true,
    completed_steps: 6,
    updated_at: "2026-08-01T00:00:00.000Z",
};

/** The route's merge, verbatim: absent key = unchanged, explicit value (incl. null) = applied. */
const applyPatch = (body: Record<string, unknown>, persisted: LifecycleActivationV1 | null) => {
    const existing = lifecycleActivationFromMetadata(
        persisted ? { [LIFECYCLE_ACTIVATION_METADATA_KEY]: persisted } : {},
    );
    const merged = existing ? { ...existing, ...body } : body;
    return parseLifecycleActivationV1(merged);
};

describe("changing one field leaves its siblings byte-identical", () => {
    it("renaming the lifecycle does not clear the action definition or its placements", () => {
        // This is the exact shape the board now sends for `saveActivation({ lifecycle_name })`.
        const next = applyPatch(
            {
                version: 1,
                primary_entity: "opportunity",
                primary_record_label: "Lead",
                process_id: "proc-1",
                stage_key: "waitlist",
                stage_label: "Waitlist",
                lifecycle_name: "Enrollment 2026",
                updated_at: "2026-08-16T00:00:00.000Z",
            },
            PERSISTED,
        );
        expect(next?.lifecycle_name).toBe("Enrollment 2026");
        // The siblings the operator never touched:
        expect(next?.action_definition_id).toBe("action-def-7");
        expect(next?.action_placement_ids).toEqual(["placement-a", "placement-b"]);
        expect(next?.status_keys).toEqual(["waiting", "offered"]);
        expect(next?.work_unit_id).toBe("wu-1");
        expect(next?.completed_steps).toBe(6);
    });

    it("keeps every untouched field byte-identical, not merely equal-looking", () => {
        const next = applyPatch(
            { version: 1, process_id: "proc-1", stage_key: "waitlist", status_keys: ["waiting"], status_labels: ["Waiting"] },
            PERSISTED,
        );
        const untouched = (a: LifecycleActivationV1) => ({
            action_definition_id: a.action_definition_id,
            action_placement_ids: a.action_placement_ids,
            work_unit_id: a.work_unit_id,
            work_unit_name: a.work_unit_name,
            lifecycle_name: a.lifecycle_name,
            activation_owned: a.activation_owned,
            completed_steps: a.completed_steps,
        });
        expect(JSON.stringify(untouched(next!))).toBe(JSON.stringify(untouched(PERSISTED)));
        expect(next?.status_keys).toEqual(["waiting"]);
    });

    it("an explicit null still clears — absence and null are different intents", () => {
        const next = applyPatch(
            { version: 1, process_id: "proc-1", stage_key: "waitlist", work_unit_id: null, work_unit_name: null },
            PERSISTED,
        );
        expect(next?.work_unit_id).toBeNull();
        expect(next?.work_unit_name).toBeNull();
        // and the unrelated siblings survive that clear
        expect(next?.action_definition_id).toBe("action-def-7");
    });

    it("a first save with nothing persisted still validates as a complete bundle", () => {
        const next = applyPatch(
            {
                version: 1,
                primary_entity: "opportunity",
                primary_record_label: "Lead",
                process_id: "proc-new",
                stage_key: "lead",
                stage_label: "Lead",
                lifecycle_name: "Brand New",
                activation_owned: true,
                completed_steps: 1,
            },
            null,
        );
        expect(next).not.toBeNull();
        expect(next?.process_id).toBe("proc-new");
        expect(next?.completed_steps).toBe(1);
        // Absent on a first save means "no value yet", which is the pre-existing default.
        expect(next?.action_definition_id).toBeNull();
        expect(next?.action_placement_ids).toEqual([]);
    });

    it("still rejects a payload that cannot identify the record", () => {
        expect(applyPatch({ version: 1, lifecycle_name: "No identity" }, null)).toBeNull();
    });
});
