/** @vitest-environment jsdom */

/**
 * Phase 3 — inline Add Field on the Queue Row edit canvas.
 *
 * Proves the section-anchored "Add field" flow end to end, reusing the existing
 * composition model (no new persistence):
 *   1. the section overlay picker lists a section's not-yet-added fields and picking
 *      one calls back with (blockId, fieldKey)  [add field from section overlay]
 *   2. tenant custom fields carry isSystemField=false and are marked accordingly
 *   3. enabling a field then rebuilding the config includes it in the persisted payload
 *   4. that built config maps onto the runtime compact slots (runtime reflects the field)
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
    AddFieldPicker,
    buildCatalog,
    stateFromConfig,
    buildConfigFromState,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const catalog = buildCatalog(false);

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
});

/** A person-namespaced tenant custom field — accepted by the household section. */
const CUSTOM: TenantFieldDefinitionRow[] = [
    { field_key: "preferred_language", label: "Preferred Language", entity_type: "person", field_type: "text", is_system: false, is_active: true },
];

/** The status zone with its stage_disposition section, custom fields merged in. */
function statusZone(tenant?: TenantFieldDefinitionRow[]) {
    const zones = stateFromConfig(defaultLeadQueueLayoutV3(), catalog, false, tenant);
    return zones.find((z) => z.key === "status")!;
}

/** Household zone with the person-namespaced custom field merged in (guaranteed addable). */
function householdWithCustom() {
    return stateFromConfig(defaultLeadQueueLayoutV3(), catalog, false, CUSTOM).find(
        (z) => z.key === "household",
    )!;
}

describe("Phase 3 — AddFieldPicker (section overlay)", () => {
    it("lists a section's NOT-yet-added fields and omits already-added ones", () => {
        const zone = householdWithCustom();
        // The custom field is available-but-not-yet-on → addable; a default field is on.
        const group = zone.evidenceGroups.find((g) =>
            g.fields.some((f) => f.fieldKey === "person.preferred_language"),
        )!;
        const enabled = group.fields.find((f) => f.enabled);

        const el = render(<AddFieldPicker zone={zone} onPick={vi.fn()} onClose={vi.fn()} />);
        const options = Array.from(el.querySelectorAll("[data-add-field-option]")).map(
            (n) => n.getAttribute("data-add-field-option"),
        );
        expect(options).toContain("person.preferred_language"); // addable
        if (enabled) expect(options).not.toContain(enabled.fieldKey); // already-added omitted
    });

    it("picking a field calls back with (blockId, fieldKey)", () => {
        const zone = householdWithCustom();
        const group = zone.evidenceGroups.find((g) =>
            g.fields.some((f) => f.fieldKey === "person.preferred_language"),
        )!;
        const onPick = vi.fn();

        const el = render(<AddFieldPicker zone={zone} onPick={onPick} onClose={vi.fn()} />);
        const btn = el.querySelector<HTMLButtonElement>(
            '[data-add-field-option="person.preferred_language"]',
        )!;
        act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(onPick).toHaveBeenCalledWith(group.blockId, "person.preferred_language");
    });

    it("marks a tenant custom field with data-add-field-custom", () => {
        const household = householdWithCustom();
        const el = render(<AddFieldPicker zone={household} onPick={vi.fn()} onClose={vi.fn()} />);
        const custom = el.querySelector('[data-add-field-option="person.preferred_language"]');
        expect(custom).not.toBeNull();
        expect(custom!.getAttribute("data-add-field-custom")).toBe("true");
        // sanity: the zone actually flags it as a non-system field
        const flagged = household.evidenceGroups
            .flatMap((g) => g.fields)
            .find((f) => f.fieldKey === "person.preferred_language");
        expect(flagged?.isSystemField).toBe(false);
    });
});

describe("Phase 3 — add field persists + runtime reflects it", () => {
    /** Mimic the builder's toggleField(zoneKey, blockId, fieldKey) enabling a field. */
    function enableField(zones: ReturnType<typeof statusZone>[], zoneKey: string, blockId: string, fieldKey: string) {
        return zones.map((z) =>
            z.key !== zoneKey ? z : {
                ...z,
                evidenceGroups: z.evidenceGroups.map((g) =>
                    g.blockId !== blockId ? g : {
                        ...g,
                        fields: g.fields.map((f) => (f.fieldKey === fieldKey ? { ...f, enabled: true } : f)),
                    },
                ),
            },
        );
    }

    /** Flip a set of field keys across ALL sections of a zone (mimics toggleField ×N). */
    function setFields(zones: ReturnType<typeof statusZone>[], zoneKey: string, keys: string[], enabled: boolean) {
        const set = new Set(keys);
        return zones.map((z) =>
            z.key !== zoneKey ? z : {
                ...z,
                evidenceGroups: z.evidenceGroups.map((g) => ({
                    ...g,
                    fields: g.fields.map((f) => (set.has(f.fieldKey) ? { ...f, enabled } : f)),
                })),
            },
        );
    }

    it("built config payload includes a newly added (tenant custom) field", () => {
        const base = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(base, catalog, false, CUSTOM);
        const household = zones.find((z) => z.key === "household")!;
        const group = household.evidenceGroups.find((g) =>
            g.fields.some((f) => f.fieldKey === "person.preferred_language"),
        )!;

        // Before add: the custom field is not persisted.
        const before = buildConfigFromState(base, zones, catalog);
        const beforeKeys = before.columns
            .find((c) => c.width === "identity")!
            .blocks.flatMap((b) => (b.type === "field_group" ? b.fields.map((f) => f.fieldKey) : []));
        expect(beforeKeys).not.toContain("person.preferred_language");

        // Add it, rebuild → now persisted in the identity column via the existing model.
        const next = enableField(zones, "household", group.blockId, "person.preferred_language");
        const after = buildConfigFromState(base, next, catalog);
        const afterKeys = after.columns
            .find((c) => c.width === "identity")!
            .blocks.flatMap((b) => (b.type === "field_group" ? b.fields.map((f) => f.fieldKey) : []));
        expect(afterKeys).toContain("person.preferred_language");
    });

    it("runtime mapped config reflects add/remove of slot-mapped fields (status)", () => {
        const base = defaultLeadQueueLayoutV3();
        const zones = stateFromConfig(base, catalog, false);
        // Both keys map to the compact `status` slot (SLOT_FIELD_KEYS.status).
        const STATUS_KEYS = ["opportunity.status_label", "queue_row.stage_label"];

        // Remove BOTH status-slot fields → mapper falls the status slot back to generic context.
        const removed = buildConfigFromState(base, setFields(zones, "status", STATUS_KEYS, false), catalog);
        expect(mapQueueRowSurfaceToCompactConfig(removed).fallbackSlots).toContain("status");

        // Re-add them → the published field now drives the status slot (not a fallback).
        const added = buildConfigFromState(base, setFields(zones, "status", STATUS_KEYS, true), catalog);
        const addedKeys = added.columns
            .find((c) => c.width === "status_band")!
            .blocks.flatMap((b) => (b.type === "field_group" ? b.fields.map((f) => f.fieldKey) : []));
        expect(addedKeys).toContain("opportunity.status_label");
        const addedMap = mapQueueRowSurfaceToCompactConfig(added);
        expect(addedMap.fallbackSlots).not.toContain("status");
        expect(addedMap.slots.status.visible).toBe(true);
    });
});
