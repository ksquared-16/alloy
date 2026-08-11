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
 * When a published config is present:
 *   - Mapped field(s) → slot.visible=true + fieldKeys (builder / SLOT vocabulary order).
 *   - No mapped field → slot.visible=false (published config is authoritative — do NOT fall
 *     back to hardcoded contact/work/children defaults that re-show removed fields).
 * When config is null (unpublished / fetch failed) → ALL slots visible via generic-context
 * fallback (`fallbackSlots` lists every slot).
 */

import type {
    QueueRecordFieldConfig,
    QueueRecordLayoutConfigV3,
    QueueRecordNameDisplay,
} from "@/lib/layout/queueRecordLayoutV3";
import { compactSlotForCanvasRegion, type CanvasAnatomyRegion } from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import type { CollectionFieldPresentationConfig } from "@/lib/presentation/collectionFieldPresentation";
import { collectionPresentationForFieldKey } from "@/lib/presentation/collectionFieldPresentation";

/** One compact-anatomy slot's resolved config: whether to render it + configured field keys. */
export type CompactRowSlotConfig = {
    /** Render this slot. Absent/null config → true. Only an explicit config hide sets false. */
    visible: boolean;
    /**
     * Builder metadata — operator field labels for preview/debug. NOT rendered as slot values;
     * runtime display comes from {@link fieldKeys} via `resolveCompactSlotDisplay`.
     */
    label: string | null;
    /** Published field refKeys assigned to this slot (builder canvas order). */
    fieldKeys?: readonly string[];
    /** Per-field name display overrides keyed by field refKey. */
    nameDisplayByFieldKey?: Readonly<Partial<Record<string, QueueRecordNameDisplay>>>;
    /** Per-field collection presentation overrides keyed by field refKey. */
    collectionPresentationByFieldKey?: Readonly<Partial<Record<string, CollectionFieldPresentationConfig>>>;
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
    /**
     * Published field keys that are NOT compact-row effective — older invalid saved configs.
     * Runtime surfaces these as an explicit diagnostic rather than silently omitting content.
     */
    ineffectiveFieldKeys: string[];
};

/** Person contact refKeys — render on the compact row contact line (line 2). */
export const QUEUE_ROW_PERSON_CONTACT_FIELD_KEYS = [
    "person.primary_contact_name",
    "person.phone",
    "person.email",
    // Legacy authored aliases — older published surfaces used the `primary_` prefixed names. Accepted so an
    // authored contact field never silently disappears; they resolve to the same primary_contact values.
    "person.primary_phone",
    "person.primary_email",
] as const;

export function isQueueRowPersonContactFieldKey(fieldKey: string): boolean {
    return (QUEUE_ROW_PERSON_CONTACT_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}

/** Compact slot → published fieldKey(s); builder canvas order wins when present. */
const SLOT_FIELD_KEYS: Record<keyof CompactRowSlots, readonly string[]> = {
    subject: ["customer.display_name", "queue_row.subject_label"],
    status: [
        "opportunity.status_label",
        "queue_row.stage_label",
        "queue_row.operational_age",
        "opportunity.days_in_stage",
    ],
    contact: [...QUEUE_ROW_PERSON_CONTACT_FIELD_KEYS],
    attention: ["opportunity.attention_reason"],
    work: [
        "queue_row.work_summary",
        "queue_row.next_best_action_label",
        "opportunity.next_step",
    ],
    groupCount: [
        "queue_row.group_count_label",
        "child.name",
        "children",
        "children.count",
        "children.names",
        "children.summary",
        "inquiry_child.program",
        "child.program",
        "inquiry_child.schedule_type",
        "child.room",
        // Waitlist Secondary band — position + wait-since belong with Program, not the status pill.
        "waitlist.positionLabel",
        "waitlist.waitSince",
    ],
} as const;

const SLOT_KEYS = Object.keys(SLOT_FIELD_KEYS) as (keyof CompactRowSlots)[];

/**
 * Authored aliases that resolve to the same compact slot as a canonical key.
 * Family/case-grain Program labels historically used program_category(_id); compact
 * vocabulary owns `inquiry_child.program` for the aggregate projection.
 */
const COMPACT_ROW_FIELD_KEY_ALIASES: Readonly<Record<string, string>> = {
    "inquiry_child.program_category": "inquiry_child.program",
    "inquiry_child.program_category_id": "inquiry_child.program",
    "child.program": "inquiry_child.program",
};

/**
 * THE vocabulary of published field keys the compact CondensedQueueRow can actually render
 * (flattened from SLOT_FIELD_KEYS). A published field whose key is not in this set is NOT
 * runtime-effective in the compact row — the Queue Row Builder marks it so operators aren't misled
 * into publishing a silent no-op. Single source of truth for both the runtime mapper and the builder.
 */
export const COMPACT_ROW_EFFECTIVE_FIELD_KEYS: ReadonlySet<string> = new Set(
    Object.values(SLOT_FIELD_KEYS).flat(),
);

/** Canonical compact key for an authored field (aliases → vocabulary member). */
export function canonicalizeCompactRowFieldKey(fieldKey: string): string {
    const key = (fieldKey ?? "").trim();
    if (!key) return "";
    return COMPACT_ROW_FIELD_KEY_ALIASES[key] ?? key;
}

/**
 * The compact slot a published field key feeds, or null when the key does NOT render in the compact
 * CondensedQueueRow. Deterministic + total (never throws). Used by the runtime mapper AND the
 * builder's effective/disabled annotation so both share one vocabulary — no silent fallback.
 */
export function compactSlotForFieldKey(fieldKey: string): keyof CompactRowSlots | null {
    const key = canonicalizeCompactRowFieldKey(fieldKey);
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
                const canonical = canonicalizeCompactRowFieldKey(key);
                if (canonical && canonical !== key && !map.has(canonical)) map.set(canonical, field);
            }
        }
    }
    return map;
}


function slotsFromBuilderAssignment(
    config: QueueRecordLayoutConfigV3,
): Partial<Record<keyof CompactRowSlots, CompactRowSlotConfig>> {
    const assigned: Partial<Record<keyof CompactRowSlots, CompactRowSlotConfig>> = {};
    const labelsBySlot = new Map<keyof CompactRowSlots, string[]>();
    const keysBySlot = new Map<keyof CompactRowSlots, string[]>();
    const nameDisplayBySlot = new Map<keyof CompactRowSlots, Record<string, QueueRecordNameDisplay>>();
    const collectionPresentationBySlot = new Map<
        keyof CompactRowSlots,
        Record<string, CollectionFieldPresentationConfig>
    >();

    const sortedColumns = [...config.columns].sort(
        (a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0),
    );

    for (const column of sortedColumns) {
        const builderSlot = column.builderSlot as CanvasAnatomyRegion | undefined;
        if (!builderSlot) continue;
        const compactSlot = compactSlotForCanvasRegion(builderSlot);

        for (const block of column.blocks) {
            if (block.type !== "field_group" && block.type !== "repeated_record_block") continue;
            for (const field of block.fields) {
                const fieldKey = field.fieldKey.trim();
                if (!fieldKey) continue;
                const keys = keysBySlot.get(compactSlot) ?? [];
                if (!keys.includes(fieldKey)) keys.push(fieldKey);
                keysBySlot.set(compactSlot, keys);

                if (field.nameDisplay) {
                    const nameDisplay = nameDisplayBySlot.get(compactSlot) ?? {};
                    nameDisplay[fieldKey] = field.nameDisplay;
                    nameDisplayBySlot.set(compactSlot, nameDisplay);
                }

                const derivedPresentation = collectionPresentationForFieldKey(fieldKey, {
                    collectionPresentation: field.collectionPresentation,
                    nameDisplay: field.nameDisplay,
                });
                if (derivedPresentation) {
                    const collectionPresentation = collectionPresentationBySlot.get(compactSlot) ?? {};
                    collectionPresentation[fieldKey] = derivedPresentation;
                    collectionPresentationBySlot.set(compactSlot, collectionPresentation);
                } else if (field.collectionPresentation) {
                    const collectionPresentation = collectionPresentationBySlot.get(compactSlot) ?? {};
                    collectionPresentation[fieldKey] = field.collectionPresentation;
                    collectionPresentationBySlot.set(compactSlot, collectionPresentation);
                }

                const label = typeof field.label === "string" ? field.label.trim() : "";
                if (!label) continue;
                const existing = labelsBySlot.get(compactSlot) ?? [];
                if (field.inlineWithPrevious && existing.length > 0) {
                    existing[existing.length - 1] = `${existing[existing.length - 1]} · ${label}`;
                } else {
                    existing.push(label);
                }
                labelsBySlot.set(compactSlot, existing);
            }
        }
    }

    for (const [slot, fieldKeys] of keysBySlot) {
        const nameDisplayByFieldKey = nameDisplayBySlot.get(slot);
        const collectionPresentationByFieldKey = collectionPresentationBySlot.get(slot);
        assigned[slot] = {
            visible: true,
            label: labelsBySlot.get(slot)?.join(" · ") || null,
            fieldKeys,
            ...(nameDisplayByFieldKey && Object.keys(nameDisplayByFieldKey).length > 0
                ? { nameDisplayByFieldKey }
                : {}),
            ...(collectionPresentationByFieldKey && Object.keys(collectionPresentationByFieldKey).length > 0
                ? { collectionPresentationByFieldKey }
                : {}),
        };
    }
    return assigned;
}

/**
 * Person contact fields belong on the contact line even when the builder placed them on
 * identity (Primary) or groupCount (Secondary). Children / household keys stay on their slot.
 */
function routePersonContactFieldsToContactSlot(slots: CompactRowSlots): CompactRowSlots {
    const routedKeys: string[] = [];
    const routedLabels: string[] = [];
    const routedNameDisplay: Record<string, QueueRecordNameDisplay> = {};
    const next = { ...slots } as CompactRowSlots;

    for (const slot of SLOT_KEYS) {
        if (slot === "contact") continue;
        const config = next[slot];
        const fieldKeys = config.fieldKeys;
        if (!fieldKeys?.length) continue;

        const contactKeys = fieldKeys.filter((key) => isQueueRowPersonContactFieldKey(key));
        if (!contactKeys.length) continue;

        const remaining = fieldKeys.filter((key) => !isQueueRowPersonContactFieldKey(key));
        routedKeys.push(...contactKeys);

        if (config.label) {
            for (const key of contactKeys) {
                const token = config.label.split(" · ").find((part) => part.trim().length > 0);
                if (token && !routedLabels.includes(token)) routedLabels.push(token);
            }
        }
        for (const key of contactKeys) {
            const nd = config.nameDisplayByFieldKey?.[key];
            if (nd) routedNameDisplay[key] = nd;
        }

        next[slot] = {
            ...config,
            fieldKeys: remaining.length > 0 ? remaining : undefined,
            ...(remaining.length > 0
                ? {}
                : {
                      visible: false,
                      label: null,
                      nameDisplayByFieldKey: undefined,
                      collectionPresentationByFieldKey: undefined,
                  }),
        };
    }

    if (!routedKeys.length) return slots;

    const existingKeys = next.contact.fieldKeys ?? [];
    const mergedKeys = [...existingKeys];
    for (const key of routedKeys) {
        if (!mergedKeys.includes(key)) mergedKeys.push(key);
    }

    const mergedNameDisplay = {
        ...(next.contact.nameDisplayByFieldKey ?? {}),
        ...routedNameDisplay,
    };

    next.contact = {
        ...next.contact,
        visible: true,
        fieldKeys: mergedKeys,
        label:
            [next.contact.label, routedLabels.join(" · ")].filter(Boolean).join(" · ").trim() || null,
        ...(Object.keys(mergedNameDisplay).length > 0 ? { nameDisplayByFieldKey: mergedNameDisplay } : {}),
    };

    return next;
}

function slotConfigFromPublishedFields(
    slot: keyof CompactRowSlots,
    fields: QueueRecordFieldConfig[],
): CompactRowSlotConfig {
    const fieldKeys = fields.map((f) => f.fieldKey.trim()).filter(Boolean);
    const labels = fields
        .map((f) => (typeof f.label === "string" ? f.label.trim() : ""))
        .filter(Boolean);
    const nameDisplayByFieldKey: Record<string, QueueRecordNameDisplay> = {};
    const collectionPresentationByFieldKey: Record<string, CollectionFieldPresentationConfig> = {};
    for (const field of fields) {
        const key = field.fieldKey.trim();
        if (field.nameDisplay) nameDisplayByFieldKey[key] = field.nameDisplay;
        const derived = collectionPresentationForFieldKey(key, {
            collectionPresentation: field.collectionPresentation,
            nameDisplay: field.nameDisplay,
        });
        if (derived) collectionPresentationByFieldKey[key] = derived;
    }
    return {
        visible: true,
        label: labels.length > 0 ? labels.join(" · ") : null,
        fieldKeys,
        ...(Object.keys(nameDisplayByFieldKey).length > 0 ? { nameDisplayByFieldKey } : {}),
        ...(Object.keys(collectionPresentationByFieldKey).length > 0 ? { collectionPresentationByFieldKey } : {}),
    };
}

/** A generic-context slot: visible, no label override (the row uses its frozen context). */
function genericSlot(): CompactRowSlotConfig {
    return { visible: true, label: null };
}

/** Published config omitted this slot — hide it (do not reintroduce hardcoded defaults). */
function hiddenSlot(): CompactRowSlotConfig {
    return { visible: false, label: null };
}

function slotHasFieldKeys(slot: CompactRowSlotConfig | undefined): boolean {
    return Boolean(slot?.fieldKeys && slot.fieldKeys.length > 0);
}

/**
 * After contact routing (and any other remaps), slots with no remaining fieldKeys must be
 * hidden. Leaving them visible:true with empty keys let CondensedQueueRow fall through to
 * defaultSlotDisplay (Lead Status / contact-line defaults) — forbidden under published authority.
 */
export function finalizePublishedCompactSlots(slots: CompactRowSlots): CompactRowSlots {
    const next = { ...slots } as CompactRowSlots;
    for (const key of SLOT_KEYS) {
        if (!slotHasFieldKeys(next[key])) {
            next[key] = hiddenSlot();
        }
    }
    return next;
}

/**
 * True when compact slots came from a published surface (any fieldKeys or explicit hides),
 * not the all-generic null-config fallback.
 */
export function compactSlotsUsePublishedAuthority(slots: CompactRowSlots | null | undefined): boolean {
    if (!slots) return false;
    for (const key of SLOT_KEYS) {
        const slot = slots[key];
        if (!slot) continue;
        if (slot.visible === false) return true;
        if (slotHasFieldKeys(slot)) return true;
    }
    return false;
}

/**
 * Map a published Queue Row surface config onto the compact row's fixed slots.
 *
 * Pure + unit-testable. Null config (unpublished / fetch failed) → all slots generic
 * (visible, no override). Present mapped field → visible + fieldKeys. Absent field on a
 * published config → hidden (authoritative). See the file doc comment for the mapping.
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
            ineffectiveFieldKeys: [],
        };
    }

    const byKey = fieldsByKey(config);
    const operatorAssigned = slotsFromBuilderAssignment(config);
    const slots = {} as CompactRowSlots;
    const fallbackSlots: (keyof CompactRowSlots)[] = [];
    const ineffectiveFieldKeys: string[] = [];

    for (const [, field] of byKey) {
        const key = field.fieldKey.trim();
        if (key && !isCompactRowEffectiveFieldKey(key) && !ineffectiveFieldKeys.includes(key)) {
            ineffectiveFieldKeys.push(key);
        }
    }

    for (const slot of SLOT_KEYS) {
        const operatorSlot = operatorAssigned[slot];
        if (operatorSlot) {
            slots[slot] = operatorSlot;
            continue;
        }
        const mappedFields = SLOT_FIELD_KEYS[slot]
            .map((key) => byKey.get(key))
            .filter((f): f is QueueRecordFieldConfig => f != null);
        if (!mappedFields.length) {
            // Published config with no field for this slot → hide (never generic email/work fallback).
            slots[slot] = hiddenSlot();
            continue;
        }
        // Preserve all mapped published fields in SLOT_FIELD_KEYS order (not first-key-only).
        slots[slot] = slotConfigFromPublishedFields(slot, mappedFields);
    }

    return {
        slots: finalizePublishedCompactSlots(routePersonContactFieldsToContactSlot(slots)),
        fallbackSlots,
        ineffectiveFieldKeys: ineffectiveFieldKeys.sort(),
    };
}
