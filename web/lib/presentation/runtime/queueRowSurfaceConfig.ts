/**
 * Presentation Runtime V2 — WU.QUEUE_ROW surface-config resolver (pure).
 *
 * Maps the PUBLISHED Queue Row surface (`QueueRecordLayoutConfigV3`, served by
 * GET /api/admin/queue-row-layout/{surfaceId}) onto the COMPACT condensed-row anatomy's
 * fixed slots. The compact row is NOT the heavy operational grid — it renders a small,
 * fixed set of slots from the frozen `QueueRowContext`. This resolver lets an operator's
 * published field visibility / labels flow into that compact anatomy WITHOUT the compact
 * row taking on the grid's column/block layout.
 *
 * Ownership split (doctrine):
 *   - Business Process / Work View (server) owns row ORDER + MEMBERSHIP + FILTERING.
 *   - Presentation owns PLACEMENT + compact ANATOMY + selected state + interaction.
 *   - This resolver owns only per-slot VISIBILITY + LABEL OVERRIDE, derived from config.
 *
 * ── Compact slot ↔ published fieldKey mapping ─────────────────────────────────────────
 * Each compact slot maps to the published field(s) that carry the same operator meaning.
 * When SEVERAL fieldKeys map to one slot, the FIRST present (config order-independent —
 * we scan the flattened field list) wins for the label override.
 *
 *   subject    → "customer.display_name"            (line 1 identity / avatar name)
 *                fallback also accepts "queue_row.subject_label"
 *   status     → "opportunity.status_label"         (status pill)
 *                fallback also accepts "queue_row.stage_label"
 *   contact    → "person.primary_contact_name"      (line 2 primary contact)
 *   attention  → "opportunity.attention_reason"     (line 3 attention reason)
 *   work       → "queue_row.work_summary"           (line 4 current work / next action)
 *                fallback also accepts "queue_row.next_best_action_label"
 *   groupCount → "queue_row.group_count_label"      (grouped-row count chip)
 *
 * ── Visibility rule ───────────────────────────────────────────────────────────────────
 * For each slot:
 *   - If a mapped field is PRESENT in config and NOT statically hidden → slot.visible=true,
 *     slot.label = field.label ?? null.
 *     `visibleWhen` here is ALWAYS record-conditional (exists/equals/not_equals/count_gt —
 *     see LAYOUT_CONDITION_TYPES); there is no static-true/false primitive. Per spec we
 *     treat record-conditional visibility as VISIBLE and let the row's own frozen context
 *     gate whether the slot has content. So a present field is visible.
 *   - If NO mapped field is present in config → FALLBACK to generic-context behavior:
 *     slot.visible=true, slot.label=null (absent config never HIDES a compact slot; it just
 *     does not override the generic anatomy).
 *   - When config is null (unpublished / fetch failed) → ALL slots visible, no label
 *     overrides — pure generic-context fallback.
 *
 * NOTE — no static-hide primitive today: `QueueRecordLayoutConfigV3` fields cannot express
 * "always hide" (only record-conditional `visibleWhen`). The `visible:false` state is
 * therefore never produced from a real published config today, but the type + the compact
 * row honor it so a future explicit-hide mapping needs no row change (and tests exercise it
 * directly). See `fallbackSlots` in the return for slots that fell back to generic context.
 */

import type {
    QueueRecordFieldConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";

/** One compact-anatomy slot's resolved config: whether to render it + an optional label override. */
export type CompactRowSlotConfig = {
    /** Render this slot. Absent/null config → true. Only an explicit config hide sets false. */
    visible: boolean;
    /** Label override from the published field (`field.label`); null = use generic context. */
    label: string | null;
};

/** The fixed compact-row slots the `CondensedQueueRow` renders (see anatomy in that file). */
export type CompactRowSlots = {
    subject: CompactRowSlotConfig;
    status: CompactRowSlotConfig;
    contact: CompactRowSlotConfig;
    attention: CompactRowSlotConfig;
    work: CompactRowSlotConfig;
    groupCount: CompactRowSlotConfig;
};

/** Resolved compact-row config + the list of slots that fell back to generic context. */
export type CompactRowConfig = {
    slots: CompactRowSlots;
    /** Slots with NO published field mapped (fell back to generic-context behavior). */
    fallbackSlots: (keyof CompactRowSlots)[];
};

/** Compact slot → published fieldKey(s), first present wins for the label override. */
const SLOT_FIELD_KEYS: Record<keyof CompactRowSlots, readonly string[]> = {
    subject: ["customer.display_name", "queue_row.subject_label"],
    status: ["opportunity.status_label", "queue_row.stage_label"],
    contact: ["person.primary_contact_name"],
    attention: ["opportunity.attention_reason"],
    work: ["queue_row.work_summary", "queue_row.next_best_action_label"],
    groupCount: ["queue_row.group_count_label"],
} as const;

const SLOT_KEYS = Object.keys(SLOT_FIELD_KEYS) as (keyof CompactRowSlots)[];

/**
 * THE vocabulary of published field keys the compact CondensedQueueRow can actually render
 * (flattened from SLOT_FIELD_KEYS). A published field whose key is not in this set is NOT
 * runtime-effective in the compact row — the Queue Row Builder marks it so operators aren't misled
 * into publishing a silent no-op. Single source of truth for both the runtime mapper and the builder.
 */
export const COMPACT_ROW_EFFECTIVE_FIELD_KEYS: ReadonlySet<string> = new Set(
    Object.values(SLOT_FIELD_KEYS).flat(),
);

/**
 * The compact slot a published field key feeds, or null when the key does NOT render in the compact
 * CondensedQueueRow. Deterministic + total (never throws). Used by the runtime mapper AND the
 * builder's effective/disabled annotation so both share one vocabulary — no silent fallback.
 */
export function compactSlotForFieldKey(fieldKey: string): keyof CompactRowSlots | null {
    const key = (fieldKey ?? "").trim();
    if (!key) return null;
    for (const slot of SLOT_KEYS) {
        if (SLOT_FIELD_KEYS[slot].includes(key)) return slot;
    }
    return null;
}

/** True when a published field key renders in the compact row (i.e. maps to a slot). */
export function isCompactRowEffectiveFieldKey(fieldKey: string): boolean {
    return compactSlotForFieldKey(fieldKey) != null;
}

/** Flatten every field-group / repeated-record field in the v3 config to a keyed lookup. */
function fieldsByKey(config: QueueRecordLayoutConfigV3): Map<string, QueueRecordFieldConfig> {
    const map = new Map<string, QueueRecordFieldConfig>();
    for (const column of config.columns) {
        for (const block of column.blocks) {
            if (block.type !== "field_group" && block.type !== "repeated_record_block") continue;
            for (const field of block.fields) {
                const key = field.fieldKey.trim();
                // First occurrence wins — a slot's label override is stable regardless of
                // where the field appears in the (server-owned) column ordering.
                if (key && !map.has(key)) map.set(key, field);
            }
        }
    }
    return map;
}

/** A generic-context slot: visible, no label override (the row uses its frozen context). */
function genericSlot(): CompactRowSlotConfig {
    return { visible: true, label: null };
}

/**
 * Map a published Queue Row surface config onto the compact row's fixed slots.
 *
 * Pure + unit-testable. Null config (unpublished / fetch failed) → all slots generic
 * (visible, no override). Present mapped field → visible + label override. Absent field →
 * generic fallback (recorded in `fallbackSlots`). See the file doc comment for the full
 * slot↔fieldKey mapping and visibility rule.
 */
export function mapQueueRowSurfaceToCompactConfig(
    config: QueueRecordLayoutConfigV3 | null,
): CompactRowConfig {
    if (!config) {
        return {
            slots: {
                subject: genericSlot(),
                status: genericSlot(),
                contact: genericSlot(),
                attention: genericSlot(),
                work: genericSlot(),
                groupCount: genericSlot(),
            },
            fallbackSlots: [...SLOT_KEYS],
        };
    }

    const byKey = fieldsByKey(config);
    const slots = {} as CompactRowSlots;
    const fallbackSlots: (keyof CompactRowSlots)[] = [];

    for (const slot of SLOT_KEYS) {
        const field = SLOT_FIELD_KEYS[slot]
            .map((key) => byKey.get(key))
            .find((f): f is QueueRecordFieldConfig => f != null);
        if (!field) {
            // No published field for this slot → generic-context fallback (never a hide).
            slots[slot] = genericSlot();
            fallbackSlots.push(slot);
            continue;
        }
        // Present field: visible (record-conditional `visibleWhen` is deferred to the row's
        // own context, not evaluated here), label from the published field when set.
        const label = typeof field.label === "string" ? field.label.trim() || null : null;
        slots[slot] = { visible: true, label };
    }

    return { slots, fallbackSlots };
}
