/**
 * Compact layout-runtime queue-preview projection.
 *
 * WHY: The deployed Work Unit queue surface renders each row with `CondensedQueueRow`, which reads
 * ONLY `row.id` + `row._queue_row_context` (see `queueRowModelFromQueueItem`). The full
 * `QueueRowContext` it currently serializes carries a large amount the compact row never reads —
 * a full `drawer_open.active_subject` lifecycle ref (with `case_anchor`), per-child placement ids
 * and location/room detail, `case_context` bookkeeping, `placement_context` raw keys, and several
 * predicate-only / Focus-Panel-only fields. On a real multi-child household that is the bulk of the
 * ~29.6 KB visible-row payload.
 *
 * WHAT: `projectQueuePreviewRowContext` returns a VALID `QueueRowContext` narrowed to exactly the
 * fields the deployed `CondensedQueueRow` chain reads (the read manifest below). Type-required fields
 * that the renderer never reads are emptied (`""` / `null` / `0` / `"none"`) rather than carrying a
 * value, so the projection stays type-safe and NO existing reader/adapter changes — the wire value
 * is simply lighter. The projection is a WIRE transform applied at the visible-row response boundary
 * for `queue_reveal` rows only; it does NOT mutate the rows the server uses for work-view filtering,
 * counts, or `computeWorkViewOperationalSignals` (those run on base rows before this projection).
 *
 * The read manifest was produced by tracing the mounted renderer:
 *   useWorkUnitSurfaceRuntime → queueRowModelsFromQueueItemsResult → QueueRegion → CondensedQueueRow
 *   → resolveCompactSlotDisplay / queueRowSubjectDisplayName / resolveQueueRowChildrenFieldFromContext
 *   / resolveQueueRowSubjectFocus / resolveQueueRowFieldLabelsFromContext / queueRowVariantResolve
 *   / opportunityQueuePreviewSeedFromRowContext.
 *
 * @see web/lib/presentation/runtime/types.ts (queueRowModelFromQueueItem, preview seed)
 * @see web/lib/presentation/runtime/resolveCompactSlotDisplay.ts
 * @see docs/system/work-unit-surface-context-contract.md
 */

import type {
    QueueRowContext,
    QueueRowDrawerOpen,
    QueueRowSubjectPresentation,
    RelatedSubjectSummary,
    SubjectPlacementContext,
} from "@/lib/workUnits/lifecycleSubjectContracts";

/**
 * Every `QueueRowContext` path the DEPLOYED compact row (and its open seed / variant / focus
 * adapters) reads. The projection guarantees each of these survives; a static test asserts the
 * projected context still yields them and drops everything else. Dropped-but-type-required fields
 * are emptied (see `PROJECTION_EMPTIED_PATHS`).
 */
export const QUEUE_PREVIEW_CONTEXT_READ_MANIFEST = [
    "contract_version",
    "row_presentation_mode",
    "row_subject.display_name",
    "row_subject.subject_type",
    "row_subject.subject_id",
    "row_subject.date_of_birth",
    "row_subject.age_label",
    "row_subject.gender_label",
    "row_subjects[].display_name",
    "row_subjects[].subject_type",
    "row_subjects[].subject_id",
    "row_subjects[].date_of_birth",
    "row_subjects[].age_label",
    "row_subjects[].gender_label",
    "row_count",
    "row_count_unit",
    "row_stage",
    "row_status_label",
    "row_status_key",
    "lifecycle_key",
    "case_context.display_name",
    "case_context.case_id",
    "case_context.case_status_label",
    "primary_contact.display_name",
    "primary_contact.phone",
    "primary_contact.email",
    "related_subjects_summary[].display_name",
    "related_subjects_summary[].subject_id",
    "related_subjects_summary[].visibility",
    "related_subjects_summary[].program_label",
    "related_subjects_summary[].schedule_label",
    "related_subjects_summary[].date_of_birth",
    "related_subjects_summary[].age_label",
    "related_subjects_summary[].gender_label",
    "attention_summary.needs_attention",
    "attention_summary.primary_reason_label",
    "current_work_summary.label",
    "current_work_summary.state",
    "current_work_summary.due_label",
    "current_work_summary.progress_hint",
    "current_work_summary.blocker_hint",
    "work_summary.primary_open_label",
    "next_best_action.label",
    "placement_context.program_label",
    "placement_context.schedule_label",
    "placement_context.room_label",
    "placement_context.location_label",
    "waitlist_context.position_label",
    "drawer_open.entity_type",
    "drawer_open.entity_id",
    "drawer_open.stage_focus_key",
] as const;

/**
 * Fields the compact row never reads but the frozen `QueueRowContext` type requires to be present.
 * The projection keeps them at an empty sentinel (no information, ~no bytes) rather than carrying
 * the source value. A test asserts each is emptied.
 */
export const QUEUE_PREVIEW_CONTEXT_EMPTIED_PATHS = [
    "case_context.case_type_label",
    "case_context.case_status_key",
    "work_summary.open_count",
    "next_best_action.source",
    "related_subjects_summary[].status_label",
    "placement_context.location_id",
] as const;

/**
 * Heavy / detail / predicate-only / Focus-Panel-only fields dropped entirely from the serialized
 * preview context (absent on the wire). A test asserts none survive projection.
 */
export const QUEUE_PREVIEW_CONTEXT_DROPPED_PATHS = [
    "row_grouping_key",
    "next_best_action.action_key",
    "drawer_open.active_subject", // full LifecycleSubjectRef (+ case_anchor) — only `.stage_key` was read; row_stage covers it for case grain
    "drawer_open.active_subject_group",
    "placement_context.program_key",
    "placement_context.room_id",
    "placement_context.schedule_key",
    "related_subjects_summary[].location_id",
    "related_subjects_summary[].location_label",
    "related_subjects_summary[].room_label",
    "waitlist_context.wait_since",
] as const;

function nonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

/** Narrow a subject presentation to the identity + optional demographic subfields the row reads. */
function projectSubject(subject: QueueRowSubjectPresentation): QueueRowSubjectPresentation {
    const out: QueueRowSubjectPresentation = {
        subject_type: subject.subject_type,
        subject_id: subject.subject_id,
        display_name: subject.display_name,
    };
    if (subject.date_of_birth != null) out.date_of_birth = subject.date_of_birth;
    if (subject.age_label != null) out.age_label = subject.age_label;
    if (subject.gender_label != null) out.gender_label = subject.gender_label;
    return out;
}

/**
 * Narrow one related subject to the fields the children-collection / siblings / focus adapters read.
 * `status_label` is type-required but unread → emptied. Location/room detail dropped.
 */
function projectRelatedSubject(subject: RelatedSubjectSummary): RelatedSubjectSummary {
    const out: RelatedSubjectSummary = {
        subject_type: subject.subject_type,
        subject_id: subject.subject_id,
        display_name: subject.display_name,
        status_label: "", // type-required, never read by the compact row
    };
    if (subject.visibility != null) out.visibility = subject.visibility;
    if (subject.program_label != null) out.program_label = subject.program_label;
    if (subject.schedule_label != null) out.schedule_label = subject.schedule_label;
    if (subject.date_of_birth != null) out.date_of_birth = subject.date_of_birth;
    if (subject.age_label != null) out.age_label = subject.age_label;
    if (subject.gender_label != null) out.gender_label = subject.gender_label;
    return out;
}

/** Placement: keep the four labels the row/seed read; drop raw ids/keys. `location_id` emptied. */
function projectPlacement(placement: SubjectPlacementContext): SubjectPlacementContext {
    const out: SubjectPlacementContext = { location_id: null };
    if (placement.location_label != null) out.location_label = placement.location_label;
    if (placement.program_label != null) out.program_label = placement.program_label;
    if (placement.room_label != null) out.room_label = placement.room_label;
    if (placement.schedule_label != null) out.schedule_label = placement.schedule_label;
    return out;
}

/** Drawer open: keep routing identity + stage focus; drop the heavy active-subject ref(s). */
function projectDrawerOpen(drawerOpen: QueueRowDrawerOpen): QueueRowDrawerOpen {
    const out: QueueRowDrawerOpen = {
        entity_type: drawerOpen.entity_type,
        entity_id: drawerOpen.entity_id,
    };
    if (nonEmptyString(drawerOpen.stage_focus_key)) out.stage_focus_key = drawerOpen.stage_focus_key;
    return out;
}

/**
 * Project a full `QueueRowContext` to the compact preview shape the deployed compact row reads.
 * Returns a valid `QueueRowContext` (type-required-but-unread fields emptied) so no reader changes.
 */
export function projectQueuePreviewRowContext(context: QueueRowContext): QueueRowContext {
    const projected: QueueRowContext = {
        contract_version: context.contract_version,
        row_subject: projectSubject(context.row_subject),
        row_stage: context.row_stage,
        lifecycle_key: context.lifecycle_key,
        row_status_key: context.row_status_key,
        row_status_label: context.row_status_label,
        case_context: {
            case_id: context.case_context.case_id,
            display_name: context.case_context.display_name,
            case_type_label: "", // unread by compact row
            case_status_key: "", // unread by compact row
            case_status_label: context.case_context.case_status_label,
        },
        primary_contact: context.primary_contact
            ? {
                  display_name: context.primary_contact.display_name,
                  phone: context.primary_contact.phone ?? null,
                  email: context.primary_contact.email ?? null,
              }
            : null,
        related_subjects_summary: (context.related_subjects_summary ?? []).map(projectRelatedSubject),
        attention_summary: context.attention_summary
            ? {
                  needs_attention: context.attention_summary.needs_attention,
                  primary_reason_label: context.attention_summary.primary_reason_label,
              }
            : null,
        work_summary: context.work_summary
            ? {
                  open_count: 0, // unread by compact row
                  primary_open_label: context.work_summary.primary_open_label,
              }
            : null,
        current_work_summary: context.current_work_summary
            ? {
                  label: context.current_work_summary.label,
                  state: context.current_work_summary.state,
                  due_label: context.current_work_summary.due_label,
                  progress_hint: context.current_work_summary.progress_hint,
                  blocker_hint: context.current_work_summary.blocker_hint,
              }
            : null,
        next_best_action: context.next_best_action
            ? {
                  label: context.next_best_action.label,
                  source: "none", // unread by compact row
              }
            : null,
        drawer_open: projectDrawerOpen(context.drawer_open),
    };

    if (context.row_presentation_mode != null) projected.row_presentation_mode = context.row_presentation_mode;
    if (context.row_subjects != null) projected.row_subjects = context.row_subjects.map(projectSubject);
    if (context.row_count != null) projected.row_count = context.row_count;
    if (context.row_count_unit != null) projected.row_count_unit = context.row_count_unit;
    if (context.placement_context) projected.placement_context = projectPlacement(context.placement_context);
    if (context.waitlist_context) {
        const position = nonEmptyString(context.waitlist_context.position_label);
        if (position) projected.waitlist_context = { position_label: position };
    }

    return projected;
}

/** True when a value carries a `_queue_row_context` object we can project. */
function hasQueueRowContext(row: unknown): row is Record<string, unknown> & { _queue_row_context: QueueRowContext } {
    if (row == null || typeof row !== "object" || Array.isArray(row)) return false;
    const ctx = (row as Record<string, unknown>)._queue_row_context;
    return ctx != null && typeof ctx === "object" && !Array.isArray(ctx);
}

/**
 * Project every row's `_queue_row_context` in a queue items array to the compact preview shape.
 * Rows without a context (or non-object rows) pass through unchanged. Pure — returns new rows.
 */
export function projectQueuePreviewRowContexts<T>(rows: readonly T[]): T[] {
    return rows.map((row) => {
        if (!hasQueueRowContext(row)) return row;
        return {
            ...(row as Record<string, unknown>),
            _queue_row_context: projectQueuePreviewRowContext(row._queue_row_context),
        } as T;
    });
}
