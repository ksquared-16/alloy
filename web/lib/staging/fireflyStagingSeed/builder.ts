/**
 * Firefly staging seed — the Enrollment business process document (ALY-14 E2).
 *
 * Built by the platform's own Enrollment template (`buildEnrollmentTemplateStageRecords` +
 * `ENROLLMENT_DEFAULT_TRACKS`), i.e. exactly what "Apply Enrollment template" writes in Settings,
 * with the template's random stage ids replaced by fixed ones. Nothing here is hand-copied from the
 * live tenant: the July capture of Firefly's published plan (docs/sprints/active/assets/firefly-config)
 * carries the defects that report certified (a `decision` target outside the pipeline, an empty
 * `qualification` stage), and a staging school that reproduced them could not run the journey it
 * exists to exercise.
 *
 * Work views and entry points are authored here because the template writes neither. The four views
 * are the ones the representative seed already proves render (all declared `family` grain — see that
 * seed's Section 4 for why an undeclared lens is refused as grain-ambiguous).
 */

import {
    buildEnrollmentTemplateStageRecords,
    ENROLLMENT_DEFAULT_TRACKS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

import { SEED_PROCESS_ID, seedStageId } from "./ids";

export const SEED_WORK_VIEWS = [
    {
        id: "new_leads",
        label: "New Leads",
        mission: "Respond to every new family inquiry before it goes cold.",
        compat_queue_key: "new_leads",
        display_order: 1,
        visible_in_runtime: true,
        sort_v1: { field_key: "updated_at", direction: "desc" },
        sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
        row_grain_v1: "family",
    },
    {
        id: "tours",
        label: "Tours",
        mission: "Confirm the visit and record the outcome.",
        compat_queue_key: "tours",
        display_order: 2,
        visible_in_runtime: true,
        sort_v1: { field_key: "updated_at", direction: "asc" },
        sorts_v1: [{ field_key: "updated_at", direction: "asc" }],
        row_grain_v1: "family",
    },
    {
        id: "follow_up",
        label: "Follow Up",
        mission: "Keep the conversation moving toward a decision.",
        compat_queue_key: "communications_followup",
        display_order: 3,
        visible_in_runtime: true,
        sort_v1: { field_key: "updated_at", direction: "desc" },
        sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
        row_grain_v1: "family",
    },
    {
        id: "all_work",
        label: "All Work",
        mission: "Every open case in this process.",
        display_order: 4,
        visible_in_runtime: true,
        sort_v1: { field_key: "updated_at", direction: "desc" },
        sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
        row_grain_v1: "family",
    },
] as const;

export function buildSeedLifecycleBuilder(): LifecycleBuilderV1 {
    const stages = buildEnrollmentTemplateStageRecords().map((stage, index) => ({
        ...stage,
        id: seedStageId(index),
    }));
    return {
        version: 1,
        active_process_id: SEED_PROCESS_ID,
        processes: [
            {
                id: SEED_PROCESS_ID,
                key: ENROLLMENT_PROCESS_KEY,
                name: "Enrollment",
                description: "Lead to enrolled — inquiry, tour, decision, placement.",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                tracks_v1: structuredClone(ENROLLMENT_DEFAULT_TRACKS),
                entry_points_v1: { version: 1, by_intent: { create_lead: "lead", enrollment_start: "enrolling" } },
                work_views_v1: SEED_WORK_VIEWS.map((view) => structuredClone(view)) as never,
                stages,
            },
        ],
    };
}

/** The stage keys the seeded families are distributed across; must all exist in the template. */
export function seedStageKeys(): string[] {
    return buildEnrollmentTemplateStageRecords().map((s) => s.key);
}
