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
import { mergeCompactSlotsInheritDefault } from "./mergeCompactSlotsInheritDefault";
import { resolveQueueRowSubjectFocus, type FocusedSubjectContext } from "./resolveQueueRowSubjectFocus";

/** Build the variant match input from a row's frozen context + the active runtime scope. */
export function queueRowVariantMatchInputFromContext(
    context: QueueRowContext,
    scope: { workViewId?: string | null; workViewKey?: string | null },
): QueueRowVariantMatchInput {
    const grain = context.row_subject?.subject_type ?? null;
    const rowStageKey =
        typeof (context as { row_stage_key?: unknown }).row_stage_key === "string"
            ? ((context as { row_stage_key?: string }).row_stage_key ?? "").trim() || null
            : null;
    const subjectStageKey =
        typeof context.row_subject?.stage_key === "string"
            ? context.row_subject.stage_key.trim() || null
            : null;
    const stageKey =
        context.drawer_open?.active_subject?.stage_key?.trim() ||
        context.drawer_open?.stage_focus_key?.trim() ||
        rowStageKey ||
        subjectStageKey ||
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
 * Empty matched variant columns inherit Default (never blank the row).
 * Slots the variant does not configure inherit Default (so Default children.names/count survive
 * stage variants that only specialize status/work).
 */
export function resolveQueueRowCompactSlots(
    config: QueueRecordLayoutConfigV3 | null,
    input: QueueRowVariantMatchInput,
): CompactRowSlots {
    if (!config) return mapQueueRowSurfaceToCompactConfig(null).slots;
    const defaultSlots = mapQueueRowSurfaceToCompactConfig({
        ...config,
        variants: undefined,
    }).slots;
    const variant = resolveQueueRowVariant(config.variants, input);
    if (!variant || variant.columns.length === 0) return defaultSlots;
    const variantSlots = mapQueueRowSurfaceToCompactConfig({
        ...config,
        columns: variant.columns,
        fixedControls: variant.fixedControls ?? config.fixedControls,
        variants: undefined,
    }).slots;
    return mergeCompactSlotsInheritDefault(variantSlots, defaultSlots, {
        rowGrain: input.grain ?? input.rowType ?? null,
    });
}

/**
 * Resolve the full per-row presentation in ONE variant pass: the compact slots (columns) AND the
 * Subject Focus. Focus applies ONLY when the matched variant explicitly declares subjectFocus —
 * otherwise `focus` is null and the row keeps its frozen-context rendering (graceful fallback).
 * Empty matched variant columns inherit Default columns. Pure; never throws.
 */
export function resolveQueueRowPresentation(
    config: QueueRecordLayoutConfigV3 | null,
    context: QueueRowContext,
    input: QueueRowVariantMatchInput,
): { rowConfig: CompactRowSlots; focus: FocusedSubjectContext | null } {
    if (!config) {
        return { rowConfig: mapQueueRowSurfaceToCompactConfig(null).slots, focus: null };
    }
    const variant = resolveQueueRowVariant(config.variants, input);
    const rowConfig = resolveQueueRowCompactSlots(config, input);
    const focus =
        variant?.subjectFocus != null ? resolveQueueRowSubjectFocus(context, variant.subjectFocus) : null;
    return { rowConfig, focus };
}
