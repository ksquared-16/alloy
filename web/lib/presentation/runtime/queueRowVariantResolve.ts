/**
 * Presentation Runtime V2 — per-row Queue Row Variant → compact slots (pure).
 *
 * Bridges the frozen QueueRowContext to variant selection: builds the match input from the row's
 * context + active runtime scope, picks the first matching variant (or the top-level Default), and
 * maps that variant's columns onto the SAME compact anatomy the runtime already renders. No new
 * renderer; variants only change WHICH columns feed the fixed slots.
 */

import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { resolveQueueRowVariant, type QueueRowVariantMatchInput } from "./resolveQueueRowVariant";
import { mapQueueRowSurfaceToCompactConfig, type CompactRowSlots } from "./queueRowSurfaceConfig";

/** Build the variant match input from a row's frozen context + the active runtime scope. */
export function queueRowVariantMatchInputFromContext(
    context: QueueRowContext,
    scope: { workViewId?: string | null; workViewKey?: string | null },
): QueueRowVariantMatchInput {
    const grain = context.row_subject?.subject_type ?? null;
    const stageKey =
        context.drawer_open?.active_subject?.stage_key?.trim() ||
        context.drawer_open?.stage_focus_key?.trim() ||
        null;
    return {
        stageKey,
        statusKey: context.row_status_key ?? null,
        grain,
        workViewId: scope.workViewId ?? null,
        workViewKey: scope.workViewKey ?? null,
        processKey: context.lifecycle_key ?? null,
        rowType: grain,
    };
}

/**
 * Resolve the compact slots for a single row. Picks the matching variant (else the top-level
 * Default columns) and maps to the fixed compact anatomy. Null config → generic-context slots.
 * Pure; never throws.
 */
export function resolveQueueRowCompactSlots(
    config: QueueRecordLayoutConfigV3 | null,
    input: QueueRowVariantMatchInput,
): CompactRowSlots {
    if (!config) return mapQueueRowSurfaceToCompactConfig(null).slots;
    const variant = resolveQueueRowVariant(config.variants, input);
    const effective = variant ? { ...config, columns: variant.columns } : config;
    return mapQueueRowSurfaceToCompactConfig(effective).slots;
}
